"""Gemini API client and fake offline client for video place extraction."""

from __future__ import annotations

import json
import os
import re
import struct
import warnings
from pathlib import Path
from typing import Any, Protocol

with warnings.catch_warnings():
    warnings.simplefilter("ignore", SyntaxWarning)
    from google import genai
    from google.genai import types
from pydantic import BaseModel, ConfigDict

from extractlab.models import ExtractedPlace, Extraction, TokenUsage

DEFAULT_MODEL = "gemini-2.5-flash"
MAX_INLINE_VIDEO_BYTES = 20 * 1024 * 1024  # 20 MB limit for inline video bytes
DEFAULT_SHORT_VIDEO_MAX_SEC = 18.0
DEFAULT_SHORT_VIDEO_FPS = 2.0

_PACKAGE_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_PRICING_PATH = _PACKAGE_ROOT / "pricing.json"
DEFAULT_PROMPT_PATH = _PACKAGE_ROOT / "prompts" / "extract_places.md"

_KNOWN_CHAINS = (
    "дринкит",
    "drinkit",
    "surf coffee",
    "серф кофе",
    "кофемания",
    "азбука вкуса",
    "старик хинкалыч",
    "one price coffee",
    "скуратов",
    "skuratov",
    "шоколадница",
    "теремок",
)

_METRO_RE = re.compile(
    r"(?:м\.|метро)\s*([А-Яа-яЁёA-Za-z0-9\-\s]{3,25}?)(?:[,.;\n]|$)",
    re.IGNORECASE,
)
_ADDRESS_RE = re.compile(
    r"((?:ул\.|улица|пер\.|переулок|пр-т|проспект|б-р|бульвар|наб\.|набережная|"
    r"пл\.|площадь|вал|Маросейка|Покровка|Мясницкая|Пятницкая|Солянка|Арбат|Тверская|"
    r"Моховая|Лаврушинский\s+переулок|Лаврушинский\s+пер\.|Смоленская\s+площадь|"
    r"Смоленская\s+пл\.|Крымский\s+вал|Большая\s+[А-Яа-яЁё]+(?:\s+улица|\s+ул\.)?|"
    r"Малая\s+[А-Яа-яЁё]+(?:\s+улица|\s+ул\.)?)\s*,?\s*(?:д\.\s*)?\d+[А-Яа-яA-Za-z0-9/\-]*)",
    re.IGNORECASE,
)
_LIST_ITEM_RE = re.compile(r"(?:^|\n)\s*(?:\d+[\).]|[-•])\s*([^\n]+)")
_NO_PLACE_HINTS = (
    "монтирую",
    "туториал",
    "цветокоррекц",
    "no-place",
    "no_place",
    "exnoplace",
    "предписание",
    "произошёл мощный взрыв",
    "ядерный взрыв",
    "открыли регистрацию на московский показ",
)


class ClientExtractionResponse(BaseModel):
    """Response from a Gemini or Fake extraction client call."""

    model_config = ConfigDict(extra="forbid")

    extraction: Extraction
    usage: TokenUsage
    cost_usd: float
    model: str


class ExtractClientProtocol(Protocol):
    """Protocol implemented by both GeminiExtractClient and FakeExtractClient."""

    model: str

    def extract(
        self,
        *,
        video_bytes: bytes | None = None,
        caption: str = "",
        url: str | None = None,
        mime_type: str = "video/mp4",
        duration_sec: float | None = None,
        fps: float | None = None,
    ) -> ClientExtractionResponse: ...


def load_pricing(pricing_path: Path | None = None) -> dict[str, Any]:
    """Load pricing table from pricing.json."""
    target = pricing_path or DEFAULT_PRICING_PATH
    if not target.exists():
        fallback = Path.cwd() / "pricing.json"
        if fallback.exists():
            target = fallback
    with target.open("r", encoding="utf-8") as fh:
        data: dict[str, Any] = json.load(fh)
    return data


def load_system_prompt(prompt_path: Path | None = None) -> str:
    """Load Russian system instruction prompt from prompts/extract_places.md."""
    target = prompt_path or DEFAULT_PROMPT_PATH
    if not target.exists():
        fallback = Path.cwd() / "prompts" / "extract_places.md"
        if fallback.exists():
            target = fallback
    return target.read_text(encoding="utf-8").strip()


