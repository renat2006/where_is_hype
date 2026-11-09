"""Evaluation harness for the video place extraction and PostGIS matching pipeline."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import sys
from collections.abc import Callable, Sequence
from datetime import UTC, datetime
from difflib import SequenceMatcher
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from extractlab.gemini_client import DEFAULT_PROMPT_PATH, ExtractClientProtocol
from extractlab.openrouter_client import SUPPORTED_PROVIDERS, resolve_provider
from extractlab.pipeline import (
    ExtractionPipeline,
    MatcherProtocol,
    PipelinePlaceResult,
    PipelineResult,
    ResolutionStatus,
)

_PACKAGE_ROOT = Path(__file__).resolve().parents[2]
_GEO_DIR = _PACKAGE_ROOT / "geo"
if str(_GEO_DIR) not in sys.path:
    sys.path.insert(0, str(_GEO_DIR))

from matcher import (  # noqa: E402
    generate_query_variants,
    normalize_metro,
    normalize_street,
)

CANONICAL_CASE_TYPES: tuple[str, ...] = (
    "address_in_caption",
    "on_screen_text_only",
    "speech_only",
    "multi_place",
    "chain_no_address",
    "no_place",
    "private_or_unavailable",
)

FailureReason = Literal[
    "не нашли",
    "не то место",
    "галлюцинация",
    "не тот филиал",
]

DEFAULT_DATASET_PATH = _PACKAGE_ROOT / "data" / "dataset.example.jsonl"
DEFAULT_RUNS_DIR = _PACKAGE_ROOT / "runs"
DEFAULT_REPORTS_DIR = _PACKAGE_ROOT / "reports"
DEFAULT_SIMILARITY_THRESHOLD = 0.65


class GoldPlace(BaseModel):
    """Ground-truth place annotation in a dataset record."""

    model_config = ConfigDict(extra="allow")

    name: str = Field(min_length=1)
    address: str | None = None
    metro: str | None = None
    is_chain: bool = False
    branch_specified: bool = False


class DatasetRecord(BaseModel):
    """Single labeled video/post item in a JSONL evaluation dataset."""

    model_config = ConfigDict(extra="allow")

    id: str = Field(min_length=1)
    source_url: str
    video_path: str | None = None
    caption: str = ""
    case_type: str
    gold: list[GoldPlace] | None = Field(default_factory=list)
    notes: str = ""


class EvalFailure(BaseModel):
    """Structured failure item for error analysis in the evaluation report."""

    model_config = ConfigDict(extra="forbid")

    record_id: str
    case_type: str
    reason: FailureReason
    gold_name: str | None = None
    gold_address: str | None = None
    predicted_name: str | None = None
    predicted_address: str | None = None
    predicted_status: str | None = None
    expected_status: str | None = None
    detail: str = ""


class EvalRecordEvaluation(BaseModel):
    """Per-record evaluation metrics and failure list."""

    model_config = ConfigDict(extra="forbid")

    is_labeled: bool = True
    gold_count: int = 0
    predicted_count: int = 0
    matched_gold_count: int = 0
    matched_predicted_count: int = 0
    address_or_metro_correct: int = 0
    address_or_metro_total: int = 0
    status_correct: int = 0
    status_total: int = 0
    is_no_place_case: bool = False
    no_place_correct_rejection: bool = False
    failures: list[EvalFailure] = Field(default_factory=list)


class EvalRunRow(BaseModel):
    """Complete raw record written as one JSON line in `runs/<timestamp>.jsonl`."""

    model_config = ConfigDict(extra="forbid")

    run_id: str
    timestamp: str
    mode: Literal["fake", "real"]
    provider: str
    model: str
    prompt_version: str
    similarity_threshold: float
    dataset_path: str
    videos_dir: str | None = None
    video_file_exists: bool = False
    record: DatasetRecord
    pipeline_result: PipelineResult
    evaluation: EvalRecordEvaluation


class SliceMetrics(BaseModel):
    """Aggregated quality, latency, and cost metrics for a dataset slice or case_type."""

    model_config = ConfigDict(extra="forbid")

    clips_count: int = 0
    labeled_clips_count: int = 0
    gold_places_count: int = 0
    predicted_places_count: int = 0
    matched_gold_count: int = 0
    matched_predicted_count: int = 0
    recall: float | None = None
    precision: float | None = None
    f1: float | None = None
    address_or_metro_correct: int = 0
    address_or_metro_total: int = 0
    address_or_metro_accuracy: float | None = None
    status_correct: int = 0
    status_total: int = 0
    resolution_status_accuracy: float | None = None
    no_place_clips_count: int = 0
    no_place_correct_rejections: int = 0
    no_place_rejection_rate: float | None = None
    latency_p50_ms: float = 0.0
    latency_p95_ms: float = 0.0
    mean_cost_usd: float = 0.0
    total_cost_usd: float = 0.0


class EvalSummary(BaseModel):
    """Summary of an evaluation run across all records and case_types."""

    model_config = ConfigDict(extra="forbid")

    run_id: str
    timestamp: str
    mode: Literal["fake", "real"]
    provider: str
    model: str
    prompt_version: str
    similarity_threshold: float
    dataset_path: str
    videos_dir: str | None = None
    run_jsonl_path: str
    report_md_path: str | None = None
    overall: SliceMetrics
    by_case_type: dict[str, SliceMetrics]
    failures: list[EvalFailure] = Field(default_factory=list)
    unverified_warnings: list[str] = Field(default_factory=list)


def get_prompt_version(prompt_path: Path | None = None) -> str:
    """Compute a short deterministic version identifier for `prompts/extract_places.md`."""
    target = prompt_path or DEFAULT_PROMPT_PATH
    if not target.exists():
        fallback = Path.cwd() / "prompts" / "extract_places.md"
        if fallback.exists():
            target = fallback
    if not target.exists():
        return "unknown"
    raw = target.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()[:8]
    return f"extract_places.md@{digest}"


def load_dataset(dataset_path: Path | str) -> list[DatasetRecord]:
    """Load and validate a JSONL evaluation dataset."""
    path = Path(dataset_path)
    if not path.exists():
        raise FileNotFoundError(f"Dataset file not found: {path}")
    records: list[DatasetRecord] = []
    with path.open("r", encoding="utf-8") as fh:
        for line_no, raw_line in enumerate(fh, start=1):
            stripped = raw_line.strip()
            if not stripped or stripped.startswith("#"):
                continue
            try:
                data = json.loads(stripped)
                records.append(DatasetRecord.model_validate(data))
            except Exception as exc:
                raise ValueError(f"Invalid dataset record at {path}:{line_no}: {exc}") from exc
    return records


def resolve_video_path(
    video_path: str | None,
    *,
    videos_dir: Path | str | None = None,
    dataset_path: Path | str | None = None,
) -> tuple[Path | None, bool]:
    """Resolve a dataset record's relative `video_path` using `VIDEOS_DIR`."""
    if not video_path:
        return None, False

    raw = Path(video_path)
    if raw.is_absolute():
        return raw, raw.exists()

    env_dir = videos_dir or os.environ.get("VIDEOS_DIR")
    candidates: list[Path] = []
    if env_dir:
        base = Path(env_dir).expanduser()
        candidates.append(base / raw)
        candidates.append(base / raw.name)
    if dataset_path:
        ds_parent = Path(dataset_path).resolve().parent
        candidates.append(ds_parent / raw)
        candidates.append(ds_parent.parent / raw)
    candidates.append(_PACKAGE_ROOT / raw)

    for cand in candidates:
        if cand.exists():
            return cand, True

    return (candidates[0] if candidates else raw), False


