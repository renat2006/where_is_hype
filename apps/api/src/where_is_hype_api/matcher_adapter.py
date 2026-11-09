from __future__ import annotations

import importlib.util
import re
import sys
from pathlib import Path
from typing import Any

from where_is_hype_api.domain import (
    find_closest_metro,
    map_category_to_place_type,
    normalize_search_text,
    parse_osm_opening_hours,
)
from where_is_hype_api.fixtures import PLACES_FIXTURE, _daily_hours
from where_is_hype_api.schemas import (
    Candidate,
    ExtractedPlaceItem,
    Location,
    MatchStatus,
    Place,
    PlaceMetro,
)
from where_is_hype_api.storage import SqliteStorage

_GENERIC_WORDS = frozenset(
    {
        "кафе",
        "кофейня",
        "бар",
        "паб",
        "ресторан",
        "бистро",
        "пекарня",
        "рюмочная",
        "музей",
        "галерея",
        "парк",
        "выставка",
        "cafe",
        "coffee",
        "bar",
        "restaurant",
        "museum",
        "park",
        "gallery",
    }
)

# Known Moscow reference places (real OSM coordinates & hours) used when GEO_DATABASE_URL is unset
_OFFLINE_CULTURAL_PLACES: tuple[tuple[tuple[str, ...], Place], ...] = (
    (
        ("третьяковская галерея", "третьяковка", "tretyakov gallery"),
        Place(
            id="osm-tretyakovskaya-galereya",
            name="Третьяковская галерея",
            type="cafe",
            address="Лаврушинский пер., 10",
            metro=PlaceMetro(name="Третьяковская", distanceM=410),
            location=Location(lat=55.741389, lng=37.620833),
            hours=_daily_hours("10:00", "21:00"),
            avgCheck=None,
            yandexOrgId="1023322798",
            rawCategory="museum",
        ),
    ),
    (
        ("парк горького", "цпкио им горького", "gorky park"),
        Place(
            id="osm-park-gorkogo",
            name="Парк Горького",
            type="cafe",
            address="ул. Крымский Вал, 9",
            metro=PlaceMetro(name="Парк культуры", distanceM=520),
            location=Location(lat=55.729816, lng=37.601319),
            hours=_daily_hours("00:00", "00:00"),
            avgCheck=None,
            yandexOrgId="1019092796",
            rawCategory="park",
        ),
    ),
    (
        ("гэс 2", "дом культуры гэс 2", "ges 2"),
        Place(
            id="osm-ges-2",
            name="Дом культуры «ГЭС-2»",
            type="cafe",
            address="Болотная наб., 15",
            metro=PlaceMetro(name="Кропоткинская", distanceM=580),
            location=Location(lat=55.742639, lng=37.612528),
            hours=_daily_hours("11:00", "22:00"),
            avgCheck=None,
            yandexOrgId="1789632145",
            rawCategory="exhibition",
        ),
    ),
)

_OFFLINE_CHAIN_BRANCHES: dict[str, list[Place]] = {
    "surf coffee": [
        Place(
            id="osm-surf-coffee-pokrovka",
            name="Surf Coffee",
            type="coffee",
            address="ул. Покровка, 17",
            metro=PlaceMetro(name="Чистые пруды", distanceM=440),
            location=Location(lat=55.7592, lng=37.6476),
            hours=_daily_hours("08:00", "23:00"),
            avgCheck=550,
            yandexOrgId=None,
        ),
        Place(
            id="osm-surf-coffee-solyanka",
            name="Surf Coffee",
            type="coffee",
            address="ул. Солянка, 1/2",
            metro=PlaceMetro(name="Китай-город", distanceM=230),
            location=Location(lat=55.7536, lng=37.6382),
            hours=_daily_hours("08:00", "23:00"),
            avgCheck=550,
            yandexOrgId=None,
        ),
    ],
    "pims": [
        Place(
            id="osm-pims-pokrovka",
            name="Pims",
            type="coffee",
            address="ул. Покровка, 4",
            metro=PlaceMetro(name="Китай-город", distanceM=490),
            location=Location(lat=55.7579, lng=37.6401),
            hours=_daily_hours("10:00", "23:00"),
            avgCheck=600,
            yandexOrgId=None,
        ),
        Place(
            id="osm-pims-bronny",
            name="Pims",
            type="coffee",
            address="ул. Малая Бронная, 16",
            metro=PlaceMetro(name="Тверская", distanceM=620),
            location=Location(lat=55.7627, lng=37.5946),
            hours=_daily_hours("10:00", "23:00"),
            avgCheck=600,
            yandexOrgId=None,
        ),
    ],
    "пушкин": [
        Place(
            id="osm-623350694",
            name="Пушкинъ",
            type="cafe",
            address="Тверской бульвар, 26/5",
            metro=PlaceMetro(name="Тверская", distanceM=240),
            location=Location(lat=55.7634115, lng=37.6046705),
            hours=_daily_hours("11:00", "21:00"),
            avgCheck=2500,
            yandexOrgId=None,
        ),
        Place(
            id="osm-52890562",
            name="Пушкинъ",
            type="rest",
            address="Тверской бульвар, 26А",
            metro=PlaceMetro(name="Тверская", distanceM=220),
            location=Location(lat=55.7637006, lng=37.6050029),
            hours=_daily_hours("00:00", "00:00"),
            avgCheck=3500,
            yandexOrgId=None,
        ),
    ],
}