def calculate_cost_usd(
    model: str,
    usage: TokenUsage,
    pricing_path: Path | None = None,
) -> float:
    """Calculate estimated request cost in USD using pricing.json."""
    pricing = load_pricing(pricing_path)
    models_table: dict[str, dict[str, Any]] = pricing.get("models", {})
    default_model_name: str = pricing.get("default_model", DEFAULT_MODEL)
    rates = models_table.get(model) or models_table.get(default_model_name) or {}

    input_rate = float(rates.get("input_per_1m_usd", 0.30))
    output_rate = float(rates.get("output_per_1m_usd", 2.50))
    cached_rate = float(rates.get("cached_input_per_1m_usd", input_rate * 0.25))

    non_cached_prompt = max(0, usage.prompt_tokens - usage.cached_tokens)
    cached_prompt = max(0, usage.cached_tokens)
    output_tokens = max(0, usage.candidates_tokens + usage.thoughts_tokens)

    cost = (
        non_cached_prompt * input_rate + cached_prompt * cached_rate + output_tokens * output_rate
    ) / 1_000_000.0
    return round(cost, 6)


def parse_mp4_duration_sec(data: bytes) -> float | None:
    """Extract duration in seconds from an MP4/MOV byte buffer via ISO BMFF mvhd box."""
    if len(data) < 16:
        return None
    idx = data.find(b"mvhd")
    if idx < 4 or idx + 24 > len(data):
        return None
    version = data[idx + 4]
    try:
        if version == 0 and idx + 24 <= len(data):
            timescale, duration = struct.unpack_from(">II", data, idx + 16)
            if timescale > 0:
                return float(duration) / float(timescale)
        elif version == 1 and idx + 36 <= len(data):
            timescale, duration = struct.unpack_from(">IQ", data, idx + 24)
            if timescale > 0:
                return float(duration) / float(timescale)
    except struct.error:
        return None
    return None


def _resolve_media_resolution(
    value: types.MediaResolution | str,
) -> types.MediaResolution:
    if isinstance(value, types.MediaResolution):
        return value
    normalized = value.strip().lower()
    mapping = {
        "low": types.MediaResolution.MEDIA_RESOLUTION_LOW,
        "media_resolution_low": types.MediaResolution.MEDIA_RESOLUTION_LOW,
        "medium": types.MediaResolution.MEDIA_RESOLUTION_MEDIUM,
        "media_resolution_medium": types.MediaResolution.MEDIA_RESOLUTION_MEDIUM,
        "high": types.MediaResolution.MEDIA_RESOLUTION_HIGH,
        "media_resolution_high": types.MediaResolution.MEDIA_RESOLUTION_HIGH,
    }
    if normalized in mapping:
        return mapping[normalized]
    raise ValueError(f"Unsupported media_resolution: {value}")


def build_user_prompt(caption: str, url: str | None = None) -> str:
    """Format caption and optional source URL for the model request."""
    lines = ["Извлеки места или события из этого ролика по правилам системного промпта."]
    if url:
        lines.append(f"Ссылка на источник: {url}")
    if caption.strip():
        lines.append(f"Подпись к ролику (caption):\n{caption.strip()}")
    else:
        lines.append("Подпись к ролику (caption): отсутствует.")
    return "\n\n".join(lines)


