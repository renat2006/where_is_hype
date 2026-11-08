"""CLI entrypoint for `extractlab`."""

from __future__ import annotations

import argparse
import sys
import time
from collections.abc import Sequence
from pathlib import Path

from extractlab.cache import ExtractionCache, resolve_cache_key
from extractlab.gemini_client import (
    ExtractClientProtocol,
    FakeExtractClient,
    GeminiExtractClient,
)
from extractlab.models import ExtractionRunResult


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="extractlab",
        description="Extract places from short-form videos or links via Gemini.",
    )
    subparsers = parser.add_subparsers(dest="command")

    run_parser = subparsers.add_parser(
        "run",
        help="Run place extraction on a video file and/or URL + caption.",
    )
    _add_run_arguments(run_parser)
    return parser


def _add_run_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--file",
        dest="file_path",
        type=Path,
        default=None,
        help="Path to the video file (up to 20 MB inline).",
    )
    parser.add_argument(
        "--caption",
        type=str,
        default="",
        help="Video caption / description text.",
    )
    parser.add_argument(
        "--url",
        type=str,
        default=None,
        help="Source video/post URL (Instagram, TikTok, YouTube Shorts, VK, Telegram).",
    )
    parser.add_argument(
        "--fake",
        action="store_true",
        help="Use deterministic offline FakeExtractClient without network or API key.",
    )
    parser.add_argument(
        "--model",
        type=str,
        default=None,
        help="Override GEMINI_MODEL (defaults to gemini-2.5-flash).",
    )
    parser.add_argument(
        "--cache-db",
        type=Path,
        default=None,
        help="Path to SQLite cache database file.",
    )
    parser.add_argument(
        "--no-cache",
        action="store_true",
        help="Bypass SQLite cache.",
    )
    parser.add_argument(
        "--duration-sec",
        type=float,
        default=None,
        help="Video duration in seconds (clips <= 18s use fps=2 by default).",
    )
    parser.add_argument(
        "--fps",
        type=float,
        default=None,
        help="Explicit FPS override for Gemini video_metadata.",
    )


def run_extraction(
    *,
    file_path: Path | str | None = None,
    caption: str = "",
    url: str | None = None,
    fake: bool = False,
    model: str | None = None,
    cache_db: Path | str | None = None,
    no_cache: bool = False,
    duration_sec: float | None = None,
    fps: float | None = None,
    client: ExtractClientProtocol | None = None,
) -> ExtractionRunResult:
    """High-level helper executing extraction with SQLite caching."""
    video_bytes: bytes | None = None
    resolved_file = Path(file_path) if file_path is not None else None

    if resolved_file is not None:
        if resolved_file.exists():
            video_bytes = resolved_file.read_bytes()
        elif fake:
            video_bytes = f"fake-video:{resolved_file.name}:{caption}".encode()
        else:
            raise FileNotFoundError(f"Video file not found: {resolved_file}")

    active_client: ExtractClientProtocol
    if client is not None:
        active_client = client
    elif fake:
        active_client = FakeExtractClient(model=model)
    else:
        active_client = GeminiExtractClient(model=model)

    cache_key = resolve_cache_key(
        url=url,
        file_path=resolved_file if (resolved_file and resolved_file.exists()) else None,
        video_bytes=video_bytes,
        caption=caption,
    )

    if no_cache:
        started = time.perf_counter()
        resp = active_client.extract(
            video_bytes=video_bytes,
            caption=caption,
            url=url,
            duration_sec=duration_sec,
            fps=fps,
        )
        latency_ms = round((time.perf_counter() - started) * 1000.0, 2)
        return ExtractionRunResult(
            items=resp.extraction.items,
            video_has_multiple_places=resp.extraction.video_has_multiple_places,
            resolution_hint=resp.extraction.resolution_hint,
            notes=resp.extraction.notes,
            extraction=resp.extraction,
            canonical_key=cache_key,
            model=resp.model,
            usage=resp.usage,
            latency_ms=latency_ms,
            cost_usd=resp.cost_usd,
            cache_hit=False,
        )

    cache = ExtractionCache(db_path=cache_db)
    try:
        return cache.extract_or_get(
            client=active_client,
            cache_key=cache_key,
            video_bytes=video_bytes,
            file_path=resolved_file,
            caption=caption,
            url=url,
            duration_sec=duration_sec,
            fps=fps,
        )
    finally:
        cache.close()


def main(argv: Sequence[str] | None = None) -> int:
    """CLI entrypoint for `extractlab`."""
    raw_args = list(argv) if argv is not None else sys.argv[1:]
    if raw_args and raw_args[0] not in {"run", "-h", "--help"}:
        raw_args = ["run", *raw_args]

    parser = _build_parser()
    args = parser.parse_args(raw_args)

    if args.command != "run":
        parser.print_help()
        return 1

    try:
        result = run_extraction(
            file_path=args.file_path,
            caption=args.caption,
            url=args.url,
            fake=bool(args.fake),
            model=args.model,
            cache_db=args.cache_db,
            no_cache=bool(args.no_cache),
            duration_sec=args.duration_sec,
            fps=args.fps,
        )
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    sys.stdout.write(result.model_dump_json(indent=2) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