def fuzzy_name_similarity(name_a: str, name_b: str) -> float:
    """Compute fuzzy similarity (0..1) between two place names with RU<->EN transliteration."""
    variants_a = generate_query_variants(name_a)
    variants_b = generate_query_variants(name_b)
    if not variants_a or not variants_b:
        return 0.0

    best = 0.0
    for va in variants_a:
        tokens_a = set(va.split())
        for vb in variants_b:
            if va == vb:
                return 1.0
            if (va in vb and len(va) >= 3) or (vb in va and len(vb) >= 3):
                best = max(best, 0.92)
            ratio = SequenceMatcher(None, va, vb).ratio()
            best = max(best, ratio)
            tokens_b = set(vb.split())
            if tokens_a and tokens_b:
                overlap = len(tokens_a & tokens_b) / float(min(len(tokens_a), len(tokens_b)))
                if overlap >= 1.0 and min(len(va), len(vb)) >= 3:
                    best = max(best, 0.90)
                else:
                    best = max(best, 0.85 * overlap)
    return round(min(1.0, best), 4)


def _best_place_name_similarity(gold: GoldPlace, pred: PipelinePlaceResult) -> float:
    """Compute highest fuzzy similarity between gold.name and predicted candidate names."""
    candidate_names = [pred.extracted.name, *pred.extracted.aliases]
    if pred.matched_place is not None:
        candidate_names.append(pred.matched_place.name)
        if pred.matched_place.name_en:
            candidate_names.append(pred.matched_place.name_en)
    return max(
        (fuzzy_name_similarity(gold.name, cname) for cname in candidate_names if cname),
        default=0.0,
    )


