"""Unit and live tests for OpenRouterExtractClient."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import httpx
import pytest

from extractlab.gemini_client import FakeExtractClient, GeminiExtractClient
from extractlab.models import ExtractedPlace, Extraction
from extractlab.openrouter_client import (
    DEFAULT_OPENROUTER_MODEL,
    DEFAULT_PROVIDER,
    OPENROUTER_CHAT_COMPLETIONS_URL,
    OpenRouterError,
    OpenRouterExtractClient,
    create_extract_client,
    has_openrouter_api_key,
    parse_extraction_from_text,
    resolve_openrouter_api_key,
    resolve_openrouter_model,
    resolve_provider,
    resolve_proxy_url,
)


def _sample_extraction_dict(name: str = "Underdog") -> dict[str, Any]:
    extraction = Extraction(
        items=[
            ExtractedPlace(
                name=name,
                aliases=["Андердог"],
                category="bar",
                address_raw="ул. Маросейка, 6-8с1",
                metro_hint="Китай-город",
                landmark_hint=None,
                city="Москва",
                evidence="caption",
                quote="Бар Underdog на Маросейке 6-8с1",
                timecode_sec=1.5,
                confidence=0.95,
            )
        ],
        video_has_multiple_places=False,
        resolution_hint="exact",
        notes="Одно место с адресом.",
    )
    return extraction.model_dump(mode="json")


def test_provider_and_model_resolution_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("EXTRACT_PROVIDER", raising=False)
    monkeypatch.delenv("EXTRACT_MODEL", raising=False)
    monkeypatch.delenv("OPENROUTER_MODEL", raising=False)

    assert resolve_provider() == DEFAULT_PROVIDER == "openrouter"
    assert resolve_provider(fake=True) == "fake"
    assert resolve_openrouter_model() == DEFAULT_OPENROUTER_MODEL == "google/gemini-3.5-flash-lite"

    monkeypatch.setenv("EXTRACT_PROVIDER", "gemini")
    monkeypatch.setenv("EXTRACT_MODEL", "google/gemini-3.6-flash")
    assert resolve_provider() == "gemini"
    assert resolve_openrouter_model() == "google/gemini-3.6-flash"

    with pytest.raises(ValueError, match="Unsupported provider"):
        resolve_provider("unknown-provider")


def test_resolve_api_key_from_env_and_file(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    key_file = tmp_path / "openrouter_key.txt"
    key_file.write_text("  sk-or-v1-from-file-123  \n", encoding="utf-8")

    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    monkeypatch.setenv("OPENROUTER_API_KEY_FILE", str(key_file))
    assert resolve_openrouter_api_key() == "sk-or-v1-from-file-123"

    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-v1-from-env-456")
    assert resolve_openrouter_api_key() == "sk-or-v1-from-env-456"

    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    monkeypatch.setenv("OPENROUTER_API_KEY_FILE", str(tmp_path / "missing.key"))
    with pytest.raises(ValueError, match="OpenRouter API key is not configured"):
        resolve_openrouter_api_key()


def test_resolve_proxy_url_from_https_and_all_proxy(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("HTTPS_PROXY", raising=False)
    monkeypatch.delenv("https_proxy", raising=False)
    monkeypatch.delenv("ALL_PROXY", raising=False)
    monkeypatch.delenv("all_proxy", raising=False)

    assert resolve_proxy_url() is None

    monkeypatch.setenv("ALL_PROXY", "socks5h://127.0.0.1:2080")
    assert resolve_proxy_url() == "socks5h://127.0.0.1:2080"

    monkeypatch.setenv("HTTPS_PROXY", "http://127.0.0.1:8888")
    assert resolve_proxy_url() == "http://127.0.0.1:8888"


def test_create_extract_client_dispatches_by_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-or-key")
    monkeypatch.setenv("GEMINI_API_KEY", "test-gemini-key")

    or_client = create_extract_client(provider="openrouter")
    assert isinstance(or_client, OpenRouterExtractClient)
    assert or_client.model == "google/gemini-3.5-flash-lite"

    fake_client = create_extract_client(provider="fake")
    assert isinstance(fake_client, FakeExtractClient)

    gemini_client = create_extract_client(provider="gemini")
    assert isinstance(gemini_client, GeminiExtractClient)


def test_openrouter_request_payload_usage_and_cost_from_response() -> None:
    captured_requests: list[dict[str, Any]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == OPENROUTER_CHAT_COMPLETIONS_URL
        assert request.headers.get("Authorization") == "Bearer test-or-key"
        body = json.loads(request.content.decode("utf-8"))
        captured_requests.append(body)

        return httpx.Response(
            200,
            json={
                "id": "gen-123",
                "model": "google/gemini-3.5-flash-lite",
                "choices": [
                    {
                        "message": {
                            "role": "assistant",
                            "content": json.dumps(_sample_extraction_dict(), ensure_ascii=False),
                        }
                    }
                ],
                "usage": {
                    "prompt_tokens": 1070,
                    "completion_tokens": 95,
                    "total_tokens": 1165,
                    "cost": 0.0004,
                    "prompt_tokens_details": {
                        "video_tokens": 726,
                        "audio_tokens": 269,
                        "cached_tokens": 10,
                    },
                    "completion_tokens_details": {
                        "reasoning_tokens": 5,
                    },
                },
            },
        )

    transport = httpx.MockTransport(handler)
    client = OpenRouterExtractClient(
        api_key="test-or-key",
        transport=transport,
    )

    resp = client.extract(
        video_bytes=b"mp4-binary-bytes",
        caption="Бар Underdog на Маросейке 6-8с1",
        url="https://www.instagram.com/reel/DC1xYz/",
    )

    assert len(captured_requests) == 1
    sent = captured_requests[0]
    assert sent["model"] == "google/gemini-3.5-flash-lite"
    assert sent["usage"] == {"include": True}
    assert sent["response_format"]["type"] == "json_schema"
    assert sent["response_format"]["json_schema"]["name"] == "Extraction"

    content = sent["messages"][0]["content"]
    assert content[0]["type"] == "text"
    assert "Underdog" in content[0]["text"]
    assert content[1]["type"] == "video_url"
    assert content[1]["video_url"]["url"].startswith("data:video/mp4;base64,")

    assert resp.extraction.items[0].name == "Underdog"
    assert resp.usage.prompt_tokens == 1070
    assert resp.usage.candidates_tokens == 95
    assert resp.usage.cached_tokens == 10
    assert resp.usage.thoughts_tokens == 5
    assert resp.usage.total_tokens == 1165
    # Exact cost from usage.cost (not from local pricing.json)
    assert resp.cost_usd == 0.0004


def test_openrouter_cost_falls_back_to_pricing_json_when_usage_cost_missing() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        del request
        return httpx.Response(
            200,
            json={
                "model": "google/gemini-3.5-flash-lite",
                "choices": [
                    {
                        "message": {
                            "content": json.dumps(_sample_extraction_dict(), ensure_ascii=False),
                        }
                    }
                ],
                "usage": {
                    "prompt_tokens": 1000,
                    "completion_tokens": 100,
                    "total_tokens": 1100,
                },
            },
        )

    client = OpenRouterExtractClient(
        api_key="test-or-key",
        transport=httpx.MockTransport(handler),
    )
    resp = client.extract(caption="Бар Underdog")
    assert resp.usage.prompt_tokens == 1000
    assert resp.cost_usd > 0.0


def test_openrouter_fallback_when_json_schema_rejected_and_markdown_fenced_json() -> None:
    payloads: list[dict[str, Any]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content.decode("utf-8"))
        payloads.append(body)
        if "response_format" in body:
            return httpx.Response(
                400,
                json={"error": {"code": 400, "message": "response_format is not supported"}},
            )
        fenced_json = (
            "Вот извлечённые места:\n```json\n"
            + json.dumps(_sample_extraction_dict("Полдень"), ensure_ascii=False)
            + "\n```\n"
        )
        return httpx.Response(
            200,
            json={
                "model": "google/gemini-3.5-flash-lite",
                "choices": [{"message": {"content": fenced_json}}],
                "usage": {"prompt_tokens": 500, "completion_tokens": 80, "cost": 0.00025},
            },
        )

    client = OpenRouterExtractClient(
        api_key="test-or-key",
        transport=httpx.MockTransport(handler),
    )
    resp = client.extract(caption="Кафе Полдень")

    assert len(payloads) == 2
    assert "response_format" in payloads[0]
    assert "response_format" not in payloads[1]
    assert resp.extraction.items[0].name == "Полдень"
    assert resp.cost_usd == 0.00025


def test_openrouter_retries_once_on_invalid_json_and_fails_if_second_also_invalid() -> None:
    calls = 0

    def handler_recover(request: httpx.Request) -> httpx.Response:
        del request
        nonlocal calls
        calls += 1
        if calls == 1:
            return httpx.Response(
                200,
                json={
                    "choices": [{"message": {"content": "```json\n{not-valid-json\n```"}}],
                    "usage": {"prompt_tokens": 100, "completion_tokens": 10, "cost": 0.0001},
                },
            )
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": json.dumps(
                                _sample_extraction_dict("Ровесник"),
                                ensure_ascii=False,
                            )
                        }
                    }
                ],
                "usage": {"prompt_tokens": 200, "completion_tokens": 50, "cost": 0.0002},
            },
        )

    client_ok = OpenRouterExtractClient(
        api_key="test-or-key",
        transport=httpx.MockTransport(handler_recover),
    )
    resp = client_ok.extract(caption="Бар Ровесник")
    assert calls == 2
    assert resp.extraction.items[0].name == "Ровесник"
    assert resp.cost_usd == 0.0002

    # When both initial attempt and 1 retry return invalid JSON -> raises OpenRouterError
    fail_calls = 0

    def handler_always_bad(request: httpx.Request) -> httpx.Response:
        del request
        nonlocal fail_calls
        fail_calls += 1
        return httpx.Response(
            200,
            json={
                "choices": [{"message": {"content": "broken json output"}}],
                "usage": {"prompt_tokens": 100, "completion_tokens": 10, "cost": 0.0001},
            },
        )

    client_bad = OpenRouterExtractClient(
        api_key="test-or-key",
        transport=httpx.MockTransport(handler_always_bad),
    )
    with pytest.raises(OpenRouterError, match="invalid Extraction JSON after 2 attempts"):
        client_bad.extract(caption="Бар")
    assert fail_calls == 2


def test_openrouter_retries_twice_on_429_and_5xx() -> None:
    attempts = 0

    def handler_429_503_then_200(request: httpx.Request) -> httpx.Response:
        del request
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            return httpx.Response(429, text="Rate limit exceeded")
        if attempts == 2:
            return httpx.Response(503, text="Upstream service unavailable")
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": json.dumps(_sample_extraction_dict(), ensure_ascii=False)
                        }
                    }
                ],
                "usage": {"prompt_tokens": 800, "completion_tokens": 90, "cost": 0.00033},
            },
        )

    client = OpenRouterExtractClient(
        api_key="test-or-key",
        retry_backoff_sec=0.0,
        transport=httpx.MockTransport(handler_429_503_then_200),
    )
    resp = client.extract(caption="Underdog")
    assert attempts == 3
    assert resp.extraction.items[0].name == "Underdog"

    # Exhausting all 3 attempts (initial + 2 retries) raises clear OpenRouterError
    exhausted_attempts = 0

    def handler_always_502(request: httpx.Request) -> httpx.Response:
        del request
        nonlocal exhausted_attempts
        exhausted_attempts += 1
        return httpx.Response(502, text="Bad Gateway")

    client_fail = OpenRouterExtractClient(
        api_key="test-or-key",
        retry_backoff_sec=0.0,
        transport=httpx.MockTransport(handler_always_502),
    )
    with pytest.raises(OpenRouterError, match="HTTP 502"):
        client_fail.extract(caption="Underdog")
    assert exhausted_attempts == 3


def test_openrouter_clear_errors_on_403_security_policy_and_timeout() -> None:
    def handler_403(request: httpx.Request) -> httpx.Response:
        del request
        return httpx.Response(403, text="Access denied by security policy")

    client_403 = OpenRouterExtractClient(
        api_key="test-or-key",
        transport=httpx.MockTransport(handler_403),
    )
    with pytest.raises(OpenRouterError, match="HTTPS_PROXY"):
        client_403.extract(caption="Underdog")

    def handler_timeout(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("Read timed out", request=request)

    client_timeout = OpenRouterExtractClient(
        api_key="test-or-key",
        timeout=5.0,
        retry_backoff_sec=0.0,
        transport=httpx.MockTransport(handler_timeout),
    )
    with pytest.raises(OpenRouterError, match="timed out"):
        client_timeout.extract(caption="Underdog")


def test_parse_extraction_from_text_handles_fenced_and_surrounded_json() -> None:
    raw = (
        "Результат анализа ролика:\n```json\n"
        + json.dumps(_sample_extraction_dict("ГЭС-2"), ensure_ascii=False)
        + "\n```\nСпасибо!"
    )
    parsed = parse_extraction_from_text(raw)
    assert parsed.items[0].name == "ГЭС-2"


@pytest.mark.live
def test_openrouter_live_video_extraction() -> None:
    if not has_openrouter_api_key():
        pytest.skip("OpenRouter API key not found in OPENROUTER_API_KEY or ~/.openrouter_key")

    dataset_video = Path("/home/renat-ubuntu/dev/gde-hype-input/dataset/videos/v6cyL8hKVYQ.mp4")
    if not dataset_video.is_file():
        pytest.skip(f"Sample dataset video not found at {dataset_video}")

    proxy = (
        os.environ.get("HTTPS_PROXY") or os.environ.get("ALL_PROXY") or "socks5h://127.0.0.1:2080"
    )
    client = OpenRouterExtractClient(proxy=proxy)
    resp = client.extract(
        video_bytes=dataset_video.read_bytes(),
        caption="Центр Космонавтики и Авиации #shorts",
        url="https://www.youtube.com/shorts/v6cyL8hKVYQ",
    )

    assert resp.model
    assert resp.usage.prompt_tokens > 0
    assert resp.cost_usd > 0.0
    assert len(resp.extraction.items) >= 1
