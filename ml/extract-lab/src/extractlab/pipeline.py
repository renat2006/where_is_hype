"""End-to-end extraction and PostGIS place matching pipeline."""

from __future__ import annotations

import argparse
import math
import sys
import time
from collections.abc import Sequence
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Literal, Protocol

import psycopg
from pydantic import BaseModel, ConfigDict, Field

from extractlab.cache import ExtractionCache, resolve_cache_key
from extractlab.gemini_client import ExtractClientProtocol
from extractlab.models import ExtractedPlace, Extraction, TokenUsage
from extractlab.openrouter_client import (
    SUPPORTED_PROVIDERS,
    create_extract_client,
    resolve_provider,
)

_PACKAGE_ROOT = Path(__file__).resolve().parents[2]
_GEO_DIR = _PACKAGE_ROOT / "geo"
if str(_GEO_DIR) not in sys.path:
    sys.path.insert(0, str(_GEO_DIR))

from matcher import (  # noqa: E402
    MatchResult,
    PlaceCandidate,
    PlaceMatcher,
    build_translit_name,
    generate_query_variants,
    get_default_dsn,
    normalize_metro,
    normalize_name,
    normalize_street,
    transliterate_en_to_ru,
    transliterate_ru_to_en,
)

ResolutionStatus = Literal["exact", "chain_ambiguous", "ambiguous", "not_found"]
PipelineStatus = Literal["completed", "completed_partial", "failed_source", "failed_transient"]


class MatcherProtocol(Protocol):
    """Protocol implemented by both PostGIS PlaceMatcher and InMemoryPlaceMatcher."""

    def match(
        self,
        name: str,
        *,
        metro: str | None = None,
        street: str | None = None,
        geo_hint: str | None = None,
        category: str | None = None,
        limit: int = 5,
    ) -> MatchResult: ...


class MatchedCandidate(BaseModel):
    """Pydantic model for a single candidate matched in PostGIS."""

    model_config = ConfigDict(extra="forbid")

    osm_id: int
    name: str
    name_en: str | None = None
    category: str
    brand: str | None = None
    chain_branch_count: int = 1
    addr_street: str | None = None
    addr_housenumber: str | None = None
    address_full: str | None = None
    lat: float
    lon: float
    opening_hours: str | None = None
    score: float
    name_score: float
    geo_score: float
    metro_distance_m: float | None = None
    matched_metro: str | None = None
    reason: str

    @classmethod
    def from_dataclass(cls, cand: PlaceCandidate) -> MatchedCandidate:
        """Convert a matcher.PlaceCandidate dataclass into a Pydantic model."""
        return cls(
            osm_id=cand.osm_id,
            name=cand.name,
            name_en=cand.name_en,
            category=cand.category,
            brand=cand.brand,
            chain_branch_count=cand.chain_branch_count,
            addr_street=cand.addr_street,
            addr_housenumber=cand.addr_housenumber,
            address_full=cand.address_full,
            lat=cand.lat,
            lon=cand.lon,
            opening_hours=cand.opening_hours,
            score=cand.score,
            name_score=cand.name_score,
            geo_score=cand.geo_score,
            metro_distance_m=cand.metro_distance_m,
            matched_metro=cand.matched_metro,
            reason=cand.reason,
        )


class PipelinePlaceResult(BaseModel):
    """Resolution outcome for a single extracted place."""

    model_config = ConfigDict(extra="forbid")

    ordinal_index: int = Field(ge=1)
    extracted: ExtractedPlace
    resolution_status: ResolutionStatus
    needs_user_choice: bool = False
    matched_place: MatchedCandidate | None = None
    candidates: list[MatchedCandidate] = Field(default_factory=list)
    match_reason: str = ""
    enrichment_todo: str | None = None


class PipelineStageLatencies(BaseModel):
    """Breakdown of latency in milliseconds across pipeline stages."""

    model_config = ConfigDict(extra="forbid")

    cache_ms: float = Field(default=0.0, ge=0.0)
    extraction_ms: float = Field(default=0.0, ge=0.0)
    matching_ms: float = Field(default=0.0, ge=0.0)
    total_ms: float = Field(default=0.0, ge=0.0)


