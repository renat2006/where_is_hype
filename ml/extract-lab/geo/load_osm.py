"""Fetch Moscow places and metro/МЦК stations from Overpass API and load into PostGIS."""

from __future__ import annotations

import argparse
import json
import os
import time
from pathlib import Path
from typing import Any

import httpx
import psycopg

from matcher import (
    DEFAULT_DSN,
    build_translit_name,
    ensure_schema,
    get_default_dsn,
    normalize_metro,
    normalize_name,
    normalize_street,
    recompute_chain_counts,
)

CACHE_DIR = Path(__file__).resolve().parent / "cache"

OVERPASS_ENDPOINTS: tuple[str, ...] = (
    "https://overpass-api.de/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
)

MAX_QUERY_SIZE_BYTES = 67_108_864  # 64 MiB Overpass query memory cap
QUERY_TIMEOUT_SEC = 90

OVERPASS_BATCH_QUERIES: dict[str, str] = {
    "moscow_amenity_food": f"""
[out:json][timeout:{QUERY_TIMEOUT_SEC}][maxsize:{MAX_QUERY_SIZE_BYTES}];
rel["name"="Москва"]["admin_level"="4"]["boundary"="administrative"];
map_to_area->.moscow;
(
  nwr["amenity"~"^(cafe|restaurant|bar|pub|fast_food)$"]["name"](area.moscow);
);
out center tags qt;
""".strip(),
    "moscow_tourism": f"""
[out:json][timeout:{QUERY_TIMEOUT_SEC}][maxsize:{MAX_QUERY_SIZE_BYTES}];
rel["name"="Москва"]["admin_level"="4"]["boundary"="administrative"];
map_to_area->.moscow;
(
  nwr["tourism"~"^(museum|gallery)$"]["name"](area.moscow);
);
out center tags qt;
""".strip(),
    "moscow_leisure_park": f"""
[out:json][timeout:{QUERY_TIMEOUT_SEC}][maxsize:{MAX_QUERY_SIZE_BYTES}];
rel["name"="Москва"]["admin_level"="4"]["boundary"="administrative"];
map_to_area->.moscow;
(
  nwr["leisure"="park"]["name"](area.moscow);
);
out center tags qt;
""".strip(),
    "moscow_metro_stations": f"""
[out:json][timeout:{QUERY_TIMEOUT_SEC}][maxsize:{MAX_QUERY_SIZE_BYTES}];
rel["name"="Москва"]["admin_level"="4"]["boundary"="administrative"];
map_to_area->.moscow;
(
  node["railway"="station"]["station"~"^(subway|light_rail|monorail)$"]["name"](area.moscow);
  node["railway"="station"]["network"~"МЦК|Московское центральное кольцо"]["name"](area.moscow);
);
out center tags qt;
""".strip(),
}

ALLOWED_AMENITIES = frozenset({"cafe", "restaurant", "bar", "pub", "fast_food"})
ALLOWED_TOURISM = frozenset({"museum", "gallery"})


def _get_proxy_url() -> str | None:
    """Return HTTPS_PROXY from environment if set."""
    for key in ("HTTPS_PROXY", "https_proxy", "ALL_PROXY", "all_proxy"):
        val = os.environ.get(key)
        if val and val.strip():
            return val.strip()
    return None


