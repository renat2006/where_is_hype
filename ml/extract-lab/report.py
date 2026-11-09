"""Top-level script wrapper for `extractlab.report`."""

from __future__ import annotations

from extractlab.report import (
    FAILURE_REASONS_ORDER,
    generate_report_from_run_file,
    main,
    render_eval_report_markdown,
    write_eval_report,
)

__all__ = [
    "FAILURE_REASONS_ORDER",
    "generate_report_from_run_file",
    "main",
    "render_eval_report_markdown",
    "write_eval_report",
]

if __name__ == "__main__":
    raise SystemExit(main())