class PipelineResult(BaseModel):
    """Complete end-to-end pipeline output combining extraction and PostGIS matching."""

    model_config = ConfigDict(extra="forbid")

    status: PipelineStatus = "completed"
    canonical_key: str
    source_url: str | None = None
    places: list[PipelinePlaceResult] = Field(default_factory=list)
    needs_user_choice: bool = False
    video_has_multiple_places: bool = False
    resolution_hint: str = "exact"
    notes: str | None = None
    extraction: Extraction
    model: str
    usage: TokenUsage = Field(default_factory=TokenUsage)
    stage_latencies_ms: PipelineStageLatencies
    latency_ms: float = Field(default=0.0, ge=0.0)
    cost_usd: float = Field(default=0.0, ge=0.0)
    cache_hit: bool = False
    error_code: str | None = None
    error_detail: str | None = None


def enrich_missing_place_stub(place: ExtractedPlace) -> MatchResult:
    """Stub for the 'place not in database' branch.

    # TODO(K4): implement web enrichment (Yandex Search API + grounding check +
    # local PostGIS Moscow address geocoding) when a newly opened venue or pop-up
    # is not found in the local PostGIS database. Do not perform web search here.
    """
    norm = normalize_name(place.name)
    variants = generate_query_variants(place.name)
    return MatchResult(
        query=place.name,
        normalized_query=norm,
        translit_variants=variants,
        status="not_found",
        candidates=[],
        reason="TODO: place not in database; web enrichment stub (status=not_found)",
    )


def _haversine_distance_m(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    """Calculate distance in meters between two WGS84 points."""
    earth_radius_m = 6_371_000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
    return 2.0 * earth_radius_m * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))


def _word_sim(query: str, target: str) -> float:
    """Approximate pg_trgm word_similarity in pure Python for offline fallback."""
    if not query or not target:
        return 0.0
    if query == target or query in target.split():
        return 1.0
    if query in target:
        return 0.92
    tokens = target.split()
    best = SequenceMatcher(None, query, target).ratio()
    q_tokens = query.split()
    if len(q_tokens) <= len(tokens):
        window = len(q_tokens)
        for idx in range(len(tokens) - window + 1):
            sub = " ".join(tokens[idx : idx + window])
            best = max(best, SequenceMatcher(None, query, sub).ratio())
    return best


DEFAULT_IN_MEMORY_METROS: tuple[tuple[str, float, float], ...] = (
    ("Китай-город", 37.6300, 55.7563),
    ("Охотный Ряд", 37.6156, 55.7570),
    ("Тверская", 37.6039, 55.7653),
    ("Пушкинская", 37.6042, 55.7656),
    ("Третьяковская", 37.6258, 55.7408),
    ("Смоленская", 37.5823, 55.7478),
    ("Октябрьская", 37.6114, 55.7294),
    ("Кропоткинская", 37.6036, 55.7450),
    ("Чистые пруды", 37.6386, 55.7649),
    ("Маяковская", 37.5961, 55.7699),
    ("ВДНХ", 37.6414, 55.8214),
)

