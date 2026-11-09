"""Top-level script wrapper for `extractlab.pipeline`."""

from __future__ import annotations

from extractlab.pipeline import (
    ExtractionPipeline,
    InMemoryPlaceMatcher,
    MatchedCandidate,
    MatcherProtocol,
    PipelinePlaceResult,
    PipelineResult,
    PipelineStageLatencies,
    PipelineStatus,
    ResolutionStatus,
    enrich_missing_place_stub,
    main,
    run_pipeline,
)

__all__ = [
    "ExtractionPipeline",
    "InMemoryPlaceMatcher",
    "MatchedCandidate",
    "MatcherProtocol",
    "PipelinePlaceResult",
    "PipelineResult",
    "PipelineStageLatencies",
    "PipelineStatus",
    "ResolutionStatus",
    "enrich_missing_place_stub",
    "main",
    "run_pipeline",
]

if __name__ == "__main__":
    raise SystemExit(main())
