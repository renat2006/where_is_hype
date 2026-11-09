"""OpenRouter API client for multimodal video place extraction."""

from __future__ import annotations

import base64
import os
import re
import time
from pathlib import Path
from typing import Any

import httpx
from pydantic import ValidationError

from extractlab.gemini_client import (
    DEFAULT_PRICING_PATH,
    DEFAULT_PROMPT_PATH,
    MAX_INLINE_VIDEO_BYTES,
    ClientExtractionResponse,
    ExtractClientProtocol,
    FakeExtractClient,
    GeminiExtractClient,
    build_user_prompt,
    calculate_cost_usd,
    load_system_prompt,
)
from extractlab.models import Extraction, TokenUsage

DEFAULT_PROVIDER = "openrouter"
SUPPORTED_PROVIDERS = ("openrouter", "gemini", "fake")
DEFAULT_OPENROUTER_MODEL = "google/gemini-3.5-flash-lite"
DEFAULT_OPENROUTER_KEY_FILE = "~/.openrouter_key"
OPENROUTER_CHAT_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions"

DEFAULT_TIMEOUT_SEC = 60.0
DEFAULT_CONNECT_TIMEOUT_SEC = 15.0
DEFAULT_MAX_RETRIES = 2
DEFAULT_RETRY_BACKOFF_SEC = 0.5
DEFAULT_MAX_JSON_RETRIES = 1

_FENCED_JSON_RE = re.compile(r"```(?:json)?\s*(\{.*?\})\s*```", re.DOTALL | re.IGNORECASE)

_SCHEMA_INSTRUCTION_FOOTER = """
Верни ТОЛЬКО валидный JSON-объект по схеме Extraction (без координат lat/lon):
{
  "items": [
    {
      "name": "Название места",
      "aliases": [],
      "category": "cafe|coffee|restaurant|bar|bakery|museum|gallery|park|cluster|event|other",
      "address_raw": null,
      "metro_hint": null,
      "landmark_hint": null,
      "city": "Москва",
      "evidence": "speech|on_screen_text|caption|visual",
      "quote": null,
      "timecode_sec": null,
      "confidence": 0.8
    }
  ],
  "video_has_multiple_places": false,
  "resolution_hint": "exact|multiple_places|chain_without_address|event|insufficient_data",
  "notes": null
}
""".strip()


class OpenRouterError(RuntimeError):
    """Raised when OpenRouter API fails after retries or returns an unrecoverable error."""


def resolve_provider(provider: str | None = None, *, fake: bool = False) -> str:
    """Resolve extraction provider from explicit arg, `--fake`, or `EXTRACT_PROVIDER` env var."""
    if fake:
        return "fake"
    raw = (provider or os.environ.get("EXTRACT_PROVIDER") or DEFAULT_PROVIDER).strip().lower()
    resolved = raw or DEFAULT_PROVIDER
    if resolved not in SUPPORTED_PROVIDERS:
        supported = ", ".join(SUPPORTED_PROVIDERS)
        raise ValueError(f"Unsupported provider '{resolved}'. Expected one of: {supported}")
    return resolved


def resolve_openrouter_model(model: str | None = None) -> str:
    """Resolve OpenRouter model name from explicit arg or `EXTRACT_MODEL` env var."""
    raw = (
        model
        or os.environ.get("EXTRACT_MODEL")
        or os.environ.get("OPENROUTER_MODEL")
        or DEFAULT_OPENROUTER_MODEL
    ).strip()
    return raw or DEFAULT_OPENROUTER_MODEL


def resolve_openrouter_api_key(
    api_key: str | None = None,
    api_key_file: Path | str | None = None,
) -> str:
    """Resolve OpenRouter API key from explicit arg, `OPENROUTER_API_KEY`, or key file.

    Never prints or includes the secret value in error messages.
    """
    if api_key and api_key.strip():
        return api_key.strip()

    env_key = (os.environ.get("OPENROUTER_API_KEY") or "").strip()
    if env_key:
        return env_key

    raw_file = (
        str(api_key_file)
        if api_key_file is not None
        else (os.environ.get("OPENROUTER_API_KEY_FILE") or DEFAULT_OPENROUTER_KEY_FILE)
    ).strip()
    if raw_file:
        key_path = Path(raw_file).expanduser()
        if key_path.is_file():
            file_key = key_path.read_text(encoding="utf-8").strip()
            if file_key:
                return file_key

    raise ValueError(
        "OpenRouter API key is not configured. Set OPENROUTER_API_KEY, "
        f"provide a key file at OPENROUTER_API_KEY_FILE (default {DEFAULT_OPENROUTER_KEY_FILE}), "
        "or use EXTRACT_PROVIDER=fake / --fake for offline mode."
    )