DEFAULT_IN_MEMORY_PLACES: tuple[dict[str, Any], ...] = (
    {
        "osm_id": 100001,
        "name": "Северяне",
        "name_en": "Severyane",
        "category": "restaurant",
        "brand": None,
        "chain_branch_count": 1,
        "addr_street": "Большая Никитская улица",
        "addr_housenumber": "12",
        "address_full": "Большая Никитская улица, 12",
        "lat": 55.7574,
        "lon": 37.6052,
        "opening_hours": "Mo-Su 09:00-24:00",
    },
    {
        "osm_id": 100002,
        "name": "Третьяковская галерея",
        "name_en": "Tretyakov Gallery",
        "category": "museum",
        "brand": None,
        "chain_branch_count": 1,
        "addr_street": "Лаврушинский переулок",
        "addr_housenumber": "10",
        "address_full": "Лаврушинский переулок, 10",
        "lat": 55.7415,
        "lon": 37.6208,
        "opening_hours": "Tu,We,Su 10:00-18:00; Th-Sa 10:00-21:00",
    },
    {
        "osm_id": 100003,
        "name": "White Rabbit",
        "name_en": "White Rabbit",
        "category": "restaurant",
        "brand": None,
        "chain_branch_count": 1,
        "addr_street": "Смоленская площадь",
        "addr_housenumber": "3",
        "address_full": "Смоленская площадь, 3",
        "lat": 55.7476,
        "lon": 37.5818,
        "opening_hours": "Mo-Su 12:00-24:00",
    },
    {
        "osm_id": 100004,
        "name": "Белуга",
        "name_en": "Beluga",
        "category": "restaurant",
        "brand": None,
        "chain_branch_count": 1,
        "addr_street": "Моховая улица",
        "addr_housenumber": "15/1",
        "address_full": "Моховая улица, 15/1",
        "lat": 55.7568,
        "lon": 37.6140,
        "opening_hours": "Mo-Su 12:00-24:00",
    },
    {
        "osm_id": 100005,
        "name": "Underdog",
        "name_en": "Underdog",
        "category": "bar",
        "brand": None,
        "chain_branch_count": 1,
        "addr_street": "улица Маросейка",
        "addr_housenumber": "6-8с1",
        "address_full": "улица Маросейка, 6-8с1",
        "lat": 55.7573,
        "lon": 37.6358,
        "opening_hours": "Mo-Su 12:00-24:00",
    },
    {
        "osm_id": 100006,
        "name": "Flâner",
        "name_en": "Flaner",
        "category": "bar",
        "brand": None,
        "chain_branch_count": 1,
        "addr_street": "Кривоколенный переулок",
        "addr_housenumber": "7",
        "address_full": "Кривоколенный переулок, 7",
        "lat": 55.7618,
        "lon": 37.6365,
        "opening_hours": "Mo-Su 12:00-24:00",
    },
    {
        "osm_id": 100007,
        "name": "Центр «Космонавтика и авиация»",
        "name_en": "Cosmonautics and Aviation Center",
        "category": "museum",
        "brand": None,
        "chain_branch_count": 1,
        "addr_street": "проспект Мира",
        "addr_housenumber": "119с34",
        "address_full": "проспект Мира, 119с34",
        "lat": 55.8352,
        "lon": 37.6227,
        "opening_hours": "Tu-Su 11:00-22:00",
    },
    {
        "osm_id": 100010,
        "name": "Surf Coffee",
        "name_en": "Surf Coffee",
        "category": "cafe",
        "brand": "Surf Coffee",
        "chain_branch_count": 3,
        "addr_street": "улица Покровка",
        "addr_housenumber": "17",
        "address_full": "улица Покровка, 17",
        "lat": 55.7592,
        "lon": 37.6448,
        "opening_hours": "Mo-Su 08:00-23:00",
    },
    {
        "osm_id": 100011,
        "name": "Surf Coffee",
        "name_en": "Surf Coffee",
        "category": "cafe",
        "brand": "Surf Coffee",
        "chain_branch_count": 3,
        "addr_street": "улица Солянка",
        "addr_housenumber": "1/2с1",
        "address_full": "улица Солянка, 1/2с1",
        "lat": 55.7540,
        "lon": 37.6375,
        "opening_hours": "Mo-Su 08:00-22:30",
    },
    {
        "osm_id": 100012,
        "name": "Surf Coffee",
        "name_en": "Surf Coffee",
        "category": "cafe",
        "brand": "Surf Coffee",
        "chain_branch_count": 3,
        "addr_street": "Тверская улица",
        "addr_housenumber": "20",
        "address_full": "Тверская улица, 20",
        "lat": 55.7664,
        "lon": 37.6028,
        "opening_hours": "Mo-Su 08:00-23:00",
    },
    {
        "osm_id": 100020,
        "name": "Дринкит",
        "name_en": "Drinkit",
        "category": "cafe",
        "brand": "Дринкит",
        "chain_branch_count": 2,
        "addr_street": "улица Мясницкая",
        "addr_housenumber": "13",
        "address_full": "улица Мясницкая, 13",
        "lat": 55.7629,
        "lon": 37.6345,
        "opening_hours": "Mo-Su 08:00-22:00",
    },
    {
        "osm_id": 100021,
        "name": "Дринкит",
        "name_en": "Drinkit",
        "category": "cafe",
        "brand": "Дринкит",
        "chain_branch_count": 2,
        "addr_street": "Лесная улица",
        "addr_housenumber": "20",
        "address_full": "Лесная улица, 20",
        "lat": 55.7801,
        "lon": 37.5902,
        "opening_hours": "Mo-Su 08:00-22:00",
    },
)


