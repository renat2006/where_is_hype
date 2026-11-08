from __future__ import annotations

import contextlib
import json
import sqlite3
import tempfile
import threading
import uuid
from collections.abc import Iterator
from pathlib import Path
from typing import Any

from where_is_hype_api.domain import (
    create_shortlist_expires_at,
    normalize_link_for_compare,
    now_iso,
)
from where_is_hype_api.fixtures import PLACES_FIXTURE
from where_is_hype_api.schemas import (
    Candidate,
    Place,
    ReportResponse,
    SavedPlace,
    SessionModel,
    Shortlist,
)


def _create_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


class SqliteStorage:
    """SQLite-backed temporary MVP storage for sessions, places, shortlists, reports, and events."""

    def __init__(self, database_path: str | Path) -> None:
        raw_path = str(database_path)
        if raw_path == ":memory:":
            with tempfile.NamedTemporaryFile(
                prefix="where_is_hype_", suffix=".db", delete=False
            ) as tmp:
                self._db_path = tmp.name
        else:
            resolved = Path(raw_path).expanduser().resolve()
            resolved.parent.mkdir(parents=True, exist_ok=True)
            self._db_path = str(resolved)
        self._lock = threading.RLock()
        self._init_db()

    @contextlib.contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        with (
            self._lock,
            contextlib.closing(sqlite3.connect(self._db_path, check_same_thread=False)) as conn,
        ):
            conn.row_factory = sqlite3.Row
            yield conn

    def close(self) -> None:
        return None

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS sessions (
                    id TEXT PRIMARY KEY,
                    bucket_key TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_sessions_bucket ON sessions(bucket_key);

                CREATE TABLE IF NOT EXISTS places (
                    id TEXT PRIMARY KEY,
                    sort_order INTEGER NOT NULL,
                    in_catalog INTEGER NOT NULL DEFAULT 1,
                    data_json TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS saved_places (
                    bucket_key TEXT NOT NULL,
                    place_id TEXT NOT NULL,
                    sort_order INTEGER NOT NULL,
                    source_url_norm TEXT,
                    data_json TEXT NOT NULL,
                    PRIMARY KEY (bucket_key, place_id)
                );

                CREATE TABLE IF NOT EXISTS shortlists (
                    bucket_key TEXT PRIMARY KEY,
                    token TEXT NOT NULL,
                    data_json TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS shared_shortlists (
                    token TEXT PRIMARY KEY,
                    bucket_key TEXT NOT NULL,
                    data_json TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS reports (
                    id TEXT PRIMARY KEY,
                    bucket_key TEXT NOT NULL,
                    query TEXT NOT NULL,
                    source_url TEXT,
                    comment TEXT,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    bucket_key TEXT NOT NULL,
                    event TEXT NOT NULL,
                    anonymous_id TEXT,
                    timestamp TEXT,
                    props_json TEXT
                );

                CREATE TABLE IF NOT EXISTS link_resolutions (
                    canonical_key TEXT PRIMARY KEY,
                    canonical_url TEXT NOT NULL,
                    response_json TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                """
            )
            cur = conn.execute("SELECT COUNT(*) AS cnt FROM places")
            row = cur.fetchone()
            if row and int(row["cnt"]) == 0:
                for idx, place in enumerate(PLACES_FIXTURE):
                    conn.execute(
                        """
                        INSERT INTO places (id, sort_order, in_catalog, data_json)
                        VALUES (?, ?, 1, ?)
                        """,
                        (place.id, idx, place.model_dump_json()),
                    )
            conn.commit()

    def resolve_bucket_key(self, explicit_session_id: str | None) -> str:
        if not explicit_session_id:
            return "default"
        with self._connect() as conn:
            row = conn.execute(
                "SELECT bucket_key FROM sessions WHERE id = ?",
                (explicit_session_id,),
            ).fetchone()
            if row:
                return str(row["bucket_key"])
            return explicit_session_id

    def get_session(self, explicit_session_id: str | None) -> SessionModel | None:
        with self._connect() as conn:
            if explicit_session_id:
                row = conn.execute(
                    "SELECT id, created_at FROM sessions WHERE id = ?",
                    (explicit_session_id,),
                ).fetchone()
                if row:
                    return SessionModel(id=str(row["id"]), createdAt=str(row["created_at"]))
                row_by_bucket = conn.execute(
                    "SELECT id, created_at FROM sessions "
                    "WHERE bucket_key = ? ORDER BY rowid DESC LIMIT 1",
                    (explicit_session_id,),
                ).fetchone()
                if row_by_bucket:
                    return SessionModel(
                        id=str(row_by_bucket["id"]),
                        createdAt=str(row_by_bucket["created_at"]),
                    )
                return None

            row = conn.execute(
                "SELECT id, created_at FROM sessions "
                "WHERE bucket_key = 'default' ORDER BY rowid DESC LIMIT 1"
            ).fetchone()
            if not row:
                return None
            return SessionModel(id=str(row["id"]), createdAt=str(row["created_at"]))

    def get_or_create_session(
        self,
        explicit_session_id: str | None,
    ) -> tuple[SessionModel, bool]:
        with self._connect() as conn:
            existing = self.get_session(explicit_session_id)
            if existing:
                return (existing, False)

            bucket_key = explicit_session_id or "default"
            session_id = (
                explicit_session_id
                if explicit_session_id and explicit_session_id.startswith("usr-")
                else _create_id("usr")
            )
            created_at = now_iso()
            conn.execute(
                "INSERT INTO sessions (id, bucket_key, created_at) VALUES (?, ?, ?)",
                (session_id, bucket_key, created_at),
            )
            conn.commit()
            return (SessionModel(id=session_id, createdAt=created_at), True)

    def list_places(self) -> list[Place]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT data_json FROM places WHERE in_catalog = 1 ORDER BY sort_order ASC"
            ).fetchall()
            return [Place.model_validate_json(str(r["data_json"])) for r in rows]

    def get_place(self, place_id: str) -> Place | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT data_json FROM places WHERE id = ?",
                (place_id,),
            ).fetchone()
            if not row:
                return None
            return Place.model_validate_json(str(row["data_json"]))

    def upsert_place(self, place: Place, *, in_catalog: bool = False) -> None:
        with self._connect() as conn:
            existing = conn.execute(
                "SELECT sort_order, in_catalog FROM places WHERE id = ?",
                (place.id,),
            ).fetchone()
            if existing:
                keep_catalog = 1 if (int(existing["in_catalog"]) == 1 or in_catalog) else 0
                conn.execute(
                    "UPDATE places SET in_catalog = ?, data_json = ? WHERE id = ?",
                    (keep_catalog, place.model_dump_json(), place.id),
                )
            else:
                max_row = conn.execute(
                    "SELECT COALESCE(MAX(sort_order), 0) AS max_ord FROM places"
                ).fetchone()
                next_order = (int(max_row["max_ord"]) if max_row else 0) + 1
                conn.execute(
                    "INSERT INTO places (id, sort_order, in_catalog, data_json) "
                    "VALUES (?, ?, ?, ?)",
                    (place.id, next_order, 1 if in_catalog else 0, place.model_dump_json()),
                )
            conn.commit()

    def list_saved_places(self, bucket_key: str) -> list[SavedPlace]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT data_json FROM saved_places WHERE bucket_key = ? ORDER BY sort_order ASC",
                (bucket_key,),
            ).fetchall()
            return [SavedPlace.model_validate_json(str(r["data_json"])) for r in rows]

    def find_duplicate_saved_place(
        self,
        bucket_key: str,
        place_id: str,
        normalized_source_url: str | None,
    ) -> SavedPlace | None:
        for item in self.list_saved_places(bucket_key):
            if item.place.id == place_id:
                return item
            if (
                normalized_source_url
                and item.sourceUrl
                and normalize_link_for_compare(item.sourceUrl) == normalized_source_url
            ):
                return item
        return None

    def insert_saved_place(
        self,
        bucket_key: str,
        saved_place: SavedPlace,
        *,
        prepend: bool = True,
    ) -> None:
        self.upsert_place(saved_place.place, in_catalog=False)
        with self._connect() as conn:
            if prepend:
                min_row = conn.execute(
                    "SELECT COALESCE(MIN(sort_order), 0) AS min_ord "
                    "FROM saved_places WHERE bucket_key = ?",
                    (bucket_key,),
                ).fetchone()
                order = (int(min_row["min_ord"]) if min_row else 0) - 1
            else:
                max_row = conn.execute(
                    "SELECT COALESCE(MAX(sort_order), 0) AS max_ord "
                    "FROM saved_places WHERE bucket_key = ?",
                    (bucket_key,),
                ).fetchone()
                order = (int(max_row["max_ord"]) if max_row else 0) + 1

            norm_url = (
                normalize_link_for_compare(saved_place.sourceUrl) if saved_place.sourceUrl else None
            )
            conn.execute(
                """
                INSERT OR REPLACE INTO saved_places
                (bucket_key, place_id, sort_order, source_url_norm, data_json)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    bucket_key,
                    saved_place.place.id,
                    order,
                    norm_url,
                    saved_place.model_dump_json(),
                ),
            )
            conn.commit()

    def update_saved_place(self, bucket_key: str, saved_place: SavedPlace) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE saved_places
                SET data_json = ?
                WHERE bucket_key = ? AND place_id = ?
                """,
                (saved_place.model_dump_json(), bucket_key, saved_place.place.id),
            )
            conn.commit()

    def delete_saved_place(self, bucket_key: str, place_id: str) -> SavedPlace | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT data_json FROM saved_places WHERE bucket_key = ? AND place_id = ?",
                (bucket_key, place_id),
            ).fetchone()
            if not row:
                return None
            existing = SavedPlace.model_validate_json(str(row["data_json"]))
            conn.execute(
                "DELETE FROM saved_places WHERE bucket_key = ? AND place_id = ?",
                (bucket_key, place_id),
            )

            shortlist_row = conn.execute(
                "SELECT data_json FROM shortlists WHERE bucket_key = ?",
                (bucket_key,),
            ).fetchone()
            if shortlist_row:
                shortlist = Shortlist.model_validate_json(str(shortlist_row["data_json"]))
                updated = Shortlist(
                    token=shortlist.token,
                    places=[p for p in shortlist.places if p.id != place_id],
                    createdAt=shortlist.createdAt,
                    expiresAt=shortlist.expiresAt,
                    votes=shortlist.votes,
                )
                conn.execute(
                    "UPDATE shortlists SET data_json = ? WHERE bucket_key = ?",
                    (updated.model_dump_json(), bucket_key),
                )
                conn.execute(
                    "UPDATE shared_shortlists SET data_json = ? WHERE token = ?",
                    (updated.model_dump_json(), updated.token),
                )

            conn.commit()
            return existing

    def ensure_shortlist(self, bucket_key: str) -> Shortlist:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT data_json FROM shortlists WHERE bucket_key = ?",
                (bucket_key,),
            ).fetchone()
            if row:
                current = Shortlist.model_validate_json(str(row["data_json"]))
                shared_row = conn.execute(
                    "SELECT data_json FROM shared_shortlists WHERE token = ?",
                    (current.token,),
                ).fetchone()
                if shared_row:
                    shared = Shortlist.model_validate_json(str(shared_row["data_json"]))
                    if shared.votes != current.votes:
                        current = Shortlist(
                            token=current.token,
                            places=current.places,
                            createdAt=current.createdAt,
                            expiresAt=current.expiresAt,
                            votes=shared.votes,
                        )
                        conn.execute(
                            "UPDATE shortlists SET data_json = ? WHERE bucket_key = ?",
                            (current.model_dump_json(), bucket_key),
                        )
                        conn.commit()
                return current

            created_at = now_iso()
            token = "evening-demo" if bucket_key == "default" else f"evening-{bucket_key[:12]}"
            initial = Shortlist(
                token=token,
                places=[],
                createdAt=created_at,
                expiresAt=create_shortlist_expires_at(created_at),
                votes=[],
            )
            conn.execute(
                "INSERT INTO shortlists (bucket_key, token, data_json) VALUES (?, ?, ?)",
                (bucket_key, token, initial.model_dump_json()),
            )
            conn.commit()
            return initial

    def save_shortlist(self, bucket_key: str, shortlist: Shortlist) -> Shortlist:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO shortlists (bucket_key, token, data_json)
                VALUES (?, ?, ?)
                """,
                (bucket_key, shortlist.token, shortlist.model_dump_json()),
            )
            conn.execute(
                "UPDATE shared_shortlists SET data_json = ? WHERE token = ?",
                (shortlist.model_dump_json(), shortlist.token),
            )
            conn.commit()
            return shortlist

    def share_shortlist(self, bucket_key: str) -> Shortlist:
        current = self.ensure_shortlist(bucket_key)
        with self._connect() as conn:
            created_at = now_iso()
            token = current.token or _create_id("sh")
            shared = Shortlist(
                token=token,
                places=current.places,
                createdAt=created_at,
                expiresAt=create_shortlist_expires_at(created_at),
                votes=current.votes,
            )
            conn.execute(
                """
                INSERT OR REPLACE INTO shortlists (bucket_key, token, data_json)
                VALUES (?, ?, ?)
                """,
                (bucket_key, token, shared.model_dump_json()),
            )
            conn.execute(
                """
                INSERT OR REPLACE INTO shared_shortlists (token, bucket_key, data_json)
                VALUES (?, ?, ?)
                """,
                (token, bucket_key, shared.model_dump_json()),
            )
            conn.commit()
            return shared

    def get_shared_shortlist(self, token: str) -> Shortlist | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT data_json FROM shared_shortlists WHERE token = ?",
                (token,),
            ).fetchone()
            if row:
                return Shortlist.model_validate_json(str(row["data_json"]))
            owner_row = conn.execute(
                "SELECT data_json FROM shortlists WHERE token = ? LIMIT 1",
                (token,),
            ).fetchone()
            if owner_row:
                return Shortlist.model_validate_json(str(owner_row["data_json"]))
            return None

    def save_shared_shortlist(self, token: str, shortlist: Shortlist) -> Shortlist:
        with self._connect() as conn:
            owner_row = conn.execute(
                "SELECT bucket_key FROM shared_shortlists WHERE token = ?",
                (token,),
            ).fetchone()
            bucket_key = str(owner_row["bucket_key"]) if owner_row else "default"
            conn.execute(
                """
                INSERT OR REPLACE INTO shared_shortlists (token, bucket_key, data_json)
                VALUES (?, ?, ?)
                """,
                (token, bucket_key, shortlist.model_dump_json()),
            )
            conn.execute(
                "UPDATE shortlists SET data_json = ? WHERE token = ?",
                (shortlist.model_dump_json(), token),
            )
            conn.commit()
            return shortlist

    def create_report(
        self,
        bucket_key: str,
        query: str,
        source_url: str | None,
        comment: str | None,
    ) -> ReportResponse:
        with self._connect() as conn:
            report_id = _create_id("rep")
            created_at = now_iso()
            conn.execute(
                """
                INSERT INTO reports (id, bucket_key, query, source_url, comment, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (report_id, bucket_key, query, source_url, comment, created_at),
            )
            conn.commit()
            return ReportResponse(
                id=report_id,
                query=query,
                sourceUrl=source_url,
                createdAt=created_at,
            )

    def create_event(
        self,
        bucket_key: str,
        event: str,
        anonymous_id: str | None,
        timestamp: str | None,
        props: dict[str, Any] | None,
    ) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO events (bucket_key, event, anonymous_id, timestamp, props_json)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    bucket_key,
                    event,
                    anonymous_id,
                    timestamp or now_iso(),
                    json.dumps(props, ensure_ascii=False) if props is not None else None,
                ),
            )
            conn.commit()

    def get_cached_resolution(self, canonical_key: str) -> list[Candidate] | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT response_json FROM link_resolutions WHERE canonical_key = ?",
                (canonical_key,),
            ).fetchone()
            if not row:
                return None
            raw_list = json.loads(str(row["response_json"]))
            if not isinstance(raw_list, list):
                return None
            return [Candidate.model_validate(item) for item in raw_list]

    def set_cached_resolution(
        self,
        canonical_key: str,
        canonical_url: str,
        candidates: list[Candidate],
    ) -> None:
        with self._connect() as conn:
            payload = json.dumps(
                [cand.model_dump() for cand in candidates],
                ensure_ascii=False,
            )
            conn.execute(
                """
                INSERT OR REPLACE INTO link_resolutions
                (canonical_key, canonical_url, response_json, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (canonical_key, canonical_url, payload, now_iso()),
            )
            conn.commit()