def expected_gold_status(gold: GoldPlace, case_type: str = "") -> ResolutionStatus:
    """Determine expected resolution_status for a ground-truth place."""
    if (gold.is_chain or case_type == "chain_no_address") and not gold.branch_specified:
        return "chain_ambiguous"
    return "exact"


def _street_matches_gold(gold_address: str, pred: PipelinePlaceResult) -> bool:
    norm_gold_street = normalize_street(gold_address)
    pred_addresses = (
        pred.extracted.address_raw,
        pred.matched_place.address_full if pred.matched_place else None,
        pred.matched_place.addr_street if pred.matched_place else None,
    )
    for addr in pred_addresses:
        if not addr:
            continue
        norm_pred_street = normalize_street(addr)
        if (
            norm_gold_street
            and norm_pred_street
            and (
                norm_gold_street in norm_pred_street
                or norm_pred_street in norm_gold_street
                or SequenceMatcher(None, norm_gold_street, norm_pred_street).ratio() >= 0.65
            )
        ):
            return True
    return bool(
        not pred.needs_user_choice
        and pred.resolution_status == "exact"
        and pred.matched_place is not None
        and pred.matched_place.matched_metro is not None
    )


def _metro_matches_gold(gold_metro: str, pred: PipelinePlaceResult) -> bool:
    norm_gold_metro = normalize_metro(gold_metro)
    pred_metros = (
        pred.extracted.metro_hint,
        pred.matched_place.matched_metro if pred.matched_place else None,
    )
    for m_val in pred_metros:
        if not m_val:
            continue
        norm_pred_metro = normalize_metro(m_val)
        if (
            norm_gold_metro
            and norm_pred_metro
            and (
                norm_gold_metro in norm_pred_metro
                or norm_pred_metro in norm_gold_metro
                or SequenceMatcher(None, norm_gold_metro, norm_pred_metro).ratio() >= 0.70
            )
        ):
            return True
    return False


def fuzzy_address_or_metro_match(gold: GoldPlace, pred: PipelinePlaceResult) -> bool:
    """Check whether predicted/matched place satisfies the gold address or metro hint."""
    if gold.is_chain and not gold.branch_specified and not gold.address and not gold.metro:
        return pred.extracted.address_raw is None and pred.resolution_status == "chain_ambiguous"
    if gold.address:
        return _street_matches_gold(gold.address, pred)
    if gold.metro:
        return _metro_matches_gold(gold.metro, pred)
    return pred.resolution_status == "exact"


def _build_matched_pair_failure(
    record: DatasetRecord,
    g_item: GoldPlace,
    p_item: PipelinePlaceResult,
    exp_status: ResolutionStatus,
) -> EvalFailure:
    pred_addr = (
        p_item.matched_place.address_full if p_item.matched_place else p_item.extracted.address_raw
    )
    if not g_item.is_chain and p_item.resolution_status == "not_found":
        return EvalFailure(
            record_id=record.id,
            case_type=record.case_type,
            reason="не нашли",
            gold_name=g_item.name,
            gold_address=g_item.address,
            predicted_name=p_item.extracted.name,
            predicted_address=p_item.extracted.address_raw,
            predicted_status=p_item.resolution_status,
            expected_status=exp_status,
            detail=f"Место «{g_item.name}» извлечено, но не найдено в базе PostGIS.",
        )
    return EvalFailure(
        record_id=record.id,
        case_type=record.case_type,
        reason="не тот филиал",
        gold_name=g_item.name,
        gold_address=g_item.address,
        predicted_name=p_item.extracted.name,
        predicted_address=pred_addr,
        predicted_status=p_item.resolution_status,
        expected_status=exp_status,
        detail=(
            f"Не совпал филиал/адрес или статус для «{g_item.name}» "
            f"(ожидался '{exp_status}', получен '{p_item.resolution_status}')."
        ),
    )


