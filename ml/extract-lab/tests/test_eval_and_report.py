"""Unit tests for `extractlab.eval` and `extractlab.report`."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from extractlab.eval import (
    CANONICAL_CASE_TYPES,
    DEFAULT_DATASET_PATH,
    DatasetRecord,
    GoldPlace,
    evaluate_record,
    fuzzy_name_similarity,
    load_dataset,
    resolve_video_path,
    run_eval,
)
from extractlab.eval import (
    main as eval_main,
)
from extractlab.models import ExtractedPlace, Extraction, TokenUsage
from extractlab.pipeline import (
    MatchedCandidate,
    PipelinePlaceResult,
    PipelineResult,
    PipelineStageLatencies,
)
from extractlab.report import (
    generate_report_from_run_file,
)
from extractlab.report import (
    main as report_main,
)


def _make_pipeline_result(places: list[PipelinePlaceResult]) -> PipelineResult:
    extracted_items = [p.extracted for p in places]
    return PipelineResult(
        status="completed",
        canonical_key="ig:TestKey",
        source_url="https://www.instagram.com/reel/TestKey/",
        places=places,
        needs_user_choice=any(p.needs_user_choice for p in places) or len(places) > 1,
        video_has_multiple_places=len(places) > 1,
        resolution_hint="exact",
        extraction=Extraction(items=extracted_items),
        model="fake-model",
        usage=TokenUsage(prompt_tokens=100, candidates_tokens=50, total_tokens=150),
        stage_latencies_ms=PipelineStageLatencies(
            cache_ms=0.1,
            extraction_ms=1.2,
            matching_ms=0.8,
            total_ms=2.1,
        ),
        latency_ms=2.1,
        cost_usd=0.0005,
        cache_hit=False,
    )


def test_load_example_dataset_schema() -> None:
    records = load_dataset(DEFAULT_DATASET_PATH)
    assert len(records) == 6
    allowed = set(CANONICAL_CASE_TYPES)
    seen_types = {r.case_type for r in records}
    assert seen_types.issubset(allowed)
    assert {
        "address_in_caption",
        "on_screen_text_only",
        "speech_only",
        "multi_place",
        "chain_no_address",
        "no_place",
    } == seen_types

    for rec in records:
        assert rec.id
        assert rec.source_url.startswith("http")
        assert rec.video_path is not None
        assert rec.gold is not None


def test_resolve_video_path_with_videos_dir(tmp_path: Path) -> None:
    vids = tmp_path / "my_videos"
    vids.mkdir()
    sample_mp4 = vids / "ex-01-severyane.mp4"
    sample_mp4.write_bytes(b"fake-mp4-content")

    resolved, exists = resolve_video_path("ex-01-severyane.mp4", videos_dir=vids)
    assert exists is True
    assert resolved == sample_mp4

    resolved_missing, exists_missing = resolve_video_path("missing.mp4", videos_dir=vids)
    assert exists_missing is False
    assert resolved_missing == vids / "missing.mp4"


def test_fuzzy_name_similarity_and_translit() -> None:
    assert fuzzy_name_similarity("Северяне", "Ресторан «Северяне»") >= 0.90
    assert fuzzy_name_similarity("Flâner", "Фланер") >= 0.85
    assert fuzzy_name_similarity("White Rabbit", "Вайт Рэббит") >= 0.85
    assert fuzzy_name_similarity("Surf Coffee", "Серф Кофе") >= 0.85
    assert fuzzy_name_similarity("Северяне", "Третьяковская галерея") < 0.40


def test_evaluate_record_all_four_failure_reasons() -> None:
    # 1. "не нашли" (missed place)
    rec_missed = DatasetRecord(
        id="r1",
        source_url="https://t.me/ch/1",
        caption="Северяне",
        case_type="address_in_caption",
        gold=[GoldPlace(name="Северяне", address="Большая Никитская, 12")],
    )
    eval_missed = evaluate_record(rec_missed, _make_pipeline_result([]))
    assert len(eval_missed.failures) == 1
    assert eval_missed.failures[0].reason == "не нашли"

    # 2. "не то место" (wrong place extracted)
    wrong_place = PipelinePlaceResult(
        ordinal_index=1,
        extracted=ExtractedPlace(name="Горыныч", address_raw="Рождественский бульвар, 1"),
        resolution_status="exact",
    )
    eval_wrong = evaluate_record(rec_missed, _make_pipeline_result([wrong_place]))
    assert len(eval_wrong.failures) == 1
    assert eval_wrong.failures[0].reason == "не то место"

    # 3. "галлюцинация" (place predicted for no_place clip)
    rec_no_place = DatasetRecord(
        id="r3",
        source_url="https://t.me/ch/3",
        caption="Туториал",
        case_type="no_place",
        gold=[],
    )
    eval_hallucination = evaluate_record(rec_no_place, _make_pipeline_result([wrong_place]))
    assert eval_hallucination.is_no_place_case is True
    assert eval_hallucination.no_place_correct_rejection is False
    assert len(eval_hallucination.failures) == 1
    assert eval_hallucination.failures[0].reason == "галлюцинация"

    # 4. "не тот филиал" (chain without address resolved to a random 'exact' branch)
    rec_chain = DatasetRecord(
        id="r4",
        source_url="https://t.me/ch/4",
        caption="Surf Coffee",
        case_type="chain_no_address",
        gold=[GoldPlace(name="Surf Coffee", is_chain=True, branch_specified=False)],
    )
    wrong_branch_place = PipelinePlaceResult(
        ordinal_index=1,
        extracted=ExtractedPlace(name="Surf Coffee", address_raw="Покровка, 17"),
        resolution_status="exact",
        matched_place=MatchedCandidate(
            osm_id=100010,
            name="Surf Coffee",
            category="cafe",
            chain_branch_count=3,
            address_full="улица Покровка, 17",
            lat=55.7592,
            lon=37.6448,
            score=1.0,
            name_score=1.0,
            geo_score=1.0,
            reason="exact",
        ),
    )
    eval_branch = evaluate_record(rec_chain, _make_pipeline_result([wrong_branch_place]))
    assert len(eval_branch.failures) == 1
    assert eval_branch.failures[0].reason == "не тот филиал"


def test_run_eval_fake_on_example_dataset_and_generate_report(tmp_path: Path) -> None:
    runs_dir = tmp_path / "runs"
    reports_dir = tmp_path / "reports"

    summary, rows = run_eval(
        dataset_path=DEFAULT_DATASET_PATH,
        runs_dir=runs_dir,
        reports_dir=reports_dir,
        run_id="test20261109",
        fake=True,
        use_in_memory_matcher=True,
    )

    assert len(rows) == 6
    assert summary.overall.clips_count == 6
    assert summary.overall.gold_places_count == 6
    assert summary.overall.predicted_places_count == 6
    assert summary.overall.recall == 1.0
    assert summary.overall.precision == 1.0
    assert summary.overall.address_or_metro_accuracy == 1.0
    assert summary.overall.resolution_status_accuracy == 1.0
    assert summary.overall.no_place_rejection_rate == 1.0
    assert summary.overall.total_cost_usd > 0.0
    assert summary.failures == []

    run_file = runs_dir / "test20261109.jsonl"
    report_file = reports_dir / "eval-test20261109.md"
    assert run_file.exists()
    assert report_file.exists()

    md_text = report_file.read_text(encoding="utf-8")
    assert "## Условия прогона" in md_text
    assert "## Сводные метрики" in md_text
    assert "## Метрики по типам случаев (`case_type`)" in md_text
    assert "## Список провалов и ошибок" in md_text
    assert "## Примеры разбора" in md_text
    assert "## Что не проверено" in md_text
    assert "меньше минимального порога 5" in md_text

    # Test standalone report regeneration from run_file with custom threshold
    regen_md = tmp_path / "custom-report.md"
    out_path = generate_report_from_run_file(
        run_file,
        regen_md,
        similarity_threshold=0.70,
    )
    assert out_path == regen_md
    assert regen_md.exists()


def test_eval_and_report_cli(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    runs_dir = tmp_path / "runs"
    reports_dir = tmp_path / "reports"

    rc = eval_main(
        [
            "--dataset",
            str(DEFAULT_DATASET_PATH),
            "--runs-dir",
            str(runs_dir),
            "--reports-dir",
            str(reports_dir),
            "--run-id",
            "clirun01",
            "--fake",
            "--in-memory-matcher",
        ]
    )
    assert rc == 0
    eval_stdout = json.loads(capsys.readouterr().out)
    assert eval_stdout["run_id"] == "clirun01"
    assert eval_stdout["overall"]["recall"] == 1.0

    custom_out = reports_dir / "eval-clirun01-regenerated.md"
    rc_rep = report_main(
        [
            str(runs_dir / "clirun01.jsonl"),
            "--output",
            str(custom_out),
        ]
    )
    assert rc_rep == 0
    assert custom_out.exists()