def _normalize_venue_key(name: str) -> str:
    cleaned = normalize_search_text(name)
    cleaned = re.sub(r"[^0-9a-zа-я\s]+", " ", cleaned)
    cleaned = re.sub(r"(?<=[а-я])ъ\b", "", cleaned)
    tokens = [t for t in cleaned.split() if t]
    stripped = [t for t in tokens if t not in _GENERIC_WORDS]
    return " ".join(stripped if stripped else tokens)


def _split_address_or_metro(raw_hint: str | None) -> tuple[str | None, str | None]:
    if not raw_hint or not raw_hint.strip():
        return (None, None)
    metro_match = re.search(
        r"(?:м\.|метро|ст\.\s*м\.)\s*([А-Яа-яЁёA-Za-z0-9\-\s]+)",
        raw_hint,
        re.IGNORECASE,
    )
    metro_part = metro_match.group(1).strip(" ,.") if metro_match else None
    street_part = raw_hint
    if metro_match:
        street_part = raw_hint[: metro_match.start()].strip(" ,.")
    return (street_part or None, metro_part or None)


def _load_postgis_matcher_module() -> Any | None:
    repo_root = Path(__file__).resolve().parents[4]
    geo_dir = repo_root / "ml" / "extract-lab" / "geo"
    matcher_path = geo_dir / "matcher.py"
    if not matcher_path.exists():
        return None

    for venv_site in sorted(
        (geo_dir / ".venv" / "lib").glob("python*/site-packages"),
        reverse=True,
    ):
        site_str = str(venv_site)
        if site_str not in sys.path:
            sys.path.insert(0, site_str)

    geo_dir_str = str(geo_dir)
    if geo_dir_str not in sys.path:
        sys.path.insert(0, geo_dir_str)

    try:
        spec = importlib.util.spec_from_file_location("extract_lab_geo_matcher", matcher_path)
        if spec is None or spec.loader is None:
            return None
        module = importlib.util.module_from_spec(spec)
        sys.modules["extract_lab_geo_matcher"] = module
        spec.loader.exec_module(module)
        return module
    except Exception:
        return None


def _osm_candidate_to_place(cand: Any, extracted_category: str | None) -> Place:
    eff_category = extracted_category or str(getattr(cand, "category", "cafe"))
    place_type, raw_cat = map_category_to_place_type(eff_category, str(cand.name))
    lat = float(cand.lat)
    lon = float(cand.lon)

    matched_metro = getattr(cand, "matched_metro", None)
    metro_dist = getattr(cand, "metro_distance_m", None)
    if matched_metro and metro_dist is not None:
        metro = PlaceMetro(name=str(matched_metro), distanceM=max(0, round(float(metro_dist))))
    else:
        metro = find_closest_metro(lat, lon)

    address = (
        str(cand.address_full)
        if getattr(cand, "address_full", None)
        else (
            str(cand.addr_street)
            if getattr(cand, "addr_street", None)
            else f"Москва, м. {metro.name}"
        )
    )
    hours = parse_osm_opening_hours(getattr(cand, "opening_hours", None))

    return Place(
        id=f"osm-{int(cand.osm_id)}",
        name=str(cand.name),
        type=place_type,
        address=address,
        metro=metro,
        location=Location(lat=lat, lng=lon),
        hours=hours,
        avgCheck=None,
        yandexOrgId=None,
        rawCategory=raw_cat,
    )


def _match_in_fixture_catalog(
    item: ExtractedPlaceItem,
    storage: SqliteStorage,
) -> Place | None:
    norm_target = normalize_search_text(item.name)
    venue_key = _normalize_venue_key(item.name)
    for place in PLACES_FIXTURE:
        if normalize_search_text(place.name) == norm_target or (
            venue_key and _normalize_venue_key(place.name) == venue_key
        ):
            _, raw_cat = map_category_to_place_type(item.category, place.name)
            if raw_cat and place.rawCategory != raw_cat:
                updated = place.model_copy(update={"rawCategory": raw_cat})
                storage.upsert_place(updated, in_catalog=True)
                return updated
            return place
    return None


