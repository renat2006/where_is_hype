"""SQLite cache for video place extraction keyed by canonical URL key or file SHA-256."""

from __future__ import annotations

import hashlib
import os
import sqlite3
import time
from datetime import UTC, datetime
from pathlib import Path

from pydantic import BaseModel, ConfigDict

from extractlab.canonical import canonicalize_url
from extractlab.gemini_client import ExtractClientProtocol
from extractlab.models import Extraction, ExtractionRunResult, TokenUsage

DEFAULT_CACHE_FILENAME = ".extractlab_cache.sqlite3"


class CachedRecord(BaseModel):
    """Single cached extraction record stored in SQLite."""

    model_config = ConfigDict(extra="forbid")

    cache_key: str
    extraction: Extraction
    usage: TokenUsage
    model: str
    cost_usd: float
    created_at: str


def compute_bytes_sha256(data: bytes) -> str:
    """Return `sha256:<hex>` key for raw bytes."""
    digest = hashlib.sha256(data).hexdigest()
    return f"sha256:{digest}"


def compute_file_sha256(file_path: Path | str) -> str:
    """Return `sha256:<hex>` key for a file on disk."""
    path = Path(file_path)
    hasher = hashlib.sha256()
    with path.open("rb") as fh:
        while chunk := fh.read(65536):
            hasher.update(chunk)
    return f"sha256:{hasher.hexdigest()}"


def resolve_cache_key(
    *,
    url: str | None = None,
    file_path: Path | str | None = None,
    video_bytes: bytes | None = None,
    caption: str = "",
) -> str:
    """Determine cache key from canonical URL key or SHA-256 of the input media."""
    if url and url.strip():
        return canonicalize_url(url)
    if video_bytes is not None:
        return compute_bytes_sha256(video_bytes)
    if file_path is not None:
        return compute_file_sha256(file_path)
    if caption.strip():
        return compute_bytes_sha256(caption.strip().encode("utf-8"))
    raise ValueError("Cannot compute cache key: provide url, video_bytes, file_path, or caption")


