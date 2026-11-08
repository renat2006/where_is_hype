"""Markdown report generator (`report.py` -> `reports/eval-<timestamp>.md`)."""

from __future__ import annotations

import argparse
import sys
from collections.abc import Sequence
from pathlib import Path

from extractlab.eval import (
    DEFAULT_REPORTS_DIR,
    EvalFailure,
    EvalRunRow,
    EvalSummary,
    FailureReason,
    SliceMetrics,
    build_summary_from_rows,
    evaluate_record,
    load_run_rows,
    register_report_writer,
)

FAILURE_REASONS_ORDER: tuple[FailureReason, ...] = (
    "не нашли",
    "не то место",
    "галлюцинация",
    "не тот филиал",
)


_PACKAGE_ROOT = Path(__file__).resolve().parents[2]


def _fmt_rel_path(raw_path: str) -> str:
    try:
        return str(Path(raw_path).resolve().relative_to(_PACKAGE_ROOT))
    except ValueError:
        return raw_path


def _fmt_pct(val: float | None) -> str:
    if val is None:
        return "—"
    return f"{val * 100.0:.1f}%"


def _fmt_ms(val: float) -> str:
    return f"{val:.1f}"


def _fmt_usd(val: float) -> str:
    return f"${val:.6f}"


def _render_slice_row(label: str, m: SliceMetrics) -> str:
    cols = (
        f"`{label}`",
        str(m.clips_count),
        str(m.gold_places_count),
        str(m.predicted_places_count),
        _fmt_pct(m.recall),
        _fmt_pct(m.precision),
        _fmt_pct(m.address_or_metro_accuracy),
        _fmt_pct(m.resolution_status_accuracy),
        _fmt_pct(m.no_place_rejection_rate),
        _fmt_ms(m.latency_p50_ms),
        _fmt_ms(m.latency_p95_ms),
        _fmt_usd(m.mean_cost_usd),
        _fmt_usd(m.total_cost_usd),
    )
    return "| " + " | ".join(cols) + " |"


def _render_conditions_and_overall(summary: EvalSummary) -> list[str]:
    ov = summary.overall
    no_place_pct = _fmt_pct(ov.no_place_rejection_rate)
    no_place_ratio = f"({ov.no_place_correct_rejections}/{ov.no_place_clips_count})"
    status_pct = _fmt_pct(ov.resolution_status_accuracy)
    status_ratio = f"({ov.status_correct}/{ov.status_total})"
    addr_pct = _fmt_pct(ov.address_or_metro_accuracy)
    addr_ratio = f"({ov.address_or_metro_correct}/{ov.address_or_metro_total})"
    return [
        f"# Отчёт оценки пайплайна `extract-lab` (`{summary.run_id}`)",
        "",
        "## Условия прогона",
        "",
        "| Параметр | Значение |",
        "| --- | --- |",
        f"| **ID прогона (`run_id`)** | `{summary.run_id}` |",
        f"| **Дата и время (UTC)** | `{summary.timestamp}` |",
        f"| **Режим (`mode`)** | `{summary.mode}` |",
        f"| **Провайдер (`provider`)** | `{summary.provider}` |",
        f"| **Модель (`model`)** | `{summary.model}` |",
        f"| **Версия промпта** | `{summary.prompt_version}` |",
        f"| **Порог нечёткого совпадения имён** | `{summary.similarity_threshold:.2f}` |",
        f"| **Датасет** | `{_fmt_rel_path(summary.dataset_path)}` |",
        f"| **Каталог видео (`VIDEOS_DIR`)** | `{summary.videos_dir or 'не задан'}` |",
        f"| **Сырой лог прогона** | `{_fmt_rel_path(summary.run_jsonl_path)}` |",
        "",
        "## Сводные метрики",
        "",
        "| Метрика | Значение |",
        "| --- | --- |",
        f"| Всего роликов / размеченных | {ov.clips_count} / {ov.labeled_clips_count} |",
        (
            f"| Мест в `gold` / предсказано / совпало | "
            f"{ov.gold_places_count} / {ov.predicted_places_count} / {ov.matched_gold_count} |"
        ),
        f"| **Recall мест** | **{_fmt_pct(ov.recall)}** |",
        f"| **Precision мест** | **{_fmt_pct(ov.precision)}** |",
        f"| **F1 мест** | **{_fmt_pct(ov.f1)}** |",
        f"| **Доля верных адресов или метро** | **{addr_pct}** {addr_ratio} |",
        f"| **Доля верных `resolution_status`** | **{status_pct}** {status_ratio} |",
        f"| **Доля корректных отказов для `no_place`** | **{no_place_pct}** {no_place_ratio} |",
        (
            f"| **Латентность `p50` / `p95`** | **{_fmt_ms(ov.latency_p50_ms)} мс** / "
            f"**{_fmt_ms(ov.latency_p95_ms)} мс** |"
        ),
        (
            f"| **Цена на ролик / в сумме** | **{_fmt_usd(ov.mean_cost_usd)}** / "
            f"**{_fmt_usd(ov.total_cost_usd)}** |"
        ),
        "",
    ]


