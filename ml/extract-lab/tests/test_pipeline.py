"""Unit and integration tests for `extractlab.pipeline`."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from extractlab.cli import main as cli_main
from extractlab.gemini_client import FakeExtractClient
from extractlab.models import ExtractedPlace, Extraction
from extractlab.pipeline import (
    InMemoryPlaceMatcher,
    enrich_missing_place_stub,
    run_pipeline,
)
from extractlab.pipeline import (
    main as pipeline_main,
)


def test_pipeline_exact_single_place_and_cache_hit(tmp_path: Path) -> None:
    cache_db = tmp_path / "pipe_cache.sqlite3"
    client = FakeExtractClient()
    matcher = InMemoryPlaceMatcher()

    res1 = run_pipeline(
        caption="Ресторан «Северяне», ул. Большая Никитская, 12, м. Охотный Ряд",
        url="https://www.instagram.com/reel/ExAddrCap01/?igsh=test",
        fake=True,
        cache_db=cache_db,
        client=client,
        matcher=matcher,
    )
    assert res1.status == "completed"
    assert res1.canonical_key == "ig:ExAddrCap01"
    assert res1.cache_hit is False
    assert res1.cost_usd > 0.0
    assert res1.needs_user_choice is False
    assert len(res1.places) == 1
    place = res1.places[0]
    assert place.resolution_status == "exact"
    assert place.needs_user_choice is False
    assert place.matched_place is not None
    assert place.matched_place.name == "Северяне"
    assert res1.stage_latencies_ms.total_ms >= 0.0
    assert client.call_count == 1

    # Second run with different tracking param hits SQLite cache without calling LLM
    res2 = run_pipeline(
        caption="Ресторан «Северяне», ул. Большая Никитская, 12, м. Охотный Ряд",
        url="https://www.instagram.com/reel/ExAddrCap01/?utm_source=ig_web",
        fake=True,
        cache_db=cache_db,
        client=client,
        matcher=matcher,
    )
    assert res2.cache_hit is True
    assert res2.cost_usd == 0.0
    assert res2.stage_latencies_ms.extraction_ms == 0.0
    assert len(res2.places) == 1
    assert res2.places[0].resolution_status == "exact"
    assert client.call_count == 1


def test_pipeline_chain_ambiguous_needs_user_choice(tmp_path: Path) -> None:
    res = run_pipeline(
        caption="Забежала за рафом в Surf Coffee перед парами #кофе",
        url="https://t.me/moscow_coffee_notes/505",
        fake=True,
        cache_db=tmp_path / "cache.sqlite3",
        use_in_memory_matcher=True,
    )
    assert res.status == "completed"
    assert len(res.places) == 1
    place = res.places[0]
    assert place.resolution_status == "chain_ambiguous"
    assert place.needs_user_choice is True
    assert res.needs_user_choice is True
    assert len(place.candidates) >= 2


def test_pipeline_multi_place_compilation(tmp_path: Path) -> None:
    caption = (
        "Топ-2 места для ужина:\n"
        "1) Ресторан «Северяне» — Большая Никитская, 12, м. Охотный Ряд\n"
        "2) Ресторан «Белуга» — Моховая, 15/1, м. Охотный Ряд"
    )
    res = run_pipeline(
        caption=caption,
        url="https://vk.com/clip-123456_789004",
        fake=True,
        cache_db=tmp_path / "cache.sqlite3",
        use_in_memory_matcher=True,
    )
    assert res.status == "completed"
    assert res.video_has_multiple_places is True
    assert res.needs_user_choice is True
    assert len(res.places) == 2
    assert res.places[0].resolution_status == "exact"
    assert res.places[1].resolution_status == "exact"


def test_pipeline_not_found_calls_stub_with_todo(tmp_path: Path) -> None:
    canned = Extraction(
        items=[
            ExtractedPlace(
                name="СекретныйНесуществующийПопАп2099",
                category="bar",
                address_raw="ул. Неизвестная, 99",
                evidence="caption",
                confidence=0.85,
            )
        ],
        video_has_multiple_places=False,
        resolution_hint="exact",
    )
    client = FakeExtractClient(canned_extraction=canned)
    res = run_pipeline(
        caption="Новый бар СекретныйНесуществующийПопАп2099",
        url="https://www.instagram.com/reel/NotFound99/",
        fake=True,
        cache_db=tmp_path / "cache.sqlite3",
        client=client,
        use_in_memory_matcher=True,
    )
    assert len(res.places) == 1
    place = res.places[0]
    assert place.resolution_status == "not_found"
    assert place.matched_place is None
    assert place.enrichment_todo is not None
    assert "TODO" in place.enrichment_todo

    stub_direct = enrich_missing_place_stub(canned.items[0])
    assert stub_direct.status == "not_found"
    assert "TODO" in stub_direct.reason


def test_pipeline_private_or_unavailable(tmp_path: Path) -> None:
    res = run_pipeline(
        caption="Закрытый ролик",
        url="https://www.instagram.com/reel/PrivClip01/",
        fake=True,
        case_type="private_or_unavailable",
        cache_db=tmp_path / "cache.sqlite3",
        use_in_memory_matcher=True,
    )
    assert res.status == "failed_source"
    assert res.error_code == "private_or_unavailable"
    assert res.places == []
    assert res.needs_user_choice is False


def test_pipeline_cli_entrypoints(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    cache_db = tmp_path / "cli_cache.sqlite3"
    rc = pipeline_main(
        [
            "--caption",
            "Бар «Underdog», ул. Маросейка, 6-8с1, м. Китай-город",
            "--url",
            "https://www.instagram.com/reel/CliTest01/",
            "--fake",
            "--in-memory-matcher",
            "--cache-db",
            str(cache_db),
        ]
    )
    assert rc == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["canonical_key"] == "ig:CliTest01"
    assert payload["places"][0]["resolution_status"] == "exact"

    rc2 = cli_main(
        [
            "pipeline",
            "--caption",
            "Бар «Underdog», ул. Маросейка, 6-8с1, м. Китай-город",
            "--url",
            "https://www.instagram.com/reel/CliTest01/",
            "--fake",
            "--in-memory-matcher",
            "--cache-db",
            str(cache_db),
        ]
    )
    assert rc2 == 0
    payload2 = json.loads(capsys.readouterr().out)
    assert payload2["cache_hit"] is True
