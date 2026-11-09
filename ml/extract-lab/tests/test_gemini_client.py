"""Offline unit tests for GeminiExtractClient, FakeExtractClient, and pricing."""

from __future__ import annotations

import struct
from typing import Any

import pytest
from google.genai import types

from extractlab.gemini_client import (
    DEFAULT_MODEL,
    MAX_INLINE_VIDEO_BYTES,
    FakeExtractClient,
    GeminiExtractClient,
    calculate_cost_usd,
    load_pricing,
    load_system_prompt,
    parse_mp4_duration_sec,
)
from extractlab.models import ExtractedPlace, Extraction, TokenUsage


class _DummyUsageMeta:
    def __init__(self) -> None:
        self.prompt_token_count = 2000
        self.candidates_token_count = 200
        self.thoughts_token_count = 0
        self.cached_content_token_count = 0
        self.total_token_count = 2200


class _DummyResponse:
    def __init__(self, extraction: Extraction) -> None:
        self.parsed = extraction
        self.text = extraction.model_dump_json()
        self.usage_metadata = _DummyUsageMeta()


class _DummyModelsAPI:
    def __init__(self, extraction: Extraction) -> None:
        self._extraction = extraction
        self.calls: list[dict[str, Any]] = []

    def generate_content(
        self,
        *,
        model: str,
        contents: list[types.Part],
        config: types.GenerateContentConfig,
    ) -> _DummyResponse:
        self.calls.append({"model": model, "contents": contents, "config": config})
        return _DummyResponse(self._extraction)


class _DummyGenAIClient:
    def __init__(self, extraction: Extraction) -> None:
        self.models = _DummyModelsAPI(extraction)


def _make_mp4_bytes_with_duration(duration_sec: int, timescale: int = 1000) -> bytes:
    duration_units = duration_sec * timescale
    mvhd_body = (
        bytes([0, 0, 0, 0])  # version 0 + flags
        + struct.pack(">IIII", 0, 0, timescale, duration_units)
        + b"\x00" * 16
    )
    box_size = 8 + len(mvhd_body)
    return b"\x00\x00\x00\x18ftypmp42" + struct.pack(">I", box_size) + b"mvhd" + mvhd_body


def test_parse_mp4_duration_sec_from_mvhd_box() -> None:
    short_mp4 = _make_mp4_bytes_with_duration(14)
    long_mp4 = _make_mp4_bytes_with_duration(28)
    assert parse_mp4_duration_sec(short_mp4) == 14.0
    assert parse_mp4_duration_sec(long_mp4) == 28.0


def test_gemini_client_inline_video_low_resolution_and_fps_for_short_clips(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GEMINI_MODEL", "gemini-2.5-flash")
    monkeypatch.setenv("HTTPS_PROXY", "http://127.0.0.1:8080")

    expected = Extraction(
        items=[
            ExtractedPlace(
                name="Underdog",
                category="bar",
                address_raw="ул. Маросейка, 6-8с1",
                metro_hint="Китай-город",
                evidence="on_screen_text",
                quote="Underdog на Маросейке",
                timecode_sec=1.2,
                confidence=0.95,
            )
        ],
        video_has_multiple_places=False,
        resolution_hint="exact",
    )
    dummy_genai = _DummyGenAIClient(expected)
    client = GeminiExtractClient(api_key="test-key-not-real", genai_client=dummy_genai)

    assert client.model == DEFAULT_MODEL
    assert client.https_proxy == "http://127.0.0.1:8080"

    short_video = _make_mp4_bytes_with_duration(12)
    resp = client.extract(
        video_bytes=short_video,
        caption="Любимый бар Underdog на Маросейке 6-8с1",
        url="https://www.instagram.com/reel/DC1xYz/",
    )

    assert resp.extraction.items[0].name == "Underdog"
    assert resp.usage.prompt_tokens == 2000
    assert resp.usage.candidates_tokens == 200
    assert resp.cost_usd == pytest.approx(0.0011, rel=1e-4)

    call = dummy_genai.models.calls[0]
    assert call["model"] == "gemini-2.5-flash"

    cfg: types.GenerateContentConfig = call["config"]
    assert cfg.media_resolution == types.MediaResolution.MEDIA_RESOLUTION_LOW
    assert cfg.response_mime_type == "application/json"
    assert cfg.response_schema is Extraction

    video_part: types.Part = call["contents"][0]
    assert video_part.inline_data is not None
    assert video_part.inline_data.data == short_video
    assert video_part.video_metadata is not None
    assert video_part.video_metadata.fps == 2.0


def test_gemini_client_long_video_does_not_force_fps_2() -> None:
    expected = Extraction(items=[], video_has_multiple_places=False, resolution_hint="exact")
    dummy_genai = _DummyGenAIClient(expected)
    client = GeminiExtractClient(api_key="test-key", genai_client=dummy_genai)

    long_video = _make_mp4_bytes_with_duration(25)
    client.extract(video_bytes=long_video, caption="Длинный обзор")

    video_part: types.Part = dummy_genai.models.calls[0]["contents"][0]
    assert video_part.video_metadata is None


def test_gemini_client_rejects_video_above_20mb() -> None:
    expected = Extraction(items=[], video_has_multiple_places=False, resolution_hint="exact")
    dummy_genai = _DummyGenAIClient(expected)
    client = GeminiExtractClient(api_key="test-key", genai_client=dummy_genai)

    oversized = b"x" * (MAX_INLINE_VIDEO_BYTES + 1)
    with pytest.raises(ValueError, match="20 MB"):
        client.extract(video_bytes=oversized, caption="Слишком большой файл")


def test_gemini_client_requires_api_key_when_no_genai_client(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    with pytest.raises(ValueError, match="GEMINI_API_KEY"):
        GeminiExtractClient()


def test_pricing_table_and_prompt_rules() -> None:
    pricing = load_pricing()
    assert pricing["status"] == "проверить"
    assert "updated_at" in pricing
    assert "gemini-2.5-flash" in pricing["models"]

    usage = TokenUsage(prompt_tokens=1_000_000, candidates_tokens=100_000, total_tokens=1_100_000)
    cost = calculate_cost_usd("gemini-2.5-flash", usage)
    assert cost == pytest.approx(0.30 + 0.25, rel=1e-4)

    prompt_text = load_system_prompt()
    assert "Не придумывать" in prompt_text
    assert "много мест" in prompt_text
    assert "сеть без адреса" in prompt_text
    assert "Не угадывать часы работы и адреса" in prompt_text
    assert "место и временное событие" in prompt_text


def test_fake_client_handles_multi_place_and_chain_without_address() -> None:
    fake = FakeExtractClient()

    multi_resp = fake.extract(
        video_bytes=b"clip",
        caption=(
            "Топ мест на вечер:\n"
            "1. «Полдень», м. Чистые пруды\n"
            "2. Бар «Ровесник», Малая Дмитровка, 20"
        ),
    )
    assert multi_resp.extraction.video_has_multiple_places is True
    assert multi_resp.extraction.resolution_hint == "multiple_places"
    assert len(multi_resp.extraction.items) == 2

    chain_resp = fake.extract(
        video_bytes=b"clip",
        caption="Забежали за рафом в Дринкит перед парами!",
    )
    assert chain_resp.extraction.resolution_hint == "chain_without_address"
    assert chain_resp.extraction.items[0].address_raw is None