def _render_failures_section(failures: Sequence[EvalFailure]) -> list[str]:
    counts_by_reason: dict[FailureReason, int] = dict.fromkeys(FAILURE_REASONS_ORDER, 0)
    for fail in failures:
        counts_by_reason[fail.reason] = counts_by_reason.get(fail.reason, 0) + 1

    lines = [
        "## Список провалов и ошибок",
        "",
        "| Причина провала | Количество |",
        "| --- | ---: |",
        *[f"| `{r}` | {counts_by_reason[r]} |" for r in FAILURE_REASONS_ORDER],
        "",
    ]

    if not failures:
        lines.append("Провалов на данной выборке не зафиксировано (`0` ошибок).")
        lines.append("")
        return lines

    lines.append(
        "| ID ролика | Тип случая | Причина | Ожидалось (`gold`) | "
        "Получено (`predicted`) | Статус (ожид. → факт.) | Пояснение |"
    )
    lines.append("| --- | --- | --- | --- | --- | --- | --- |")
    for fail in failures:
        gold_str = fail.gold_name or "—"
        if fail.gold_address:
            gold_str += f" ({fail.gold_address})"
        pred_str = fail.predicted_name or "—"
        if fail.predicted_address:
            pred_str += f" ({fail.predicted_address})"
        status_str = f"`{fail.expected_status or '—'}` → `{fail.predicted_status or '—'}`"
        lines.append(
            f"| `{fail.record_id}` | `{fail.case_type}` | **{fail.reason}** | "
            f"{gold_str} | {pred_str} | {status_str} | {fail.detail} |"
        )
    lines.append("")
    return lines


def _render_examples_section(rows: Sequence[EvalRunRow]) -> list[str]:
    lines = ["## Примеры разбора", ""]
    for row in rows[:6]:
        rec = row.record
        pr = row.pipeline_result
        gold_desc = (
            ", ".join(
                f"{g.name}" + (f" ({g.address})" if g.address else "") for g in (rec.gold or [])
            )
            if rec.gold
            else "нет мест (`[]`)"
        )
        if not pr.places:
            pred_desc = "нет извлечённых мест (`[]`)"
        else:
            parts: list[str] = []
            for p in pr.places:
                addr_info = (
                    p.matched_place.address_full
                    if (p.matched_place and p.matched_place.address_full)
                    else (p.extracted.address_raw or "без адреса")
                )
                parts.append(
                    f"`{p.extracted.name}` → статус `{p.resolution_status}` "
                    f"({addr_info}, `needs_user_choice={p.needs_user_choice}`)"
                )
            pred_desc = "; ".join(parts)

        clean_caption = " / ".join(
            part.strip() for part in rec.caption.splitlines() if part.strip()
        )
        lines.extend(
            [
                f"### `{rec.id}` (`{rec.case_type}`)",
                f"- **Источник:** `{rec.source_url}` (ключ `{pr.canonical_key}`)",
                f"- **Подпись:** {clean_caption[:160]}",
                f"- **Эталон (`gold`):** {gold_desc}",
                f"- **Результат пайплайна:** {pred_desc}",
                (
                    f"- **Требуется выбор пользователя (`needs_user_choice`):** "
                    f"`{pr.needs_user_choice}`"
                ),
                (
                    f"- **Задержки по этапам:** кэш `{pr.stage_latencies_ms.cache_ms:.2f} мс`, "
                    f"извлечение `{pr.stage_latencies_ms.extraction_ms:.2f} мс`, "
                    f"матчинг PostGIS `{pr.stage_latencies_ms.matching_ms:.2f} мс`, "
                    f"всего `{pr.latency_ms:.2f} мс` | **Цена:** `{_fmt_usd(pr.cost_usd)}`"
                ),
                "",
            ]
        )
    return lines