class InMemoryPlaceMatcher:
    """Deterministic in-memory matcher used when PostGIS is offline or in unit tests."""

    def __init__(
        self,
        places: Sequence[dict[str, Any]] = DEFAULT_IN_MEMORY_PLACES,
        metros: Sequence[tuple[str, float, float]] = DEFAULT_IN_MEMORY_METROS,
        *,
        metro_radius_m: float = 1500.0,
        min_name_similarity: float = 0.45,
    ) -> None:
        self.places = list(places)
        self.metros = list(metros)
        self.metro_radius_m = metro_radius_m
        self.min_name_similarity = min_name_similarity

    def _find_metros(self, metro_hint: str) -> list[tuple[str, float, float, float]]:
        norm_m = normalize_metro(metro_hint)
        if not norm_m:
            return []
        variants = {norm_m, transliterate_ru_to_en(norm_m), transliterate_en_to_ru(norm_m)}
        hits: list[tuple[str, float, float, float]] = []
        for m_name, m_lon, m_lat in self.metros:
            m_norm = normalize_metro(m_name)
            sim = max(_word_sim(v, m_norm) for v in variants if v)
            if sim >= 0.55:
                hits.append((m_name, m_lon, m_lat, sim))
        hits.sort(key=lambda item: item[3], reverse=True)
        return hits

    def _score_row(
        self,
        row: dict[str, Any],
        variants: list[str],
        variant_set: set[str],
        *,
        norm_street: str,
        street_given: bool,
        matched_metros: list[tuple[str, float, float, float]],
        has_geo_hint: bool,
    ) -> tuple[PlaceCandidate, bool, str] | None:
        r_name = str(row["name"])
        r_name_en = row.get("name_en")
        r_brand = row.get("brand")
        r_norm = normalize_name(r_name)
        r_translit = build_translit_name(r_name, r_name_en, r_brand)
        r_norm_brand = normalize_name(r_brand) if r_brand else ""

        w_sim = max(_word_sim(v, t) for v in variants for t in (r_norm, r_translit))
        if w_sim < self.min_name_similarity:
            return None

        f_sim = max(
            SequenceMatcher(None, v, t).ratio() for v in variants for t in (r_norm, r_translit)
        )
        translit_tokens = set(r_translit.split())
        exact_name_hit = (
            r_norm in variant_set
            or r_translit in variant_set
            or (bool(r_norm_brand) and r_norm_brand in variant_set)
            or (len(variant_set & translit_tokens) > 0 and f_sim >= 0.65)
        )
        name_score = 1.0 if exact_name_hit else min(1.0, 0.72 * w_sim + 0.28 * f_sim)

        r_addr_street = row.get("addr_street")
        r_norm_street = normalize_street(r_addr_street) if r_addr_street else ""
        street_sim = _word_sim(norm_street, r_norm_street) if norm_street else 0.0

        min_metro_dist: float | None = None
        closest_metro: str | None = None
        r_lat = float(row["lat"])
        r_lon = float(row["lon"])
        for m_name, m_lon, m_lat, _m_sim in matched_metros:
            dist = _haversine_distance_m(r_lon, r_lat, m_lon, m_lat)
            if min_metro_dist is None or dist < min_metro_dist:
                min_metro_dist = dist
                closest_metro = m_name

        geo_score = 0.0
        geo_matched = False
        reason_parts = [f"name_score={name_score:.2f}"]
        if street_given and street_sim >= 0.60:
            geo_matched = True
            geo_score = max(geo_score, street_sim)
            reason_parts.append(f"street match '{r_addr_street}' ({street_sim:.2f})")

        if min_metro_dist is not None and closest_metro is not None:
            if min_metro_dist <= self.metro_radius_m:
                geo_matched = True
                prox = max(0.60, 1.0 - (min_metro_dist / (self.metro_radius_m * 2.5)))
                geo_score = max(geo_score, prox)
                reason_parts.append(f"near metro '{closest_metro}' ({min_metro_dist:.0f} m)")
            else:
                reason_parts.append(f"far from metro '{closest_metro}' ({min_metro_dist:.0f} m)")

        if has_geo_hint:
            total_score = (
                min(1.0, 0.75 * name_score + 0.25 * geo_score) if geo_matched else 0.55 * name_score
            )
        else:
            total_score = name_score

        chain_count = int(row.get("chain_branch_count", 1))
        if chain_count > 1:
            reason_parts.append(f"chain ({chain_count} branches)")

        cand = PlaceCandidate(
            osm_id=int(row["osm_id"]),
            name=r_name,
            name_en=str(r_name_en) if r_name_en else None,
            category=str(row["category"]),
            brand=str(r_brand) if r_brand else None,
            chain_branch_count=chain_count,
            addr_street=str(r_addr_street) if r_addr_street else None,
            addr_housenumber=(
                str(row["addr_housenumber"]) if row.get("addr_housenumber") else None
            ),
            address_full=str(row["address_full"]) if row.get("address_full") else None,
            lat=r_lat,
            lon=r_lon,
            opening_hours=str(row["opening_hours"]) if row.get("opening_hours") else None,
            score=round(total_score, 4),
            name_score=round(name_score, 4),
            geo_score=round(geo_score, 4),
            metro_distance_m=round(min_metro_dist, 1) if min_metro_dist is not None else None,
            matched_metro=closest_metro,
            reason="; ".join(reason_parts),
        )
        return cand, geo_matched, r_norm_brand or r_norm

    def _resolve_scored(
        self,
        name: str,
        norm_query: str,
        variants: list[str],
        scored: list[tuple[PlaceCandidate, bool, str]],
        *,
        has_geo_hint: bool,
        limit: int,
    ) -> MatchResult:
        top_cand, top_geo_matched, top_chain_key = scored[0]
        if top_cand.name_score < 0.58:
            return MatchResult(
                query=name,
                normalized_query=norm_query,
                translit_variants=variants,
                status="not_found",
                candidates=[],
                reason=f"best candidate name_score={top_cand.name_score:.2f} below threshold 0.58",
            )

        same_chain = [
            (c, gm)
            for c, gm, ck in scored
            if ck == top_chain_key and c.name_score >= max(0.75, top_cand.name_score - 0.08)
        ]
        is_chain = top_cand.chain_branch_count > 1 or len(same_chain) > 1

        if is_chain:
            if not has_geo_hint:
                return MatchResult(
                    query=name,
                    normalized_query=norm_query,
                    translit_variants=variants,
                    status="chain_ambiguous",
                    candidates=[c for c, _ in same_chain[:limit]],
                    reason=(
                        f"chain '{top_cand.name}' has "
                        f"{max(top_cand.chain_branch_count, len(same_chain))} "
                        "branches and no street/metro hint was provided"
                    ),
                )
            geo_hits = [c for c, gm in same_chain if gm]
            if len(geo_hits) == 1:
                winner = geo_hits[0]
                others = [c for c, _, _ in scored if c.osm_id != winner.osm_id][: max(0, limit - 1)]
                return MatchResult(
                    query=name,
                    normalized_query=norm_query,
                    translit_variants=variants,
                    status="exact",
                    candidates=[winner, *others],
                    reason=f"chain '{winner.name}' uniquely resolved by geo hint ({winner.reason})",
                )
            return MatchResult(
                query=name,
                normalized_query=norm_query,
                translit_variants=variants,
                status="chain_ambiguous",
                candidates=(geo_hits or [c for c, _ in same_chain])[:limit],
                reason=f"chain '{top_cand.name}' remains ambiguous across branches",
            )

        second_cand = scored[1][0] if len(scored) > 1 else None
        is_exact = (not has_geo_hint or top_geo_matched) and (
            top_cand.name_score >= 0.82
            and (second_cand is None or (top_cand.score - second_cand.score) >= 0.10)
        )
        return MatchResult(
            query=name,
            normalized_query=norm_query,
            translit_variants=variants,
            status="exact" if is_exact else "ambiguous",
            candidates=[c for c, _, _ in scored[:limit]],
            reason=(
                f"unambiguous match ({top_cand.reason})"
                if is_exact
                else f"ambiguous candidate match (top_score={top_cand.score:.2f})"
            ),
        )

    def match(
        self,
        name: str,
        *,
        metro: str | None = None,
        street: str | None = None,
        geo_hint: str | None = None,
        category: str | None = None,
        limit: int = 5,
    ) -> MatchResult:
        """Match an extracted place name against the in-memory fixture catalog."""
        norm_query = normalize_name(name)
        variants = generate_query_variants(name)
        if not variants:
            return MatchResult(
                query=name,
                normalized_query="",
                translit_variants=[],
                status="not_found",
                candidates=[],
                reason="empty query after normalization",
            )

        eff_metro = metro or geo_hint
        eff_street = street or geo_hint
        norm_street = normalize_street(eff_street) if eff_street else ""
        matched_metros = self._find_metros(eff_metro) if eff_metro else []
        has_geo_hint = bool(norm_street or eff_metro)
        street_given = street is not None or geo_hint is not None

        variant_set = set(variants)
        scored: list[tuple[PlaceCandidate, bool, str]] = []

        for row in self.places:
            if category is not None and row.get("category") != category:
                continue
            scored_item = self._score_row(
                row,
                variants,
                variant_set,
                norm_street=norm_street,
                street_given=street_given,
                matched_metros=matched_metros,
                has_geo_hint=has_geo_hint,
            )
            if scored_item is not None:
                scored.append(scored_item)

        if not scored:
            return MatchResult(
                query=name,
                normalized_query=norm_query,
                translit_variants=variants,
                status="not_found",
                candidates=[],
                reason="no candidates above word_similarity threshold",
            )

        scored.sort(key=lambda x: (x[0].score, x[0].name_score, x[0].geo_score), reverse=True)
        return self._resolve_scored(
            name,
            norm_query,
            variants,
            scored,
            has_geo_hint=has_geo_hint,
            limit=limit,
        )