def _append_unmatched_failures(
    failures: list[EvalFailure],
    record: DatasetRecord,
    *,
    gold_items: Sequence[GoldPlace],
    preds: Sequence[PipelinePlaceResult],
    unmatched_g: Sequence[int],
    unmatched_p: Sequence[int],
) -> None:
    paired_wrong_count = min(len(unmatched_g), len(unmatched_p))
    for i in range(paired_wrong_count):
        g_item = gold_items[unmatched_g[i]]
        p_item = preds[unmatched_p[i]]
        failures.append(
            EvalFailure(
                record_id=record.id,
                case_type=record.case_type,
                reason="не то место",
                gold_name=g_item.name,
                gold_address=g_item.address,
                predicted_name=p_item.extracted.name,
                predicted_address=p_item.extracted.address_raw,
                predicted_status=p_item.resolution_status,
                expected_status=expected_gold_status(g_item, record.case_type),
                detail=f"Ожидалось «{g_item.name}», но извлечено «{p_item.extracted.name}».",
            )
        )

    for g_idx in unmatched_g[paired_wrong_count:]:
        g_item = gold_items[g_idx]
        failures.append(
            EvalFailure(
                record_id=record.id,
                case_type=record.case_type,
                reason="не нашли",
                gold_name=g_item.name,
                gold_address=g_item.address,
                expected_status=expected_gold_status(g_item, record.case_type),
                detail=f"Место «{g_item.name}» не было найдено в ролике.",
            )
        )

    for p_idx in unmatched_p[paired_wrong_count:]:
        p_item = preds[p_idx]
        failures.append(
            EvalFailure(
                record_id=record.id,
                case_type=record.case_type,
                reason="галлюцинация",
                predicted_name=p_item.extracted.name,
                predicted_address=p_item.extracted.address_raw,
                predicted_status=p_item.resolution_status,
                detail=f"Извлечено лишнее место «{p_item.extracted.name}», которого нет в gold.",
            )
        )


def evaluate_record(
    record: DatasetRecord,
    pipeline_result: PipelineResult,
    *,
    similarity_threshold: float = DEFAULT_SIMILARITY_THRESHOLD,
) -> EvalRecordEvaluation:
    """Evaluate pipeline output for a single dataset record against `record.gold`."""
    preds = pipeline_result.places
    if record.gold is None:
        return EvalRecordEvaluation(is_labeled=False, predicted_count=len(preds))

    gold_items = record.gold
    is_no_place = record.case_type in {"no_place", "out_of_scope_city"} or (
        len(gold_items) == 0 and record.case_type != "private_or_unavailable"
    )

    if len(gold_items) == 0:
        rejected = len(preds) == 0
        no_place_failures = [
            EvalFailure(
                record_id=record.id,
                case_type=record.case_type,
                reason="галлюцинация",
                predicted_name=p.extracted.name,
                predicted_address=p.extracted.address_raw,
                predicted_status=p.resolution_status,
                detail=f"В записи без мест ({record.case_type}) извлечено «{p.extracted.name}».",
            )
            for p in preds
        ]
        return EvalRecordEvaluation(
            is_labeled=True,
            predicted_count=len(preds),
            is_no_place_case=is_no_place,
            no_place_correct_rejection=rejected if is_no_place else False,
            failures=no_place_failures,
        )

    candidate_pairs = [
        (_best_place_name_similarity(g_item, p_item), g_idx, p_idx)
        for g_idx, g_item in enumerate(gold_items)
        for p_idx, p_item in enumerate(preds)
    ]
    candidate_pairs = [item for item in candidate_pairs if item[0] >= similarity_threshold]
    candidate_pairs.sort(key=lambda item: item[0], reverse=True)

    matched_gold_indices: set[int] = set()
    matched_pred_indices: set[int] = set()
    matched_pairs: list[tuple[int, int]] = []
    for _sim, g_idx, p_idx in candidate_pairs:
        if g_idx not in matched_gold_indices and p_idx not in matched_pred_indices:
            matched_gold_indices.add(g_idx)
            matched_pred_indices.add(p_idx)
            matched_pairs.append((g_idx, p_idx))

    addr_correct = 0
    status_correct = 0
    failures: list[EvalFailure] = []

    for g_idx, p_idx in matched_pairs:
        g_item = gold_items[g_idx]
        p_item = preds[p_idx]
        exp_status = expected_gold_status(g_item, record.case_type)
        addr_ok = fuzzy_address_or_metro_match(g_item, p_item)
        status_ok = p_item.resolution_status == exp_status
        addr_correct += int(addr_ok)
        status_correct += int(status_ok)
        if not status_ok or not addr_ok:
            failures.append(_build_matched_pair_failure(record, g_item, p_item, exp_status))

    unmatched_g = [idx for idx in range(len(gold_items)) if idx not in matched_gold_indices]
    unmatched_p = [idx for idx in range(len(preds)) if idx not in matched_pred_indices]
    _append_unmatched_failures(
        failures,
        record,
        gold_items=gold_items,
        preds=preds,
        unmatched_g=unmatched_g,
        unmatched_p=unmatched_p,
    )

    return EvalRecordEvaluation(
        is_labeled=True,
        gold_count=len(gold_items),
        predicted_count=len(preds),
        matched_gold_count=len(matched_pairs),
        matched_predicted_count=len(matched_pairs),
        address_or_metro_correct=addr_correct,
        address_or_metro_total=len(gold_items),
        status_correct=status_correct,
        status_total=len(gold_items),
        is_no_place_case=is_no_place,
        no_place_correct_rejection=False,
        failures=failures,
    )