def has_openrouter_api_key(
    api_key: str | None = None,
    api_key_file: Path | str | None = None,
) -> bool:
    """Return True if an OpenRouter API key can be resolved from env or key file."""
    try:
        resolve_openrouter_api_key(api_key=api_key, api_key_file=api_key_file)
    except ValueError:
        return False
    return True


def resolve_proxy_url(proxy: str | None = None) -> str | None:
    """Resolve HTTPS or SOCKS proxy URL from explicit arg or `HTTPS_PROXY`/`ALL_PROXY`."""
    candidates = (
        proxy,
        os.environ.get("HTTPS_PROXY"),
        os.environ.get("https_proxy"),
        os.environ.get("ALL_PROXY"),
    )
    for item in candidates:
        if item and item.strip():
            return item.strip()
    return None


def build_extraction_response_format() -> dict[str, Any]:
    """Build OpenRouter / OpenAI compatible `response_format` with `json_schema`."""
    return {
        "type": "json_schema",
        "json_schema": {
            "name": "Extraction",
            "strict": True,
            "schema": Extraction.model_json_schema(),
        },
    }


def build_openrouter_text_prompt(
    *,
    caption: str,
    url: str | None = None,
    prompt_path: Path | None = None,
) -> str:
    """Combine Russian system prompt, user caption/URL, and schema format reminder."""
    system_prompt = load_system_prompt(prompt_path)
    user_prompt = build_user_prompt(caption=caption, url=url)
    return f"{system_prompt}\n\n---\n\n{user_prompt}\n\n{_SCHEMA_INSTRUCTION_FOOTER}"


def extract_json_text(raw_text: str) -> str:
    """Extract a JSON object string from plain text or markdown ```json fences."""
    stripped = raw_text.strip()
    if not stripped:
        raise ValueError("Empty response content from OpenRouter")

    fenced_match = _FENCED_JSON_RE.search(stripped)
    if fenced_match:
        return fenced_match.group(1).strip()

    if stripped.startswith("{") and stripped.endswith("}"):
        return stripped

    first_brace = stripped.find("{")
    last_brace = stripped.rfind("}")
    if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
        return stripped[first_brace : last_brace + 1].strip()

    raise ValueError("Could not locate JSON object in model response text")


def parse_extraction_from_text(raw_text: str) -> Extraction:
    """Extract and validate an `Extraction` Pydantic model from raw response text."""
    json_str = extract_json_text(raw_text)
    return Extraction.model_validate_json(json_str)


def _effective_response_status(response: httpx.Response) -> int:
    status = response.status_code
    if 200 <= status < 300 and '"error"' in response.text:
        try:
            body_json = response.json()
            if isinstance(body_json, dict) and isinstance(body_json.get("error"), dict):
                raw_code = body_json["error"].get("code")
                if isinstance(raw_code, int):
                    return raw_code
        except ValueError:
            pass
    return status


def _extract_message_text(response_data: dict[str, Any]) -> str:
    choices = response_data.get("choices")
    if not isinstance(choices, list) or not choices:
        raise ValueError("OpenRouter response does not contain non-empty 'choices'")

    first_choice = choices[0]
    if not isinstance(first_choice, dict):
        raise ValueError("OpenRouter choice entry is not an object")

    message = first_choice.get("message")
    if not isinstance(message, dict):
        raise ValueError("OpenRouter choice does not contain 'message'")

    content = message.get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, dict) and isinstance(block.get("text"), str):
                parts.append(block["text"])
        return "\n".join(parts)

    raise ValueError("OpenRouter message content is empty or has unsupported type")