def _match_extracted_place(
    matcher: MatcherProtocol,
    item: ExtractedPlace,
    *,
    limit: int = 5,
) -> MatchResult:
    """Match an ExtractedPlace against PostGIS (or in-memory fallback) with alias & stub."""
    res = matcher.match(
        item.name,
        street=item.address_raw,
        metro=item.metro_hint,
        limit=limit,
    )

    if res.status == "not_found" and item.aliases:
        for alias in item.aliases:
            if not alias.strip():
                continue
            alias_res = matcher.match(
                alias,
                street=item.address_raw,
                metro=item.metro_hint,
                limit=limit,
            )
            if alias_res.status != "not_found":
                res = alias_res
                break

    if (
        res.status == "ambiguous"
        and res.candidates
        and res.candidates[0].chain_branch_count == 1
        and res.candidates[0].name_score >= 0.90
        and res.candidates[0].addr_street is None
        and item.address_raw is not None
        and item.metro_hint is None
    ):
        name_only_res = matcher.match(item.name, limit=limit)
        if name_only_res.status == "exact":
            res = name_only_res

    if res.status == "not_found":
        return enrich_missing_place_stub(item)

    return res


def _build_unavailable_pipeline_result(
    *,
    url: str | None,
    video_bytes: bytes | None,
    caption: str,
    model_name: str,
    total_ms: float,
) -> PipelineResult:
    key = resolve_cache_key(
        url=url,
        video_bytes=video_bytes,
        caption=caption or "private_or_unavailable",
    )
    empty_ext = Extraction(
        items=[],
        video_has_multiple_places=False,
        resolution_hint="insufficient_data",
        notes="Источник закрыт или ролик недоступен.",
    )
    return PipelineResult(
        status="failed_source",
        canonical_key=key,
        source_url=url,
        places=[],
        needs_user_choice=False,
        video_has_multiple_places=False,
        resolution_hint="insufficient_data",
        notes=empty_ext.notes,
        extraction=empty_ext,
        model=model_name,
        usage=TokenUsage(),
        stage_latencies_ms=PipelineStageLatencies(total_ms=total_ms),
        latency_ms=total_ms,
        cost_usd=0.0,
        cache_hit=False,
        error_code="private_or_unavailable",
        error_detail=(
            "Ролик недоступен или аккаунт закрыт. Пришлите видеофайлом или введите название."
        ),
    )