def compute_percentile(values: Sequence[float], percentile: float) -> float:
    """Compute percentile (0..100) using linear interpolation."""
    if not values:
        return 0.0
    sorted_vals = sorted(values)
    if len(sorted_vals) == 1:
        return round(sorted_vals[0], 2)
    rank = (percentile / 100.0) * (len(sorted_vals) - 1)
    low = math.floor(rank)
    high = math.ceil(rank)
    if low == high:
        return round(sorted_vals[low], 2)
    weight = rank - low
    interpolated = sorted_vals[low] * (1.0 - weight) + sorted_vals[high] * weight
    return round(interpolated, 2)


def aggregate_slice_metrics(rows: Sequence[EvalRunRow]) -> SliceMetrics:
    """Compute aggregated SliceMetrics across a collection of EvalRunRow items."""
    if not rows:
        return SliceMetrics()

    clips_count = len(rows)
    labeled_rows = [r for r in rows if r.evaluation.is_labeled]
    labeled_clips_count = len(labeled_rows)

    gold_places = sum(r.evaluation.gold_count for r in labeled_rows)
    pred_places = sum(r.evaluation.predicted_count for r in labeled_rows)
    matched_gold = sum(r.evaluation.matched_gold_count for r in labeled_rows)
    matched_pred = sum(r.evaluation.matched_predicted_count for r in labeled_rows)

    recall = round(matched_gold / gold_places, 4) if gold_places > 0 else None
    precision = round(matched_pred / pred_places, 4) if pred_places > 0 else None
    f1: float | None = None
    if recall is not None and precision is not None and (recall + precision) > 0:
        f1 = round(2.0 * recall * precision / (recall + precision), 4)

    addr_correct = sum(r.evaluation.address_or_metro_correct for r in labeled_rows)
    addr_total = sum(r.evaluation.address_or_metro_total for r in labeled_rows)
    addr_acc = round(addr_correct / addr_total, 4) if addr_total > 0 else None

    status_correct = sum(r.evaluation.status_correct for r in labeled_rows)
    status_total = sum(r.evaluation.status_total for r in labeled_rows)
    status_acc = round(status_correct / status_total, 4) if status_total > 0 else None

    no_place_rows = [r for r in labeled_rows if r.evaluation.is_no_place_case]
    no_place_count = len(no_place_rows)
    no_place_ok = sum(1 for r in no_place_rows if r.evaluation.no_place_correct_rejection)
    no_place_rate = round(no_place_ok / no_place_count, 4) if no_place_count > 0 else None

    latencies = [r.pipeline_result.latency_ms for r in rows]
    costs = [r.pipeline_result.cost_usd for r in rows]
    total_cost = round(sum(costs), 6)
    mean_cost = round(total_cost / clips_count, 6) if clips_count > 0 else 0.0

    return SliceMetrics(
        clips_count=clips_count,
        labeled_clips_count=labeled_clips_count,
        gold_places_count=gold_places,
        predicted_places_count=pred_places,
        matched_gold_count=matched_gold,
        matched_predicted_count=matched_pred,
        recall=recall,
        precision=precision,
        f1=f1,
        address_or_metro_correct=addr_correct,
        address_or_metro_total=addr_total,
        address_or_metro_accuracy=addr_acc,
        status_correct=status_correct,
        status_total=status_total,
        resolution_status_accuracy=status_acc,
        no_place_clips_count=no_place_count,
        no_place_correct_rejections=no_place_ok,
        no_place_rejection_rate=no_place_rate,
        latency_p50_ms=compute_percentile(latencies, 50.0),
        latency_p95_ms=compute_percentile(latencies, 95.0),
        mean_cost_usd=mean_cost,
        total_cost_usd=total_cost,
    )