def extract_openrouter_usage_and_cost(
    response_data: dict[str, Any],
    *,
    model: str,
    pricing_path: Path | None = None,
) -> tuple[TokenUsage, float]:
    """Extract `TokenUsage` and `cost_usd` from OpenRouter `usage` (fallback to `pricing.json`)."""
    usage_raw = response_data.get("usage")
    usage_dict: dict[str, Any] = usage_raw if isinstance(usage_raw, dict) else {}

    prompt_tokens = int(usage_dict.get("prompt_tokens") or usage_dict.get("input_tokens") or 0)
    candidates_tokens = int(
        usage_dict.get("completion_tokens")
        or usage_dict.get("candidates_tokens")
        or usage_dict.get("output_tokens")
        or 0
    )

    prompt_details_raw = usage_dict.get("prompt_tokens_details")
    prompt_details = prompt_details_raw if isinstance(prompt_details_raw, dict) else {}
    completion_details_raw = usage_dict.get("completion_tokens_details")
    completion_details = completion_details_raw if isinstance(completion_details_raw, dict) else {}

    cached_tokens = int(prompt_details.get("cached_tokens") or usage_dict.get("cached_tokens") or 0)
    thoughts_tokens = int(
        completion_details.get("reasoning_tokens") or usage_dict.get("thoughts_tokens") or 0
    )
    total_tokens = int(
        usage_dict.get("total_tokens") or (prompt_tokens + candidates_tokens + thoughts_tokens)
    )

    token_usage = TokenUsage(
        prompt_tokens=max(0, prompt_tokens),
        candidates_tokens=max(0, candidates_tokens),
        thoughts_tokens=max(0, thoughts_tokens),
        cached_tokens=max(0, cached_tokens),
        total_tokens=max(0, total_tokens),
    )

    raw_cost = usage_dict.get("cost")
    if raw_cost is None:
        raw_cost = response_data.get("cost")
    if raw_cost is None:
        raw_cost = usage_dict.get("total_cost")

    if raw_cost is not None:
        try:
            cost_usd = round(max(0.0, float(raw_cost)), 6)
            return token_usage, cost_usd
        except (TypeError, ValueError):
            pass

    fallback_cost = calculate_cost_usd(model, token_usage, pricing_path)
    return token_usage, fallback_cost