class ExtractionPipeline:
    """End-to-end pipeline: video/URL + caption -> SQLite cache -> LLM -> PostGIS matcher."""

    def __init__(
        self,
        *,
        fake: bool = False,
        provider: str | None = None,
        model: str | None = None,
        cache_db: Path | str | None = None,
        no_cache: bool = False,
        dsn: str | None = None,
        client: ExtractClientProtocol | None = None,
        matcher: MatcherProtocol | None = None,
        use_in_memory_matcher: bool = False,
    ) -> None:
        self.effective_provider = (
            resolve_provider(provider, fake=fake) if client is None else "custom"
        )
        self.is_fake = fake or self.effective_provider == "fake"
        self.model_override = model
        self.cache_db = cache_db
        self.no_cache = no_cache
        self.dsn = dsn or get_default_dsn()
        self.client: ExtractClientProtocol = (
            client
            if client is not None
            else create_extract_client(
                provider=self.effective_provider,
                model=model,
                fake=self.is_fake,
            )
        )
        self.matcher_override = matcher
        self.use_in_memory_matcher = use_in_memory_matcher

    def _extract_with_cache(
        self,
        *,
        cache_key: str,
        payload_bytes: bytes | None,
        caption: str,
        url: str | None,
        duration_sec: float | None,
        fps: float | None,
    ) -> tuple[Extraction, TokenUsage, str, float, bool, float, float]:
        cache_t0 = time.perf_counter()
        cache: ExtractionCache | None = None if self.no_cache else ExtractionCache(self.cache_db)
        try:
            cached_record = cache.get(cache_key) if cache is not None else None
            cache_ms = round((time.perf_counter() - cache_t0) * 1000.0, 2)

            if cached_record is not None:
                return (
                    cached_record.extraction,
                    cached_record.usage,
                    cached_record.model,
                    0.0,
                    True,
                    cache_ms,
                    0.0,
                )

            extract_t0 = time.perf_counter()
            client_resp = self.client.extract(
                video_bytes=payload_bytes,
                caption=caption,
                url=url,
                duration_sec=duration_sec,
                fps=fps,
            )
            extraction_ms = round((time.perf_counter() - extract_t0) * 1000.0, 2)
            if cache is not None:
                cache.set(
                    cache_key,
                    extraction=client_resp.extraction,
                    usage=client_resp.usage,
                    model=client_resp.model,
                    cost_usd=client_resp.cost_usd,
                )
            return (
                client_resp.extraction,
                client_resp.usage,
                client_resp.model,
                client_resp.cost_usd,
                False,
                cache_ms,
                extraction_ms,
            )
        finally:
            if cache is not None:
                cache.close()

    def run(
        self,
        *,
        file_path: Path | str | None = None,
        video_bytes: bytes | None = None,
        caption: str = "",
        url: str | None = None,
        duration_sec: float | None = None,
        fps: float | None = None,
        case_type: str | None = None,
        limit_candidates: int = 5,
    ) -> PipelineResult:
        """Execute end-to-end extraction and PostGIS resolution."""
        pipeline_t0 = time.perf_counter()

        url_lower = (url or "").lower()
        caption_lower = caption.lower()
        if case_type == "private_or_unavailable" or any(
            tok in url_lower or tok in caption_lower
            for tok in ("private_or_unavailable", "/private/", "[private]")
        ):
            total_ms = round((time.perf_counter() - pipeline_t0) * 1000.0, 2)
            return _build_unavailable_pipeline_result(
                url=url,
                video_bytes=video_bytes,
                caption=caption,
                model_name=self.client.model,
                total_ms=total_ms,
            )

        resolved_file = Path(file_path) if file_path is not None else None
        payload_bytes = video_bytes
        if payload_bytes is None and resolved_file is not None:
            if resolved_file.exists():
                payload_bytes = resolved_file.read_bytes()
            elif self.is_fake:
                payload_bytes = f"fake-video:{resolved_file.name}:{caption}".encode()
            else:
                raise FileNotFoundError(f"Video file not found: {resolved_file}")

        cache_key = resolve_cache_key(
            url=url,
            file_path=resolved_file if (resolved_file and resolved_file.exists()) else None,
            video_bytes=payload_bytes,
            caption=caption,
        )

        (
            extraction,
            usage,
            model_used,
            cost_usd,
            cache_hit,
            cache_ms,
            extraction_ms,
        ) = self._extract_with_cache(
            cache_key=cache_key,
            payload_bytes=payload_bytes,
            caption=caption,
            url=url,
            duration_sec=duration_sec,
            fps=fps,
        )

        match_t0 = time.perf_counter()
        place_results = self._match_all_places(
            extraction.items,
            limit_candidates=limit_candidates,
        )
        matching_ms = round((time.perf_counter() - match_t0) * 1000.0, 2)
        total_ms = round((time.perf_counter() - pipeline_t0) * 1000.0, 2)

        needs_user_choice = (
            any(p.needs_user_choice for p in place_results)
            or len(place_results) > 1
            or extraction.video_has_multiple_places
        )
        has_resolved = any(p.resolution_status != "not_found" for p in place_results)
        has_not_found = any(p.resolution_status == "not_found" for p in place_results)
        pipeline_status: PipelineStatus = (
            "completed_partial" if (has_resolved and has_not_found) else "completed"
        )
        has_multi = extraction.video_has_multiple_places or len(place_results) > 1

        return PipelineResult(
            status=pipeline_status,
            canonical_key=cache_key,
            source_url=url,
            places=place_results,
            needs_user_choice=needs_user_choice,
            video_has_multiple_places=has_multi,
            resolution_hint=extraction.resolution_hint,
            notes=extraction.notes,
            extraction=extraction,
            model=model_used,
            usage=usage,
            stage_latencies_ms=PipelineStageLatencies(
                cache_ms=cache_ms,
                extraction_ms=extraction_ms,
                matching_ms=matching_ms,
                total_ms=total_ms,
            ),
            latency_ms=total_ms,
            cost_usd=cost_usd,
            cache_hit=cache_hit,
        )

    def _match_all_places(
        self,
        items: Sequence[ExtractedPlace],
        *,
        limit_candidates: int = 5,
    ) -> list[PipelinePlaceResult]:
        if not items:
            return []

        if self.matcher_override is not None:
            return self._run_matcher_loop(
                self.matcher_override,
                items,
                limit_candidates=limit_candidates,
            )

        if self.use_in_memory_matcher:
            return self._run_matcher_loop(
                InMemoryPlaceMatcher(),
                items,
                limit_candidates=limit_candidates,
            )

        try:
            with psycopg.connect(self.dsn, connect_timeout=2) as conn:
                pg_matcher = PlaceMatcher(conn)
                return self._run_matcher_loop(
                    pg_matcher,
                    items,
                    limit_candidates=limit_candidates,
                )
        except psycopg.OperationalError:
            if self.is_fake:
                return self._run_matcher_loop(
                    InMemoryPlaceMatcher(),
                    items,
                    limit_candidates=limit_candidates,
                )
            raise

    def _run_matcher_loop(
        self,
        matcher: MatcherProtocol,
        items: Sequence[ExtractedPlace],
        *,
        limit_candidates: int = 5,
    ) -> list[PipelinePlaceResult]:
        results: list[PipelinePlaceResult] = []
        for idx, item in enumerate(items, start=1):
            match_res = _match_extracted_place(matcher, item, limit=limit_candidates)
            cands = [MatchedCandidate.from_dataclass(c) for c in match_res.candidates]
            status: ResolutionStatus = match_res.status
            item_needs_choice = status in {"chain_ambiguous", "ambiguous"}
            matched_place = cands[0] if cands and status != "not_found" else None
            enrichment_todo = (
                "TODO(K4): web search enrichment stub (place not found in PostGIS)"
                if status == "not_found"
                else None
            )
            results.append(
                PipelinePlaceResult(
                    ordinal_index=idx,
                    extracted=item,
                    resolution_status=status,
                    needs_user_choice=item_needs_choice,
                    matched_place=matched_place,
                    candidates=cands,
                    match_reason=match_res.reason,
                    enrichment_todo=enrichment_todo,
                )
            )
        return results