def _match_with_postgis(  # noqa: PLR0911
    item: ExtractedPlaceItem,
    geo_database_url: str,
    storage: SqliteStorage,
) -> Candidate | None:
    module = _load_postgis_matcher_module()
    if module is None:
        return None

    psycopg_mod = getattr(module, "psycopg", None)
    matcher_cls = getattr(module, "PlaceMatcher", None)
    if psycopg_mod is None or matcher_cls is None:
        return None

    _, raw_cat = map_category_to_place_type(item.category, item.name)
    has_stated_address = bool(
        item.address_is_stated and item.address_or_metro and item.address_or_metro.strip()
    )
    street_hint, metro_hint = (
        _split_address_or_metro(item.address_or_metro) if has_stated_address else (None, None)
    )

    try:
        with psycopg_mod.connect(geo_database_url, connect_timeout=3) as conn:
            matcher = matcher_cls(conn)
            if item.is_chain and not has_stated_address:
                res = matcher.match(item.name, limit=5)
                branches = [_osm_candidate_to_place(c, item.category) for c in res.candidates]
                return Candidate(
                    place=None,
                    confidence=round(min(1.0, max(0.0, item.confidence)), 2),
                    matchStatus="chain_ambiguous",
                    status="chain_ambiguous",
                    rawCategory=raw_cat or item.category,
                    category=item.category,
                    extractedName=item.name,
                    isChain=True,
                    addressOrMetro=item.address_or_metro,
                    evidence=item.evidence,
                    evidenceQuote=item.evidence_quote,
                    reason=str(res.reason or "chain without stated address or metro"),
                    branchCandidates=branches,
                )

            res = matcher.match(
                item.name,
                metro=metro_hint,
                street=street_hint,
                geo_hint=item.address_or_metro if has_stated_address else None,
                limit=5,
            )
            # If OSM node lacks street tag and geo_hint made a non-chain ambiguous, retry by name
            if (
                res.status in {"ambiguous", "not_found"}
                and not item.is_chain
                and has_stated_address
            ):
                fallback_res = matcher.match(item.name, limit=5)
                if fallback_res.status == "exact":
                    res = fallback_res
    except Exception:
        return None

    status_str = str(res.status)
    if status_str == "chain_ambiguous":
        branches = [_osm_candidate_to_place(c, item.category) for c in res.candidates]
        return Candidate(
            place=None,
            confidence=round(min(1.0, max(0.0, item.confidence)), 2),
            matchStatus="chain_ambiguous",
            status="chain_ambiguous",
            rawCategory=raw_cat or item.category,
            category=item.category,
            extractedName=item.name,
            isChain=True,
            addressOrMetro=item.address_or_metro,
            evidence=item.evidence,
            evidenceQuote=item.evidence_quote,
            reason=str(res.reason),
            branchCandidates=branches,
        )

    if status_str == "not_found" or not res.candidates:
        return Candidate(
            place=None,
            confidence=round(min(1.0, max(0.0, item.confidence)), 2),
            matchStatus="not_found",
            status="not_found",
            rawCategory=raw_cat or item.category,
            category=item.category,
            extractedName=item.name,
            isChain=item.is_chain,
            addressOrMetro=item.address_or_metro,
            evidence=item.evidence,
            evidenceQuote=item.evidence_quote,
            reason=str(res.reason),
            branchCandidates=[],
        )

    top_cand = res.candidates[0]
    place = _osm_candidate_to_place(top_cand, item.category)
    storage.upsert_place(place, in_catalog=False)
    match_status: MatchStatus = "exact" if status_str == "exact" else "ambiguous"
    combined_conf = round(
        min(1.0, max(0.05, 0.7 * item.confidence + 0.3 * float(top_cand.score))), 2
    )

    return Candidate(
        place=place,
        confidence=combined_conf,
        matchStatus=match_status,
        status=match_status,
        rawCategory=place.rawCategory or item.category,
        category=item.category,
        extractedName=item.name,
        isChain=item.is_chain or int(getattr(top_cand, "chain_branch_count", 1)) > 1,
        addressOrMetro=item.address_or_metro,
        evidence=item.evidence,
        evidenceQuote=item.evidence_quote,
        reason=str(res.reason),
    )