def render_eval_report_markdown(
    summary: EvalSummary,
    rows: Sequence[EvalRunRow],
) -> str:
    """Render a full Markdown evaluation report from EvalSummary and EvalRunRow items."""
    lines = _render_conditions_and_overall(summary)

    sep_cols = ["---", *(["---:"] * 12)]
    lines.extend(
        [
            "## Метрики по типам случаев (`case_type`)",
            "",
            (
                "| Тип случая (`case_type`) | Роликов | Gold мест | Найдено | Recall | Precision | "
                "Верный адрес/метро | Верный status | Отказ `no_place` | p50 (мс) | p95 (мс) | "
                "Цена/ролик | Цена всего |"
            ),
            "| " + " | ".join(sep_cols) + " |",
            *[_render_slice_row(ct, slice_m) for ct, slice_m in summary.by_case_type.items()],
            _render_slice_row("ИТОГО (overall)", summary.overall),
            "",
        ]
    )

    lines.extend(_render_failures_section(summary.failures))
    lines.extend(_render_examples_section(rows))

    lines.append("## Что не проверено")
    lines.append("")
    if summary.unverified_warnings:
        for warn in summary.unverified_warnings:
            lines.append(f"- {warn}")
    else:
        lines.append("- Все целевые типы случаев представлены не менее чем 5 роликами.")
    lines.append("")

    return "\n".join(lines)


def write_eval_report(
    summary: EvalSummary,
    rows: Sequence[EvalRunRow],
    output_path: Path | str,
) -> Path:
    """Render and write the Markdown report to disk."""
    target = Path(output_path)
    target.parent.mkdir(parents=True, exist_ok=True)
    content = render_eval_report_markdown(summary, rows)
    target.write_text(content, encoding="utf-8")
    return target


register_report_writer(write_eval_report)


def generate_report_from_run_file(
    run_jsonl_path: Path | str,
    output_md_path: Path | str | None = None,
    *,
    similarity_threshold: float | None = None,
    min_per_case_type: int = 5,
) -> Path:
    """Load `runs/<timestamp>.jsonl`, optionally re-score, and write Markdown report."""
    rows = load_run_rows(run_jsonl_path)
    if not rows:
        raise ValueError(f"Run file contains no rows: {run_jsonl_path}")

    if similarity_threshold is not None:
        updated_rows: list[EvalRunRow] = []
        for r in rows:
            re_eval = evaluate_record(
                r.record,
                r.pipeline_result,
                similarity_threshold=similarity_threshold,
            )
            updated_rows.append(
                r.model_copy(
                    update={
                        "similarity_threshold": similarity_threshold,
                        "evaluation": re_eval,
                    }
                )
            )
        rows = updated_rows

    run_id = rows[0].run_id
    target_md = (
        Path(output_md_path)
        if output_md_path is not None
        else (DEFAULT_REPORTS_DIR / f"eval-{run_id}.md")
    )
    summary = build_summary_from_rows(
        rows,
        run_jsonl_path=run_jsonl_path,
        report_md_path=target_md,
        min_per_case_type=min_per_case_type,
    )
    return write_eval_report(summary, rows, target_md)


def add_report_arguments(parser: argparse.ArgumentParser) -> None:
    """Register CLI arguments for `report.py`."""
    parser.add_argument(
        "run_jsonl",
        type=Path,
        help="Path to raw evaluation run file (`runs/<timestamp>.jsonl`).",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Output Markdown path (default: reports/eval-<timestamp>.md).",
    )
    parser.add_argument(
        "--similarity-threshold",
        type=float,
        default=None,
        help="Optional override for fuzzy name similarity threshold.",
    )
    parser.add_argument(
        "--min-per-case-type",
        type=int,
        default=5,
        help="Minimum clips per case_type before flagging in 'Что не проверено' (default: 5).",
    )


def main(argv: Sequence[str] | None = None) -> int:
    """CLI entrypoint for `report.py`."""
    parser = argparse.ArgumentParser(
        prog="report",
        description="Generate Markdown evaluation report from runs/<timestamp>.jsonl.",
    )
    add_report_arguments(parser)
    args = parser.parse_args(list(argv) if argv is not None else None)
    try:
        out_path = generate_report_from_run_file(
            args.run_jsonl,
            args.output,
            similarity_threshold=args.similarity_threshold,
            min_per_case_type=args.min_per_case_type,
        )
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    sys.stdout.write(f"{out_path}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