def run_pipeline(
    *,
    file_path: Path | str | None = None,
    video_bytes: bytes | None = None,
    caption: str = "",
    url: str | None = None,
    fake: bool = False,
    provider: str | None = None,
    model: str | None = None,
    cache_db: Path | str | None = None,
    no_cache: bool = False,
    dsn: str | None = None,
    duration_sec: float | None = None,
    fps: float | None = None,
    case_type: str | None = None,
    client: ExtractClientProtocol | None = None,
    matcher: MatcherProtocol | None = None,
    use_in_memory_matcher: bool = False,
) -> PipelineResult:
    """Convenience function executing ExtractionPipeline.run()."""
    pipeline = ExtractionPipeline(
        fake=fake,
        provider=provider,
        model=model,
        cache_db=cache_db,
        no_cache=no_cache,
        dsn=dsn,
        client=client,
        matcher=matcher,
        use_in_memory_matcher=use_in_memory_matcher,
    )
    return pipeline.run(
        file_path=file_path,
        video_bytes=video_bytes,
        caption=caption,
        url=url,
        duration_sec=duration_sec,
        fps=fps,
        case_type=case_type,
    )


def add_pipeline_arguments(parser: argparse.ArgumentParser) -> None:
    """Register CLI arguments for the end-to-end pipeline command."""
    parser.add_argument(
        "--file",
        dest="file_path",
        type=Path,
        default=None,
        help="Path to video file.",
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
        help="Source video/post URL.",
    )
    parser.add_argument(
        "--fake",
        action="store_true",
        help="Use deterministic offline FakeExtractClient.",
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
        "--cache-db",
        type=Path,
        default=None,
        help="SQLite cache path.",
    )
    parser.add_argument(
        "--no-cache",
        action="store_true",
        help="Bypass SQLite cache.",
    )
    parser.add_argument(
        "--dsn",
        type=str,
        default=None,
        help="PostgreSQL/PostGIS DSN (defaults to GEO_DATABASE_URL or localhost:54329).",
    )
    parser.add_argument(
        "--in-memory-matcher",
        action="store_true",
        help="Use built-in in-memory Moscow fixture matcher instead of PostGIS.",
    )


def main(argv: Sequence[str] | None = None) -> int:
    """CLI entrypoint for `pipeline.py`."""
    parser = argparse.ArgumentParser(
        prog="pipeline",
        description="Run end-to-end place extraction + PostGIS matching pipeline.",
    )
    add_pipeline_arguments(parser)
    args = parser.parse_args(list(argv) if argv is not None else None)
    try:
        res = run_pipeline(
            file_path=args.file_path,
            caption=args.caption,
            url=args.url,
            fake=bool(args.fake),
            provider=args.provider,
            model=args.model,
            cache_db=args.cache_db,
            no_cache=bool(args.no_cache),
            dsn=args.dsn,
            use_in_memory_matcher=bool(args.in_memory_matcher),
        )
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    sys.stdout.write(res.model_dump_json(indent=2) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