class GeminiExtractClient:
    """Google GenAI client for extracting places from inline video bytes and caption."""

    def __init__(
        self,
        *,
        api_key: str | None = None,
        model: str | None = None,
        https_proxy: str | None = None,
        media_resolution: types.MediaResolution | str = (
            types.MediaResolution.MEDIA_RESOLUTION_LOW
        ),
        short_video_max_sec: float = DEFAULT_SHORT_VIDEO_MAX_SEC,
        short_video_fps: float = DEFAULT_SHORT_VIDEO_FPS,
        default_fps: float | None = None,
        assume_short_when_duration_unknown: bool = True,
        pricing_path: Path | None = None,
        prompt_path: Path | None = None,
        genai_client: Any | None = None,
    ) -> None:
        resolved_key = (api_key or os.environ.get("GEMINI_API_KEY") or "").strip()
        if not resolved_key and genai_client is None:
            raise ValueError(
                "GEMINI_API_KEY is not set. Pass api_key, set GEMINI_API_KEY env var, "
                "or use --fake / FakeExtractClient for offline mode."
            )

        resolved_model = (
            model
            or os.environ.get("GEMINI_MODEL")
            or os.environ.get("EXTRACT_MODEL")
            or DEFAULT_MODEL
        ).strip()
        self.model: str = resolved_model or DEFAULT_MODEL
        self.api_key: str = resolved_key
        self.https_proxy: str | None = (
            https_proxy
            or os.environ.get("HTTPS_PROXY")
            or os.environ.get("https_proxy")
            or os.environ.get("ALL_PROXY")
            or None
        )
        self.media_resolution: types.MediaResolution = _resolve_media_resolution(media_resolution)
        self.short_video_max_sec: float = short_video_max_sec
        self.short_video_fps: float = short_video_fps
        self.default_fps: float | None = default_fps
        self.assume_short_when_duration_unknown: bool = assume_short_when_duration_unknown
        self.pricing_path: Path | None = pricing_path
        self.prompt_path: Path | None = prompt_path

        if genai_client is not None:
            self._client: Any = genai_client
        else:
            http_options: types.HttpOptions | None = None
            if self.https_proxy:
                http_options = types.HttpOptions(client_args={"proxy": self.https_proxy})
            self._client = genai.Client(api_key=self.api_key, http_options=http_options)

    def resolve_video_fps(
        self,
        *,
        video_bytes: bytes,
        duration_sec: float | None = None,
        fps_override: float | None = None,
    ) -> float | None:
        """Determine FPS setting for video metadata (fps=2 for clips <= 18s by default)."""
        if fps_override is not None:
            return fps_override
        detected_duration = (
            duration_sec if duration_sec is not None else parse_mp4_duration_sec(video_bytes)
        )
        if detected_duration is not None:
            if detected_duration <= self.short_video_max_sec:
                return self.short_video_fps
            return self.default_fps
        if self.assume_short_when_duration_unknown:
            return self.short_video_fps
        return self.default_fps

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
        """Send inline video bytes and caption to Gemini and return validated Extraction."""
        if video_bytes is None and not caption.strip() and not url:
            raise ValueError("At least one of video_bytes, caption, or url must be provided")

        parts: list[types.Part] = []
        if video_bytes is not None:
            if len(video_bytes) > MAX_INLINE_VIDEO_BYTES:
                raise ValueError(
                    f"Video size ({len(video_bytes)} bytes) exceeds maximum inline limit "
                    f"of {MAX_INLINE_VIDEO_BYTES} bytes (20 MB)"
                )
            effective_fps = self.resolve_video_fps(
                video_bytes=video_bytes,
                duration_sec=duration_sec,
                fps_override=fps,
            )
            video_meta = (
                types.VideoMetadata(fps=effective_fps) if effective_fps is not None else None
            )
            parts.append(
                types.Part(
                    inline_data=types.Blob(data=video_bytes, mime_type=mime_type),
                    video_metadata=video_meta,
                )
            )

        parts.append(types.Part.from_text(text=build_user_prompt(caption=caption, url=url)))

        system_instruction = load_system_prompt(self.prompt_path)
        config = types.GenerateContentConfig(
            system_instruction=system_instruction,
            response_mime_type="application/json",
            response_schema=Extraction,
            media_resolution=self.media_resolution,
        )

        response = self._client.models.generate_content(
            model=self.model,
            contents=parts,
            config=config,
        )

        extraction = _parse_extraction_from_response(response)
        usage = _extract_token_usage(response)
        cost_usd = calculate_cost_usd(self.model, usage, self.pricing_path)

        return ClientExtractionResponse(
            extraction=extraction,
            usage=usage,
            cost_usd=cost_usd,
            model=self.model,
        )


def _parse_extraction_from_response(response: Any) -> Extraction:
    parsed = getattr(response, "parsed", None)
    if isinstance(parsed, Extraction):
        return parsed
    if isinstance(parsed, dict):
        return Extraction.model_validate(parsed)

    text = getattr(response, "text", None)
    if isinstance(text, str) and text.strip():
        return Extraction.model_validate_json(text)

    raise ValueError("Gemini response did not contain valid structured Extraction JSON")


def _extract_token_usage(response: Any) -> TokenUsage:
    meta = getattr(response, "usage_metadata", None)
    if meta is None:
        return TokenUsage()

    prompt_tokens = int(getattr(meta, "prompt_token_count", 0) or 0)
    candidates_tokens = int(getattr(meta, "candidates_token_count", 0) or 0)
    thoughts_tokens = int(getattr(meta, "thoughts_token_count", 0) or 0)
    cached_tokens = int(getattr(meta, "cached_content_token_count", 0) or 0)
    total_tokens = int(
        getattr(meta, "total_token_count", 0)
        or (prompt_tokens + candidates_tokens + thoughts_tokens)
    )
    return TokenUsage(
        prompt_tokens=prompt_tokens,
        candidates_tokens=candidates_tokens,
        thoughts_tokens=thoughts_tokens,
        cached_tokens=cached_tokens,
        total_tokens=total_tokens,
    )