def fetch_overpass_batch(
    batch_name: str,
    query: str,
    *,
    cache_dir: Path = CACHE_DIR,
    use_cache: bool = True,
    max_retries: int = 4,
    pause_sec: float = 2.0,
) -> dict[str, Any]:
    """Fetch a single bounded Overpass query with retries, pauses, and proxy support."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_file = cache_dir / f"{batch_name}.json"

    if use_cache and cache_file.exists() and cache_file.stat().st_size > 100:
        data: dict[str, Any] = json.loads(cache_file.read_text(encoding="utf-8"))
        return data

    proxy_url = _get_proxy_url()
    last_error: Exception | None = None

    for attempt in range(1, max_retries + 1):
        endpoint = OVERPASS_ENDPOINTS[(attempt - 1) % len(OVERPASS_ENDPOINTS)]
        try:
            with httpx.Client(
                proxy=proxy_url,
                timeout=httpx.Timeout(QUERY_TIMEOUT_SEC + 15.0, connect=15.0),
                headers={"User-Agent": "where-is-hype-extract-lab-geo/0.1 (OSM Attribution)"},
                follow_redirects=True,
            ) as client:
                resp = client.post(endpoint, data={"data": query})
                resp.raise_for_status()
                payload: dict[str, Any] = resp.json()

            elements = payload.get("elements")
            if not isinstance(elements, list):
                msg = f"Unexpected Overpass payload without elements list from {endpoint}"
                raise ValueError(msg)

            cache_file.write_text(
                json.dumps(payload, ensure_ascii=False),
                encoding="utf-8",
            )
            return payload
        except Exception as exc:
            last_error = exc
            wait_s = pause_sec * (1.8 ** (attempt - 1))
            print(
                f"[warn] Overpass batch '{batch_name}' attempt {attempt}/{max_retries} "
                f"via {endpoint} failed: {exc}. Retrying in {wait_s:.1f}s..."
            )
            time.sleep(wait_s)

    msg = f"Failed to fetch Overpass batch '{batch_name}' after {max_retries} attempts"
    raise RuntimeError(msg) from last_error


def _extract_coords(element: dict[str, Any]) -> tuple[float, float] | None:
    if "lat" in element and "lon" in element:
        return float(element["lat"]), float(element["lon"])
    center = element.get("center")
    if isinstance(center, dict) and "lat" in center and "lon" in center:
        return float(center["lat"]), float(center["lon"])
    return None


def _resolve_category(tags: dict[str, Any]) -> str | None:
    amenity = tags.get("amenity")
    if amenity in ALLOWED_AMENITIES:
        return str(amenity)
    tourism = tags.get("tourism")
    if tourism in ALLOWED_TOURISM:
        return str(tourism)
    if tags.get("leisure") == "park":
        return "park"
    return None


def parse_place_element(element: dict[str, Any]) -> dict[str, Any] | None:
    """Convert raw Overpass JSON element into a normalized row dict for `places`."""
    tags = element.get("tags")
    if not isinstance(tags, dict):
        return None

    category = _resolve_category(tags)
    if not category:
        return None

    coords = _extract_coords(element)
    if coords is None:
        return None
    lat, lon = coords

    raw_name = (tags.get("name:ru") or tags.get("name") or "").strip()
    if not raw_name:
        return None

    name_en_raw = (tags.get("name:en") or tags.get("int_name") or "").strip()
    name_en = name_en_raw or None

    brand_raw = (tags.get("brand:ru") or tags.get("brand") or tags.get("brand:en") or "").strip()
    brand = brand_raw or None

    norm_name = normalize_name(raw_name, strip_generic=True)
    if not norm_name:
        norm_name = normalize_name(raw_name, strip_generic=False)
    if not norm_name:
        return None

    norm_brand = normalize_name(brand, strip_generic=True) if brand else None
    chain_key = norm_brand if norm_brand else norm_name
    translit_name = build_translit_name(raw_name, name_en=name_en, brand=brand)

    addr_city = (tags.get("addr:city") or "Москва").strip()
    addr_district = (tags.get("addr:district") or tags.get("addr:suburb") or "").strip() or None
    addr_street = (tags.get("addr:street") or tags.get("addr:place") or "").strip() or None
    norm_street = normalize_street(addr_street) if addr_street else None
    addr_housenumber = (tags.get("addr:housenumber") or "").strip() or None
    addr_postcode = (tags.get("addr:postcode") or "").strip() or None

    addr_full_raw = (tags.get("addr:full") or "").strip()
    if addr_full_raw:
        address_full: str | None = addr_full_raw
    else:
        parts = [p for p in (addr_street, addr_housenumber) if p]
        address_full = ", ".join(parts) if parts else None

    opening_hours = (tags.get("opening_hours") or "").strip() or None

    return {
        "osm_id": int(element["id"]),
        "osm_type": str(element.get("type", "node")),
        "name": raw_name,
        "name_en": name_en,
        "normalized_name": norm_name,
        "translit_name": translit_name,
        "category": category,
        "brand": brand,
        "normalized_brand": norm_brand,
        "chain_key": chain_key,
        "addr_city": addr_city,
        "addr_district": addr_district,
        "addr_street": addr_street,
        "normalized_street": norm_street,
        "addr_housenumber": addr_housenumber,
        "addr_postcode": addr_postcode,
        "address_full": address_full,
        "opening_hours": opening_hours,
        "lon": lon,
        "lat": lat,
        "raw_tags": json.dumps(tags, ensure_ascii=False),
    }


def parse_metro_element(element: dict[str, Any]) -> dict[str, Any] | None:
    """Convert raw Overpass JSON element into a normalized row dict for `metro_stations`."""
    tags = element.get("tags")
    if not isinstance(tags, dict):
        return None

    coords = _extract_coords(element)
    if coords is None:
        return None
    lat, lon = coords

    raw_name = (tags.get("name:ru") or tags.get("name") or "").strip()
    if not raw_name:
        return None

    norm_name = normalize_metro(raw_name)
    if not norm_name:
        return None

    name_en = (tags.get("name:en") or tags.get("int_name") or "").strip() or None
    translit_name = build_translit_name(raw_name, name_en=name_en)
    line_name = (tags.get("line") or tags.get("colour") or "").strip() or None
    network = (tags.get("network") or tags.get("operator") or "").strip() or None
    station_tag = (tags.get("station") or "subway").strip()
    if (network and ("МЦК" in network or "центральное кольцо" in network.lower())) or (
        station_tag == "light_rail"
    ):
        station_type = "mck"
    else:
        station_type = station_tag

    return {
        "osm_id": int(element["id"]),
        "osm_type": str(element.get("type", "node")),
        "name": raw_name,
        "name_en": name_en,
        "normalized_name": norm_name,
        "translit_name": translit_name,
        "line_name": line_name,
        "network": network,
        "station_type": station_type,
        "lon": lon,
        "lat": lat,
        "raw_tags": json.dumps(tags, ensure_ascii=False),
    }


def upsert_places(conn: psycopg.Connection[Any], rows: list[dict[str, Any]]) -> int:
    """Bulk upsert parsed places into PostGIS and recompute chain_branch_count."""
    if not rows:
        return 0

    deduped: dict[int, dict[str, Any]] = {}
    for row in rows:
        deduped[int(row["osm_id"])] = row
    unique_rows = list(deduped.values())

    sql = """
        INSERT INTO places (
            osm_id,
            osm_type,
            name,
            name_en,
            normalized_name,
            translit_name,
            category,
            brand,
            normalized_brand,
            chain_key,
            addr_city,
            addr_district,
            addr_street,
            normalized_street,
            addr_housenumber,
            addr_postcode,
            address_full,
            opening_hours,
            geom,
            raw_tags,
            updated_at
        ) VALUES (
            %(osm_id)s,
            %(osm_type)s,
            %(name)s,
            %(name_en)s,
            %(normalized_name)s,
            %(translit_name)s,
            %(category)s,
            %(brand)s,
            %(normalized_brand)s,
            %(chain_key)s,
            %(addr_city)s,
            %(addr_district)s,
            %(addr_street)s,
            %(normalized_street)s,
            %(addr_housenumber)s,
            %(addr_postcode)s,
            %(address_full)s,
            %(opening_hours)s,
            ST_SetSRID(ST_MakePoint(%(lon)s, %(lat)s), 4326),
            %(raw_tags)s::jsonb,
            now()
        )
        ON CONFLICT (osm_id) DO UPDATE SET
            osm_type = EXCLUDED.osm_type,
            name = EXCLUDED.name,
            name_en = EXCLUDED.name_en,
            normalized_name = EXCLUDED.normalized_name,
            translit_name = EXCLUDED.translit_name,
            category = EXCLUDED.category,
            brand = EXCLUDED.brand,
            normalized_brand = EXCLUDED.normalized_brand,
            chain_key = EXCLUDED.chain_key,
            addr_city = EXCLUDED.addr_city,
            addr_district = EXCLUDED.addr_district,
            addr_street = EXCLUDED.addr_street,
            normalized_street = EXCLUDED.normalized_street,
            addr_housenumber = EXCLUDED.addr_housenumber,
            addr_postcode = EXCLUDED.addr_postcode,
            address_full = EXCLUDED.address_full,
            opening_hours = EXCLUDED.opening_hours,
            geom = EXCLUDED.geom,
            raw_tags = EXCLUDED.raw_tags,
            updated_at = now();
    """

    batch_size = 1000
    with conn.cursor() as cur:
        for idx in range(0, len(unique_rows), batch_size):
            cur.executemany(sql, unique_rows[idx : idx + batch_size])
    conn.commit()
    recompute_chain_counts(conn)
    return len(unique_rows)


def upsert_metro_stations(
    conn: psycopg.Connection[Any],
    rows: list[dict[str, Any]],
) -> int:
    """Bulk upsert parsed metro and МЦК stations into PostGIS."""
    if not rows:
        return 0

    deduped: dict[int, dict[str, Any]] = {}
    for row in rows:
        deduped[int(row["osm_id"])] = row
    unique_rows = list(deduped.values())

    sql = """
        INSERT INTO metro_stations (
            osm_id,
            osm_type,
            name,
            name_en,
            normalized_name,
            translit_name,
            line_name,
            network,
            station_type,
            geom,
            raw_tags,
            updated_at
        ) VALUES (
            %(osm_id)s,
            %(osm_type)s,
            %(name)s,
            %(name_en)s,
            %(normalized_name)s,
            %(translit_name)s,
            %(line_name)s,
            %(network)s,
            %(station_type)s,
            ST_SetSRID(ST_MakePoint(%(lon)s, %(lat)s), 4326),
            %(raw_tags)s::jsonb,
            now()
        )
        ON CONFLICT (osm_id) DO UPDATE SET
            osm_type = EXCLUDED.osm_type,
            name = EXCLUDED.name,
            name_en = EXCLUDED.name_en,
            normalized_name = EXCLUDED.normalized_name,
            translit_name = EXCLUDED.translit_name,
            line_name = EXCLUDED.line_name,
            network = EXCLUDED.network,
            station_type = EXCLUDED.station_type,
            geom = EXCLUDED.geom,
            raw_tags = EXCLUDED.raw_tags,
            updated_at = now();
    """

    with conn.cursor() as cur:
        cur.executemany(sql, unique_rows)
    conn.commit()
    return len(unique_rows)


def load_moscow_osm(
    *,
    dsn: str = DEFAULT_DSN,
    cache_dir: Path = CACHE_DIR,
    use_cache: bool = True,
) -> dict[str, Any]:
    """Fetch Moscow places & metro stations from Overpass and load them into PostGIS."""
    t_start = time.perf_counter()
    place_rows: list[dict[str, Any]] = []
    metro_rows: list[dict[str, Any]] = []

    batch_items = list(OVERPASS_BATCH_QUERIES.items())
    for idx, (batch_name, query) in enumerate(batch_items):
        b_start = time.perf_counter()
        payload = fetch_overpass_batch(
            batch_name,
            query,
            cache_dir=cache_dir,
            use_cache=use_cache,
        )
        elements = payload.get("elements", [])
        b_elapsed = time.perf_counter() - b_start
        print(f"[info] Batch '{batch_name}': {len(elements)} raw elements ({b_elapsed:.2f}s)")

        if batch_name == "moscow_metro_stations":
            for el in elements:
                if isinstance(el, dict):
                    parsed_m = parse_metro_element(el)
                    if parsed_m is not None:
                        metro_rows.append(parsed_m)
        else:
            for el in elements:
                if isinstance(el, dict):
                    parsed_p = parse_place_element(el)
                    if parsed_p is not None:
                        place_rows.append(parsed_p)

        if idx < len(batch_items) - 1 and not (
            use_cache and (cache_dir / f"{batch_items[idx + 1][0]}.json").exists()
        ):
            time.sleep(1.5)

    with psycopg.connect(dsn) as conn:
        ensure_schema(conn)
        upserted_places = upsert_places(conn, place_rows)
        upserted_metros = upsert_metro_stations(conn, metro_rows)
        conn.execute("ANALYZE places;")
        conn.execute("ANALYZE metro_stations;")
        conn.commit()

        cat_counts: dict[str, int] = {}
        for cat, cnt in conn.execute(
            "SELECT category, COUNT(*)::int FROM places GROUP BY category ORDER BY COUNT(*) DESC"
        ).fetchall():
            cat_counts[str(cat)] = int(cnt)

        total_places_row = conn.execute("SELECT COUNT(*)::int FROM places").fetchone()
        total_places = int(total_places_row[0]) if total_places_row else 0

        total_metros_row = conn.execute("SELECT COUNT(*)::int FROM metro_stations").fetchone()
        total_metros = int(total_metros_row[0]) if total_metros_row else 0

        chains_row = conn.execute(
            "SELECT COUNT(DISTINCT chain_key)::int FROM places WHERE chain_branch_count > 1"
        ).fetchone()
        chains_count = int(chains_row[0]) if chains_row else 0

    elapsed_sec = round(time.perf_counter() - t_start, 2)
    summary: dict[str, Any] = {
        "attribution": "© OpenStreetMap contributors",
        "elapsed_sec": elapsed_sec,
        "upserted_places": upserted_places,
        "upserted_metro_stations": upserted_metros,
        "total_places_in_db": total_places,
        "total_metro_stations_in_db": total_metros,
        "multi_branch_chains_count": chains_count,
        "categories": cat_counts,
    }
    return summary


def _main() -> None:
    parser = argparse.ArgumentParser(
        description="Load Moscow OSM places and metro/МЦК stations into PostGIS."
    )
    parser.add_argument("--dsn", default=get_default_dsn(), help="PostgreSQL DSN")
    parser.add_argument(
        "--cache-dir",
        type=Path,
        default=CACHE_DIR,
        help="Directory for raw Overpass JSON cache",
    )
    parser.add_argument(
        "--no-cache",
        action="store_true",
        help="Force fresh download from Overpass API",
    )
    args = parser.parse_args()

    summary = load_moscow_osm(
        dsn=args.dsn,
        cache_dir=args.cache_dir,
        use_cache=not args.no_cache,
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    _main()