def match_extracted_place(  # noqa: PLR0911
    item: ExtractedPlaceItem,
    storage: SqliteStorage,
    *,
    geo_database_url: str | None = None,
) -> Candidate:
    """Match an extracted place against local fixture catalog and/or PostGIS PlaceMatcher."""
    _, raw_cat = map_category_to_place_type(item.category, item.name)
    has_stated_address = bool(
        item.address_is_stated and item.address_or_metro and item.address_or_metro.strip()
    )

    # 1. Exact fixture catalog match (preserves web prototype IDs like 'zhuk-i-pchela', 'sosny')
    if not (item.is_chain and not has_stated_address):
        fixture_hit = _match_in_fixture_catalog(item, storage)
        if fixture_hit is not None:
            return Candidate(
                place=fixture_hit,
                confidence=round(min(1.0, max(0.0, item.confidence)), 2),
                matchStatus="exact",
                status="exact",
                rawCategory=fixture_hit.rawCategory or raw_cat or item.category,
                category=item.category,
                extractedName=item.name,
                isChain=item.is_chain,
                addressOrMetro=item.address_or_metro,
                evidence=item.evidence,
                evidenceQuote=item.evidence_quote,
            )

    # 2. PostGIS matcher (ml/extract-lab/geo/matcher.py) when GEO_DATABASE_URL is configured
    if geo_database_url:
        pg_cand = _match_with_postgis(item, geo_database_url, storage)
        if pg_cand is not None:
            return pg_cand

    # 3. Offline chain handling: never invent coordinates or pick random branch without address
    venue_key = _normalize_venue_key(item.name)
    norm_full = normalize_search_text(item.name)
    chain_branches = _OFFLINE_CHAIN_BRANCHES.get(norm_full) or _OFFLINE_CHAIN_BRANCHES.get(
        venue_key
    )
    if item.is_chain or chain_branches is not None:
        branches = chain_branches or []
        if not has_stated_address:
            return Candidate(
                place=None,
                confidence=round(min(1.0, max(0.0, item.confidence)), 2),
                matchStatus="chain_ambiguous",
                status="chain_ambiguous",
                rawCategory=raw_cat or item.category,
                category=item.category,
                extractedName=item.name,
                isChain=True,
                addressOrMetro=item.address_or_metro,
                evidence=item.evidence,
                evidenceQuote=item.evidence_quote,
                reason=f"chain '{item.name}' has multiple branches and no address/metro was stated",
                branchCandidates=branches,
            )
        # Check if address_or_metro resolves a specific branch
        hint_norm = normalize_search_text(item.address_or_metro or "")
        matched_branch = next(
            (
                b
                for b in branches
                if normalize_search_text(b.address.split(",")[0]) in hint_norm
                or normalize_search_text(b.metro.name) in hint_norm
            ),
            None,
        )
        if matched_branch is not None:
            storage.upsert_place(matched_branch, in_catalog=False)
            return Candidate(
                place=matched_branch,
                confidence=round(min(1.0, max(0.0, item.confidence)), 2),
                matchStatus="exact",
                status="exact",
                rawCategory=matched_branch.rawCategory or raw_cat or item.category,
                category=item.category,
                extractedName=item.name,
                isChain=True,
                addressOrMetro=item.address_or_metro,
                evidence=item.evidence,
                evidenceQuote=item.evidence_quote,
            )
        return Candidate(
            place=None,
            confidence=round(min(1.0, max(0.0, item.confidence)), 2),
            matchStatus="chain_ambiguous",
            status="chain_ambiguous",
            rawCategory=raw_cat or item.category,
            category=item.category,
            extractedName=item.name,
            isChain=True,
            addressOrMetro=item.address_or_metro,
            evidence=item.evidence,
            evidenceQuote=item.evidence_quote,
            reason=f"chain '{item.name}' branch could not be uniquely resolved from hint",
            branchCandidates=branches,
        )

    # 4. Offline cultural / non-standard category places (museum, park, exhibition)
    for aliases, ref_place in _OFFLINE_CULTURAL_PLACES:
        if venue_key in aliases or normalize_search_text(item.name) in aliases:
            _, eff_raw_cat = map_category_to_place_type(item.category, ref_place.name)
            resolved_place = ref_place.model_copy(
                update={"rawCategory": eff_raw_cat or ref_place.rawCategory}
            )
            storage.upsert_place(resolved_place, in_catalog=False)
            return Candidate(
                place=resolved_place,
                confidence=round(min(1.0, max(0.0, item.confidence)), 2),
                matchStatus="exact",
                status="exact",
                rawCategory=resolved_place.rawCategory,
                category=item.category,
                extractedName=item.name,
                isChain=False,
                addressOrMetro=item.address_or_metro,
                evidence=item.evidence,
                evidenceQuote=item.evidence_quote,
            )

    # 5. Honest not_found status — NEVER invent coordinates
    return Candidate(
        place=None,
        confidence=round(min(1.0, max(0.0, item.confidence)), 2),
        matchStatus="not_found",
        status="not_found",
        rawCategory=raw_cat or item.category,
        category=item.category,
        extractedName=item.name,
        isChain=item.is_chain,
        addressOrMetro=item.address_or_metro,
        evidence=item.evidence,
        evidenceQuote=item.evidence_quote,
        reason=f"place '{item.name}' was not found in the database",
        branchCandidates=[],
    )