class FakeExtractClient:
    """Deterministic offline stub client for tests and `--fake` CLI execution."""

    def __init__(
        self,
        *,
        model: str | None = None,
        pricing_path: Path | None = None,
        canned_extraction: Extraction | None = None,
    ) -> None:
        resolved_model = (
            model
            or os.environ.get("EXTRACT_MODEL")
            or os.environ.get("GEMINI_MODEL")
            or DEFAULT_MODEL
        ).strip()
        self.model: str = resolved_model or DEFAULT_MODEL
        self.pricing_path: Path | None = pricing_path
        self.canned_extraction: Extraction | None = canned_extraction
        self.call_count: int = 0
        self.calls: list[dict[str, Any]] = []

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
        """Simulate Gemini extraction deterministically without network or API key."""
        if video_bytes is not None and len(video_bytes) > MAX_INLINE_VIDEO_BYTES:
            raise ValueError(
                f"Video size ({len(video_bytes)} bytes) exceeds maximum inline limit "
                f"of {MAX_INLINE_VIDEO_BYTES} bytes (20 MB)"
            )

        self.call_count += 1
        self.calls.append(
            {
                "video_size": len(video_bytes) if video_bytes is not None else 0,
                "caption": caption,
                "url": url,
                "mime_type": mime_type,
                "duration_sec": duration_sec,
                "fps": fps,
            }
        )

        extraction = (
            self.canned_extraction
            if self.canned_extraction is not None
            else _build_heuristic_extraction(
                caption=caption,
                url=url,
                video_bytes=video_bytes,
            )
        )

        video_tokens = 990 if video_bytes else 0
        text_tokens = max(120, len(caption) // 2 + 150)
        prompt_tokens = video_tokens + text_tokens
        candidates_tokens = 110 * max(1, len(extraction.items))
        usage = TokenUsage(
            prompt_tokens=prompt_tokens,
            candidates_tokens=candidates_tokens,
            thoughts_tokens=0,
            cached_tokens=0,
            total_tokens=prompt_tokens + candidates_tokens,
        )
        cost_usd = calculate_cost_usd(self.model, usage, self.pricing_path)

        return ClientExtractionResponse(
            extraction=extraction,
            usage=usage,
            cost_usd=cost_usd,
            model=self.model,
        )


def _match_special_fake_signal(combined_signal: str) -> Extraction | None:
    if any(marker in combined_signal for marker in _NO_PLACE_HINTS):
        return Extraction(
            items=[],
            video_has_multiple_places=False,
            resolution_hint="insufficient_data",
            notes="В ролике не упомянуты конкретные места Москвы (--fake).",
        )

    if any(
        cue in combined_signal
        for cue in (
            "tretyakovka",
            "7400000000000000002",
            "название и адрес оставила на экране",
        )
    ):
        return Extraction(
            items=[
                ExtractedPlace(
                    name="Третьяковская галерея",
                    aliases=["Государственная Третьяковская галерея"],
                    category="museum",
                    address_raw="Лаврушинский переулок, 10",
                    metro_hint="Третьяковская",
                    landmark_hint="Лаврушинский переулок",
                    city="Москва",
                    evidence="on_screen_text",
                    quote="Третьяковская галерея — Лаврушинский переулок, 10, м. Третьяковская",
                    timecode_sec=4.0,
                    confidence=0.92,
                )
            ],
            video_has_multiple_places=False,
            resolution_hint="exact",
            notes="Распознано из титров на экране (--fake).",
        )

    if any(
        cue in combined_signal
        for cue in (
            "whiterabbit",
            "exspeech003",
            "слушайте честный обзор со звуком",
        )
    ):
        return Extraction(
            items=[
                ExtractedPlace(
                    name="White Rabbit",
                    aliases=["Вайт Рэббит"],
                    category="restaurant",
                    address_raw="Смоленская площадь, 3",
                    metro_hint="Смоленская",
                    landmark_hint="Смоленский пассаж",
                    city="Москва",
                    evidence="speech",
                    quote="Мы поднялись под купол ресторана White Rabbit на Смоленской площади, 3",
                    timecode_sec=1.8,
                    confidence=0.91,
                )
            ],
            video_has_multiple_places=False,
            resolution_hint="exact",
            notes="Распознано из голосовой дорожки (--fake).",
        )
    return None


def _build_heuristic_extraction(
    caption: str,
    url: str | None = None,
    video_bytes: bytes | None = None,
) -> Extraction:
    text = caption.strip()
    video_tag = ""
    if video_bytes:
        try:
            video_tag = video_bytes[:256].decode("utf-8", errors="ignore").lower()
        except Exception:
            video_tag = ""
    combined_signal = f"{text.lower()} {(url or '').lower()} {video_tag}"

    special = _match_special_fake_signal(combined_signal)
    if special is not None:
        return special

    if not text:
        return Extraction(
            items=[
                ExtractedPlace(
                    name="Underdog",
                    aliases=["Андердог"],
                    category="bar",
                    address_raw="ул. Маросейка, 6-8с1",
                    metro_hint="Китай-город",
                    landmark_hint="Маросейка",
                    city="Москва",
                    evidence="on_screen_text",
                    quote="Underdog — Маросейка 6-8с1, м. Китай-город",
                    timecode_sec=1.5,
                    confidence=0.92,
                )
            ],
            video_has_multiple_places=False,
            resolution_hint="exact",
            notes=(
                f"Детерминированный разбор (--fake){f' для {url}' if url else ''}: "
                "одно место с точным адресом."
            ),
        )

    list_matches = _LIST_ITEM_RE.findall(text)
    if len(list_matches) >= 2:
        items: list[ExtractedPlace] = []
        for idx, line in enumerate(list_matches, start=1):
            parsed = _parse_single_place_from_text(line, default_timecode=float(idx * 3))
            items.append(parsed)
        return Extraction(
            items=items,
            video_has_multiple_places=True,
            resolution_hint="multiple_places",
            notes=f"Подборка из {len(items)} мест (--fake).",
        )

    lower_text = text.lower()
    address_match = _ADDRESS_RE.search(text)
    metro_match = _METRO_RE.search(text)

    for chain in _KNOWN_CHAINS:
        if chain in lower_text and address_match is None and metro_match is None:
            chain_title = chain.title() if chain.isascii() else chain.capitalize()
            return Extraction(
                items=[
                    ExtractedPlace(
                        name=chain_title,
                        aliases=[],
                        category="coffee",
                        address_raw=None,
                        metro_hint=None,
                        landmark_hint=None,
                        city="Москва",
                        evidence="caption",
                        quote=text[:120],
                        timecode_sec=2.0,
                        confidence=0.78,
                    )
                ],
                video_has_multiple_places=False,
                resolution_hint="chain_without_address",
                notes="Упомянута сеть без указания конкретного адреса филиала.",
            )

    place = _parse_single_place_from_text(text, default_timecode=2.0)
    is_event = place.category in {"event", "exhibition"}
    return Extraction(
        items=[place],
        video_has_multiple_places=False,
        resolution_hint="event" if is_event else "exact",
        notes=(
            "Временное событие/выставка (--fake)."
            if is_event
            else "Извлечено из подписи и видео (--fake)."
        ),
    )


def _parse_single_place_from_text(
    text: str,
    *,
    default_timecode: float = 2.0,
) -> ExtractedPlace:
    lower = text.lower()
    category = "cafe"
    if any(w in lower for w in ("выставк", "экспозиц")):
        category = "exhibition"
    elif any(w in lower for w in ("фестивал", "маркет", "вечеринк", "концерт", "поп-ап", "popup")):
        category = "event"
    elif any(w in lower for w in ("бар", "bar", "паб", "рюмочн")):
        category = "bar"
    elif any(w in lower for w in ("кофейн", "кофе", "coffee", "эспрессо", "матча")):
        category = "coffee"
    elif any(w in lower for w in ("ресторан", "бистро", "bistro", "траттори")):
        category = "restaurant"

    address_match = _ADDRESS_RE.search(text)
    address_raw = address_match.group(1).strip() if address_match else None

    metro_match = _METRO_RE.search(text)
    metro_hint = metro_match.group(1).strip() if metro_match else None

    quoted_name = re.search(r"[«\"“]([^»\"”]{2,50})[»\"”]", text)
    if quoted_name:
        name = quoted_name.group(1).strip()
    else:
        first_chunk = re.split(r"[,—–\-|\n]", text)[0].strip()
        cleaned = re.sub(
            r"^(?:кафе|кофейня|бар|ресторан|бистро|выставка|маркет)\s+",
            "",
            first_chunk,
            flags=re.IGNORECASE,
        ).strip()
        name = cleaned[:60] if cleaned else "Неизвестное место"

    confidence = 0.93 if (address_raw or metro_hint) else 0.75
    return ExtractedPlace(
        name=name,
        aliases=[],
        category=category,
        address_raw=address_raw,
        metro_hint=metro_hint,
        landmark_hint=None,
        city="Москва",
        evidence="caption",
        quote=text[:140],
        timecode_sec=default_timecode,
        confidence=confidence,
    )
