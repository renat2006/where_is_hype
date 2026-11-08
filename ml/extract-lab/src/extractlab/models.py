"""Pydantic models for video place extraction (strictly without coordinates)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

EvidenceKind = Literal["speech", "on_screen_text", "caption", "visual"]


class ExtractedPlace(BaseModel):
    """A single place or event candidate extracted from a video clip or caption.

    Coordinates (lat/lon) are intentionally absent and forbidden: geocoding is
    performed downstream against a verified spatial database.
    """

    model_config = ConfigDict(extra="forbid")

    name: str = Field(
        min_length=1,
        description="Название места, заведения или события.",
    )
    aliases: list[str] = Field(
        default_factory=list,
        description="Альтернативные названия, транслитерация или разговорные варианты.",
    )
    category: str = Field(
        default="other",
        description=(
            "Категория: cafe, coffee, restaurant, bar, bakery, museum, gallery, "
            "park, cluster, event, exhibition, market, other."
        ),
    )
    address_raw: str | None = Field(
        default=None,
        description="Улица и дом, если явно указаны в ролике или описании (без додумывания).",
    )
    metro_hint: str | None = Field(
        default=None,
        description="Станция метро, если явно упомянута в ролике или описании.",
    )
    landmark_hint: str | None = Field(
        default=None,
        description="Ориентир, район или площадка проведения (например, ГЭС-2, Патриаршие).",
    )
    city: str | None = Field(
        default="Москва",
        description="Город, если известен из контекста ролика (по умолчанию Москва).",
    )
    evidence: EvidenceKind = Field(
        default="caption",
        description="Где в ролике увидено: speech | on_screen_text | caption | visual.",
    )
    quote: str | None = Field(
        default=None,
        description="Короткая дословная цитата из речи, титров на экране или подписи.",
    )
    timecode_sec: float | None = Field(
        default=None,
        ge=0.0,
        description="Таймкод упоминания или появления места в ролике (в секундах).",
    )
    confidence: float = Field(
        default=0.8,
        ge=0.0,
        le=1.0,
        description="Уверенность извлечения от 0.0 до 1.0.",
    )


class Extraction(BaseModel):
    """Structured LLM extraction response for a single video/post."""

    model_config = ConfigDict(extra="forbid")

    items: list[ExtractedPlace] = Field(
        default_factory=list,
        description="Список извлечённых мест или событий (от 0 до N).",
    )
    video_has_multiple_places: bool = Field(
        default=False,
        description="True, если ролик содержит подборку из нескольких мест.",
    )
    resolution_hint: str = Field(
        default="exact",
        description=(
            "Подсказка для гео-резолвера: exact | multiple_places | "
            "chain_without_address | event | insufficient_data."
        ),
    )
    notes: str | None = Field(
        default=None,
        description="Пояснения: например, что упомянута сеть без адреса или даты события.",
    )


class TokenUsage(BaseModel):
    """Token usage statistics returned by Gemini API."""

    model_config = ConfigDict(extra="forbid")

    prompt_tokens: int = Field(default=0, ge=0)
    candidates_tokens: int = Field(default=0, ge=0)
    thoughts_tokens: int = Field(default=0, ge=0)
    cached_tokens: int = Field(default=0, ge=0)
    total_tokens: int = Field(default=0, ge=0)


class ExtractionRunResult(BaseModel):
    """Complete CLI and library result including telemetry and cache metadata."""

    model_config = ConfigDict(extra="forbid")

    items: list[ExtractedPlace] = Field(default_factory=list)
    video_has_multiple_places: bool = False
    resolution_hint: str = "exact"
    notes: str | None = None
    extraction: Extraction
    canonical_key: str
    model: str
    usage: TokenUsage = Field(default_factory=TokenUsage)
    latency_ms: float = Field(ge=0.0)
    cost_usd: float = Field(ge=0.0)
    cache_hit: bool = False