def build_unverified_warnings(
    rows: Sequence[EvalRunRow],
    *,
    mode: Literal["fake", "real"],
    min_per_case_type: int = 5,
    min_total_clips: int = 30,
) -> list[str]:
    """Automatically populate the 'Что не проверено' warnings list."""
    warnings_list: list[str] = []

    if mode == "fake":
        warnings_list.append(
            "Прогон выполнен в режиме `--fake` (клиент-заглушка `FakeExtractClient`): "
            "реальное декодирование видеопотока и вызов мультимодальной LLM не производились."
        )

    if len(rows) < min_total_clips:
        warnings_list.append(
            f"Общий объём выборки ({len(rows)} роликов) меньше целевого порога валидации "
            f"{min_total_clips} роликов из протокола [[K4-R2]]."
        )

    counts_by_type: dict[str, int] = dict.fromkeys(CANONICAL_CASE_TYPES, 0)
    for row in rows:
        ct = row.record.case_type
        counts_by_type[ct] = counts_by_type.get(ct, 0) + 1

    for ct in CANONICAL_CASE_TYPES:
        cnt = counts_by_type.get(ct, 0)
        if cnt < min_per_case_type:
            warnings_list.append(
                f"Тип случая `{ct}`: проверено {cnt} роликов (меньше минимального порога "
                f"{min_per_case_type} роликов на тип)."
            )

    missing_videos = sum(
        1 for r in rows if r.record.video_path is not None and not r.video_file_exists
    )
    if missing_videos > 0:
        warnings_list.append(
            f"Для {missing_videos} из {len(rows)} записей локальный видеофайл в `VIDEOS_DIR` "
            "отсутствовал на диске (проверено без реальных байтов MP4)."
        )

    unlabeled_count = sum(1 for r in rows if not r.evaluation.is_labeled)
    if unlabeled_count > 0:
        warnings_list.append(
            f"В выборке {unlabeled_count} записей без ручной разметки `gold` (`gold: null`), "
            "они не учитывались в расчёте recall/precision."
        )

    warnings_list.append(
        "Ветка «места нет в базе» (`not_found` → поиск в интернете / Yandex Search API) "
        "оставлена заглушкой с TODO и в рамках данного прогона не тестировалась."
    )
    return warnings_list


def build_summary_from_rows(
    rows: Sequence[EvalRunRow],
    *,
    run_jsonl_path: Path | str,
    report_md_path: Path | str | None = None,
    min_per_case_type: int = 5,
) -> EvalSummary:
    """Build an EvalSummary from a list of EvalRunRow items."""
    if not rows:
        raise ValueError("Cannot build EvalSummary from empty rows sequence")

    first = rows[0]
    overall = aggregate_slice_metrics(rows)

    grouped: dict[str, list[EvalRunRow]] = {}
    for row in rows:
        grouped.setdefault(row.record.case_type, []).append(row)

    by_case_type: dict[str, SliceMetrics] = {}
    for ct in sorted(grouped.keys()):
        by_case_type[ct] = aggregate_slice_metrics(grouped[ct])

    all_failures: list[EvalFailure] = []
    for row in rows:
        all_failures.extend(row.evaluation.failures)

    unverified = build_unverified_warnings(
        rows,
        mode=first.mode,
        min_per_case_type=min_per_case_type,
    )

    return EvalSummary(
        run_id=first.run_id,
        timestamp=first.timestamp,
        mode=first.mode,
        provider=first.provider,
        model=first.model,
        prompt_version=first.prompt_version,
        similarity_threshold=first.similarity_threshold,
        dataset_path=first.dataset_path,
        videos_dir=first.videos_dir,
        run_jsonl_path=str(run_jsonl_path),
        report_md_path=str(report_md_path) if report_md_path else None,
        overall=overall,
        by_case_type=by_case_type,
        failures=all_failures,
        unverified_warnings=unverified,
    )