class OpenRouterExtractClient:
    """OpenRouter multimodal client for video place extraction via Chat Completions API."""

    def __init__(
        self,
        *,
        api_key: str | None = None,
        api_key_file: Path | str | None = None,
        model: str | None = None,
        proxy: str | None = None,
        https_proxy: str | None = None,
        base_url: str = OPENROUTER_CHAT_COMPLETIONS_URL,
        timeout: float = DEFAULT_TIMEOUT_SEC,
        connect_timeout: float = DEFAULT_CONNECT_TIMEOUT_SEC,
        max_retries: int = DEFAULT_MAX_RETRIES,
        retry_backoff_sec: float = DEFAULT_RETRY_BACKOFF_SEC,
        max_json_retries: int = DEFAULT_MAX_JSON_RETRIES,
        use_json_schema: bool = True,
        pricing_path: Path | None = None,
        prompt_path: Path | None = None,
        http_client: httpx.Client | None = None,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self.api_key: str = resolve_openrouter_api_key(api_key=api_key, api_key_file=api_key_file)
        self.model: str = resolve_openrouter_model(model)
        self.proxy: str | None = resolve_proxy_url(proxy or https_proxy)
        self.https_proxy: str | None = self.proxy
        self.base_url: str = base_url
        self.timeout: float = timeout
        self.connect_timeout: float = connect_timeout
        self.max_retries: int = max(0, max_retries)
        self.retry_backoff_sec: float = max(0.0, retry_backoff_sec)
        self.max_json_retries: int = max(0, max_json_retries)
        self.use_json_schema: bool = use_json_schema
        self.pricing_path: Path | None = pricing_path or DEFAULT_PRICING_PATH
        self.prompt_path: Path | None = prompt_path or DEFAULT_PROMPT_PATH
        self._external_client: httpx.Client | None = http_client
        self._transport: httpx.BaseTransport | None = transport

    def _build_messages(
        self,
        *,
        video_bytes: bytes | None,
        caption: str,
        url: str | None,
        mime_type: str,
    ) -> list[dict[str, Any]]:
        prompt_text = build_openrouter_text_prompt(
            caption=caption,
            url=url,
            prompt_path=self.prompt_path,
        )
        content: list[dict[str, Any]] = [{"type": "text", "text": prompt_text}]
        if video_bytes is not None:
            encoded = base64.b64encode(video_bytes).decode("ascii")
            data_url = f"data:{mime_type};base64,{encoded}"
            content.append({"type": "video_url", "video_url": {"url": data_url}})
        return [{"role": "user", "content": content}]

    def _build_payload(
        self,
        *,
        messages: list[dict[str, Any]],
        include_json_schema: bool,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "usage": {"include": True},
        }
        if include_json_schema:
            payload["response_format"] = build_extraction_response_format()
        return payload

    def _send_http_with_retries(
        self,
        client: httpx.Client,
        payload: dict[str, Any],
    ) -> httpx.Response:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        last_error: Exception | None = None

        for attempt in range(self.max_retries + 1):
            try:
                response = client.post(self.base_url, headers=headers, json=payload)
            except httpx.TimeoutException as exc:
                last_error = exc
                if attempt < self.max_retries:
                    if self.retry_backoff_sec > 0:
                        time.sleep(self.retry_backoff_sec * (2**attempt))
                    continue
                raise OpenRouterError(
                    f"OpenRouter request timed out after {self.timeout}s "
                    f"(proxy={self.proxy or 'none'}): {exc}"
                ) from exc
            except httpx.RequestError as exc:
                raise OpenRouterError(
                    f"OpenRouter network or proxy error (proxy={self.proxy or 'none'}): {exc}"
                ) from exc

            effective_status = _effective_response_status(response)
            if effective_status == 429 or 500 <= effective_status < 600:
                if attempt < self.max_retries:
                    self._sleep_before_retry(attempt)
                    continue
                snippet = response.text[:300].strip()
                label = "rate limit exceeded" if effective_status == 429 else "server error"
                raise OpenRouterError(
                    f"OpenRouter {label} (HTTP {effective_status}) after {self.max_retries} "
                    f"retries: {snippet}"
                )

            return response

        raise OpenRouterError(f"OpenRouter request failed: {last_error}")

    def _sleep_before_retry(self, attempt: int) -> None:
        if self.retry_backoff_sec > 0:
            time.sleep(self.retry_backoff_sec * (2**attempt))

    def _request_completion_json(
        self,
        client: httpx.Client,
        *,
        messages: list[dict[str, Any]],
        include_json_schema: bool,
    ) -> tuple[dict[str, Any], bool]:
        """Send completion request, falling back without `response_format` if unsupported."""
        payload = self._build_payload(messages=messages, include_json_schema=include_json_schema)
        response = self._send_http_with_retries(client, payload)

        if include_json_schema and response.status_code in {400, 422}:
            body_lower = response.text.lower()
            if "access denied" not in body_lower and "unauthorized" not in body_lower:
                fallback_payload = self._build_payload(
                    messages=messages,
                    include_json_schema=False,
                )
                response = self._send_http_with_retries(client, fallback_payload)
                include_json_schema = False

        self._raise_for_non_200(response)

        try:
            data: dict[str, Any] = response.json()
        except ValueError as exc:
            raise OpenRouterError(
                f"OpenRouter returned non-JSON HTTP response (status {response.status_code}): "
                f"{response.text[:200]}"
            ) from exc

        if isinstance(data.get("error"), dict):
            err_obj: dict[str, Any] = data["error"]
            err_code = err_obj.get("code")
            err_msg = str(err_obj.get("message") or err_obj)
            if include_json_schema and err_code in {400, 422}:
                fallback_payload = self._build_payload(
                    messages=messages,
                    include_json_schema=False,
                )
                response = self._send_http_with_retries(client, fallback_payload)
                self._raise_for_non_200(response)
                data = response.json()
                include_json_schema = False
            else:
                raise OpenRouterError(f"OpenRouter API error ({err_code}): {err_msg}")

        return data, include_json_schema

    def _raise_for_non_200(self, response: httpx.Response) -> None:
        status = response.status_code
        if 200 <= status < 300:
            return

        snippet = response.text[:300].strip()
        if status == 403 or "access denied by security policy" in snippet.lower():
            raise OpenRouterError(
                f"OpenRouter access denied (HTTP {status}: {snippet}). "
                "Verify HTTPS_PROXY / ALL_PROXY is set (e.g. socks5h://127.0.0.1:2080)."
            )
        if status == 401:
            raise OpenRouterError(
                "OpenRouter authentication failed (HTTP 401). "
                "Verify OPENROUTER_API_KEY or OPENROUTER_API_KEY_FILE."
            )
        raise OpenRouterError(f"OpenRouter HTTP {status} error: {snippet}")

    def extract(
        self,
        *,
        video_bytes: bytes | None = None,
        caption: str = "",
        url: str | None = None,
        mime_type: str = "video/mp4",
        duration_sec: float | None = None,
        fps: float | None = None,
    ) -> ClientExtractionResponse:
        """Send inline base64 video and caption to OpenRouter and return validated Extraction."""
        del duration_sec, fps  # Used by Gemini SDK video_metadata; OpenRouter takes data URL
        if video_bytes is None and not caption.strip() and not url:
            raise ValueError("At least one of video_bytes, caption, or url must be provided")

        if video_bytes is not None and len(video_bytes) > MAX_INLINE_VIDEO_BYTES:
            raise ValueError(
                f"Video size ({len(video_bytes)} bytes) exceeds maximum inline limit "
                f"of {MAX_INLINE_VIDEO_BYTES} bytes (20 MB)"
            )

        messages = self._build_messages(
            video_bytes=video_bytes,
            caption=caption,
            url=url,
            mime_type=mime_type,
        )

        if self._external_client is not None:
            return self._execute_with_client(self._external_client, messages)

        timeout_cfg = httpx.Timeout(self.timeout, connect=self.connect_timeout)
        client_kwargs: dict[str, Any] = {
            "timeout": timeout_cfg,
            "trust_env": False,
        }
        if self._transport is not None:
            client_kwargs["transport"] = self._transport
        elif self.proxy:
            client_kwargs["proxy"] = self.proxy

        with httpx.Client(**client_kwargs) as client:
            return self._execute_with_client(client, messages)

    def _execute_with_client(
        self,
        client: httpx.Client,
        messages: list[dict[str, Any]],
    ) -> ClientExtractionResponse:
        include_schema = self.use_json_schema
        last_parse_error: Exception | None = None

        for json_attempt in range(self.max_json_retries + 1):
            data, include_schema = self._request_completion_json(
                client,
                messages=messages,
                include_json_schema=include_schema,
            )
            try:
                raw_text = _extract_message_text(data)
                extraction = parse_extraction_from_text(raw_text)
            except (ValueError, ValidationError) as exc:
                last_parse_error = exc
                if json_attempt < self.max_json_retries:
                    continue
                raise OpenRouterError(
                    f"OpenRouter returned invalid Extraction JSON after "
                    f"{self.max_json_retries + 1} attempts: {exc}"
                ) from exc

            resolved_model = str(data.get("model") or self.model)
            usage, cost_usd = extract_openrouter_usage_and_cost(
                data,
                model=resolved_model,
                pricing_path=self.pricing_path,
            )
            return ClientExtractionResponse(
                extraction=extraction,
                usage=usage,
                cost_usd=cost_usd,
                model=resolved_model,
            )

        raise OpenRouterError(f"OpenRouter extraction failed: {last_parse_error}")


def create_extract_client(
    *,
    provider: str | None = None,
    model: str | None = None,
    fake: bool = False,
    api_key: str | None = None,
    api_key_file: Path | str | None = None,
    proxy: str | None = None,
    pricing_path: Path | None = None,
    prompt_path: Path | None = None,
) -> ExtractClientProtocol:
    """Instantiate an extraction client for `openrouter` (default), `gemini`, or `fake`."""
    resolved_provider = resolve_provider(provider, fake=fake)
    if resolved_provider == "fake":
        return FakeExtractClient(model=model, pricing_path=pricing_path)
    if resolved_provider == "gemini":
        return GeminiExtractClient(
            api_key=api_key,
            model=model,
            https_proxy=proxy,
            pricing_path=pricing_path,
            prompt_path=prompt_path,
        )
    return OpenRouterExtractClient(
        api_key=api_key,
        api_key_file=api_key_file,
        model=model,
        proxy=proxy,
        pricing_path=pricing_path,
        prompt_path=prompt_path,
    )