class ExtractionCache:
    """SQLite-backed extraction cache preventing duplicate LLM calls."""

    def __init__(self, db_path: Path | str | None = None) -> None:
        raw_path = db_path or os.environ.get("EXTRACTLAB_CACHE_PATH") or DEFAULT_CACHE_FILENAME
        self.db_path: str = str(raw_path)
        self._persistent_conn: sqlite3.Connection | None = None
        if self.db_path == ":memory:":
            self._persistent_conn = sqlite3.connect(":memory:")
        else:
            parent = Path(self.db_path).expanduser().resolve().parent
            parent.mkdir(parents=True, exist_ok=True)
        self._init_schema()

    def _connect(self) -> sqlite3.Connection:
        if self._persistent_conn is not None:
            return self._persistent_conn
        return sqlite3.connect(self.db_path)

    def _init_schema(self) -> None:
        conn = self._connect()
        try:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS extraction_cache (
                    cache_key TEXT PRIMARY KEY,
                    extraction_json TEXT NOT NULL,
                    usage_json TEXT NOT NULL,
                    model TEXT NOT NULL,
                    cost_usd REAL NOT NULL,
                    created_at TEXT NOT NULL
                )
                """
            )
            conn.commit()
        finally:
            if self._persistent_conn is None:
                conn.close()

    def get(self, cache_key: str) -> CachedRecord | None:
        """Look up a previously cached extraction by canonical key or sha256."""
        conn = self._connect()
        try:
            cursor = conn.execute(
                """
                SELECT cache_key, extraction_json, usage_json, model, cost_usd, created_at
                FROM extraction_cache
                WHERE cache_key = ?
                """,
                (cache_key,),
            )
            row = cursor.fetchone()
        finally:
            if self._persistent_conn is None:
                conn.close()

        if row is None:
            return None

        return CachedRecord(
            cache_key=str(row[0]),
            extraction=Extraction.model_validate_json(str(row[1])),
            usage=TokenUsage.model_validate_json(str(row[2])),
            model=str(row[3]),
            cost_usd=float(row[4]),
            created_at=str(row[5]),
        )

    def set(
        self,
        cache_key: str,
        *,
        extraction: Extraction,
        usage: TokenUsage,
        model: str,
        cost_usd: float,
    ) -> CachedRecord:
        """Insert or update an extraction record in SQLite."""
        created_at = datetime.now(UTC).isoformat()
        record = CachedRecord(
            cache_key=cache_key,
            extraction=extraction,
            usage=usage,
            model=model,
            cost_usd=cost_usd,
            created_at=created_at,
        )
        conn = self._connect()
        try:
            conn.execute(
                """
                INSERT INTO extraction_cache (
                    cache_key, extraction_json, usage_json, model, cost_usd, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(cache_key) DO UPDATE SET
                    extraction_json = excluded.extraction_json,
                    usage_json = excluded.usage_json,
                    model = excluded.model,
                    cost_usd = excluded.cost_usd,
                    created_at = excluded.created_at
                """,
                (
                    record.cache_key,
                    record.extraction.model_dump_json(),
                    record.usage.model_dump_json(),
                    record.model,
                    record.cost_usd,
                    record.created_at,
                ),
            )
            conn.commit()
        finally:
            if self._persistent_conn is None:
                conn.close()
        return record

    def clear(self) -> None:
        """Delete all entries from the cache."""
        conn = self._connect()
        try:
            conn.execute("DELETE FROM extraction_cache")
            conn.commit()
        finally:
            if self._persistent_conn is None:
                conn.close()

    def close(self) -> None:
        """Close persistent in-memory connection if open."""
        if self._persistent_conn is not None:
            self._persistent_conn.close()
            self._persistent_conn = None

    def extract_or_get(
        self,
        *,
        client: ExtractClientProtocol,
        cache_key: str | None = None,
        video_bytes: bytes | None = None,
        file_path: Path | str | None = None,
        caption: str = "",
        url: str | None = None,
        mime_type: str = "video/mp4",
        duration_sec: float | None = None,
        fps: float | None = None,
    ) -> ExtractionRunResult:
        """Return cached ExtractionRunResult on hit, or call client and persist on miss."""
        started = time.perf_counter()
        resolved_key = cache_key or resolve_cache_key(
            url=url,
            file_path=file_path,
            video_bytes=video_bytes,
            caption=caption,
        )

        cached = self.get(resolved_key)
        if cached is not None:
            latency_ms = round((time.perf_counter() - started) * 1000.0, 2)
            return ExtractionRunResult(
                items=cached.extraction.items,
                video_has_multiple_places=cached.extraction.video_has_multiple_places,
                resolution_hint=cached.extraction.resolution_hint,
                notes=cached.extraction.notes,
                extraction=cached.extraction,
                canonical_key=resolved_key,
                model=cached.model,
                usage=cached.usage,
                latency_ms=latency_ms,
                cost_usd=0.0,
                cache_hit=True,
            )

        client_resp = client.extract(
            video_bytes=video_bytes,
            caption=caption,
            url=url,
            mime_type=mime_type,
            duration_sec=duration_sec,
            fps=fps,
        )
        self.set(
            resolved_key,
            extraction=client_resp.extraction,
            usage=client_resp.usage,
            model=client_resp.model,
            cost_usd=client_resp.cost_usd,
        )
        latency_ms = round((time.perf_counter() - started) * 1000.0, 2)
        return ExtractionRunResult(
            items=client_resp.extraction.items,
            video_has_multiple_places=client_resp.extraction.video_has_multiple_places,
            resolution_hint=client_resp.extraction.resolution_hint,
            notes=client_resp.extraction.notes,
            extraction=client_resp.extraction,
            canonical_key=resolved_key,
            model=client_resp.model,
            usage=client_resp.usage,
            latency_ms=latency_ms,
            cost_usd=client_resp.cost_usd,
            cache_hit=False,
        )