def load_run_rows(run_jsonl_path: Path | str) -> list[EvalRunRow]:
    """Load EvalRunRow items from a `runs/<timestamp>.jsonl` file."""
    path = Path(run_jsonl_path)
    if not path.exists():
        raise FileNotFoundError(f"Run JSONL file not found: {path}")
    rows: list[EvalRunRow] = []
    with path.open("r", encoding="utf-8") as fh:
        for line_no, raw_line in enumerate(fh, start=1):
            stripped = raw_line.strip()
            if not stripped:
                continue
            try:
                rows.append(EvalRunRow.model_validate_json(stripped))
            except Exception as exc:
                raise ValueError(f"Invalid EvalRunRow at {path}:{line_no}: {exc}") from exc
    return rows


_ReportWriterFn = Callable[[EvalSummary, Sequence[EvalRunRow], Path | str], Path]
_REGISTERED_REPORT_WRITER: _ReportWriterFn | None = None


def register_report_writer(writer: _ReportWriterFn) -> None:
    """Register the Markdown report writer callback from `report.py`."""
    global _REGISTERED_REPORT_WRITER  # noqa: PLW0603
    _REGISTERED_REPORT_WRITER = writer


def run_eval(
    *,
    dataset_path: Path | str = DEFAULT_DATASET_PATH,
    videos_dir: Path | str | None = None,
    runs_dir: Path | str = DEFAULT_RUNS_DIR,
    reports_dir: Path | str | None = DEFAULT_REPORTS_DIR,
    run_id: str | None = None,
    fake: bool = False,
    provider: str | None = None,
    model: str | None = None,
    similarity_threshold: float = DEFAULT_SIMILARITY_THRESHOLD,
    cache_db: Path | str | None = None,
    no_cache: bool = False,
    dsn: str | None = None,
    client: ExtractClientProtocol | None = None,
    matcher: MatcherProtocol | None = None,
    use_in_memory_matcher: bool = False,
    write_report: bool = True,
) -> tuple[EvalSummary, list[EvalRunRow]]:
    """Run evaluation over a JSONL dataset, write `runs/<timestamp>.jsonl` and optional report."""
    records = load_dataset(dataset_path)
    if not records:
        raise ValueError(f"Dataset is empty: {dataset_path}")

    now_utc = datetime.now(UTC)
    effective_run_id = run_id or now_utc.strftime("%Y%m%dT%H%M%SZ")
    iso_timestamp = now_utc.isoformat()

    effective_provider = resolve_provider(provider, fake=fake) if client is None else "custom"
    is_fake_mode = fake or effective_provider == "fake"
    mode_literal: Literal["fake", "real"] = "fake" if is_fake_mode else "real"
    eval_cache_db = cache_db if cache_db is not None else ":memory:"

    pipeline = ExtractionPipeline(
        fake=is_fake_mode,
        provider=effective_provider,
        model=model,
        cache_db=eval_cache_db,
        no_cache=no_cache,
        dsn=dsn,
        client=client,
        matcher=matcher,
        use_in_memory_matcher=use_in_memory_matcher,
    )

    prompt_version = get_prompt_version()
    effective_videos_dir = str(videos_dir or os.environ.get("VIDEOS_DIR") or "") or None

    rows: list[EvalRunRow] = []
    for rec in records:
        resolved_video, file_exists = resolve_video_path(
            rec.video_path,
            videos_dir=effective_videos_dir,
            dataset_path=dataset_path,
        )
        file_for_pipeline = resolved_video if (file_exists or is_fake_mode) else None
        pipe_res = pipeline.run(
            file_path=file_for_pipeline,
            caption=rec.caption,
            url=rec.source_url,
            case_type=rec.case_type,
        )
        eval_res = evaluate_record(
            rec,
            pipe_res,
            similarity_threshold=similarity_threshold,
        )
        rows.append(
            EvalRunRow(
                run_id=effective_run_id,
                timestamp=iso_timestamp,
                mode=mode_literal,
                provider=effective_provider,
                model=pipe_res.model,
                prompt_version=prompt_version,
                similarity_threshold=similarity_threshold,
                dataset_path=str(dataset_path),
                videos_dir=effective_videos_dir,
                video_file_exists=file_exists,
                record=rec,
                pipeline_result=pipe_res,
                evaluation=eval_res,
            )
        )

    runs_dir_path = Path(runs_dir)
    runs_dir_path.mkdir(parents=True, exist_ok=True)
    run_jsonl_path = runs_dir_path / f"{effective_run_id}.jsonl"
    with run_jsonl_path.open("w", encoding="utf-8") as fh:
        for row in rows:
            fh.write(row.model_dump_json() + "\n")

    if write_report and reports_dir is not None and _REGISTERED_REPORT_WRITER is not None:
        reports_dir_path = Path(reports_dir)
        reports_dir_path.mkdir(parents=True, exist_ok=True)
        report_path = reports_dir_path / f"eval-{effective_run_id}.md"
        summary = build_summary_from_rows(
            rows,
            run_jsonl_path=run_jsonl_path,
            report_md_path=report_path,
        )
        _REGISTERED_REPORT_WRITER(summary, rows, report_path)
    else:
        summary = build_summary_from_rows(
            rows,
            run_jsonl_path=run_jsonl_path,
            report_md_path=None,
        )

    return summary, rows


def add_eval_arguments(parser: argparse.ArgumentParser) -> None:
    """Register CLI arguments for `eval.py`."""
    parser.add_argument(
        "--dataset",
        dest="dataset_path",
        type=Path,
        default=DEFAULT_DATASET_PATH,
        help="Path to JSONL dataset (default: data/dataset.example.jsonl).",
    )
    parser.add_argument(
        "--videos-dir",
        type=Path,
        default=None,
        help="Directory containing video files (overrides VIDEOS_DIR env var).",
    )
    parser.add_argument(
        "--runs-dir",
        type=Path,
        default=DEFAULT_RUNS_DIR,
        help="Directory for raw JSONL run outputs (default: runs/).",
    )
    parser.add_argument(
        "--reports-dir",
        type=Path,
        default=DEFAULT_REPORTS_DIR,
        help="Directory for generated Markdown reports (default: reports/).",
    )
    parser.add_argument(
        "--run-id",
        type=str,
        default=None,
        help="Explicit identifier for runs/<timestamp>.jsonl and reports/eval-<timestamp>.md.",
    )
    parser.add_argument(
        "--fake",
        action="store_true",
        help="Run evaluation in offline deterministic --fake mode.",
    )
    parser.add_argument(
        "--provider",
        type=str,
        choices=SUPPORTED_PROVIDERS,
        default=None,
        help="Provider: openrouter, gemini, or fake.",
    )
    parser.add_argument(
        "--model",
        type=str,
        default=None,
        help="Model override.",
    )
    parser.add_argument(
        "--similarity-threshold",
        type=float,
        default=DEFAULT_SIMILARITY_THRESHOLD,
        help="Fuzzy name similarity threshold (0.0..1.0, default: 0.65).",
    )
    parser.add_argument(
        "--dsn",
        type=str,
        default=None,
        help="PostgreSQL/PostGIS DSN.",
    )
    parser.add_argument(
        "--in-memory-matcher",
        action="store_true",
        help="Use in-memory fixture matcher instead of PostGIS.",
    )
    parser.add_argument(
        "--no-cache",
        action="store_true",
        help="Disable SQLite cache during evaluation.",
    )
    parser.add_argument(
        "--no-report",
        action="store_true",
        help="Skip automatic Markdown report generation.",
    )


def main(argv: Sequence[str] | None = None) -> int:
    """CLI entrypoint for `eval.py`."""
    parser = argparse.ArgumentParser(
        prog="eval",
        description="Run evaluation dataset through extraction + PostGIS matching pipeline.",
    )
    add_eval_arguments(parser)
    args = parser.parse_args(list(argv) if argv is not None else None)
    try:
        summary, _rows = run_eval(
            dataset_path=args.dataset_path,
            videos_dir=args.videos_dir,
            runs_dir=args.runs_dir,
            reports_dir=args.reports_dir,
            run_id=args.run_id,
            fake=bool(args.fake),
            provider=args.provider,
            model=args.model,
            similarity_threshold=args.similarity_threshold,
            no_cache=bool(args.no_cache),
            dsn=args.dsn,
            use_in_memory_matcher=bool(args.in_memory_matcher),
            write_report=not bool(args.no_report),
        )
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    sys.stdout.write(summary.model_dump_json(indent=2) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
