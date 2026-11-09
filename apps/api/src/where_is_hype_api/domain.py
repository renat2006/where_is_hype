from __future__ import annotations

import math
import re
from datetime import UTC, datetime, timedelta, timezone
from urllib.parse import SplitResult, parse_qs, urlencode, urlsplit, urlunsplit

from where_is_hype_api.fixtures import METRO_STATIONS
from where_is_hype_api.schemas import (
    SHORTLIST_TTL_DAYS,
    DayHours,
    Location,
    Place,
    PlaceMetro,
    PlaceType,
    Platform,
    Vote,
    WeeklyHours,
)

EARTH_RADIUS_M = 6_371_000
GARDEN_RING_CENTER = Location(lat=55.7558, lng=37.6173)
GARDEN_RING_RADIUS_M = 3200
MOSCOW_TZ = timezone(timedelta(hours=3))

_GARBAGE_QUERY_PARAMS = frozenset(
    {
        "igsh",
        "igshid",
        "si",
        "feature",
        "is_from_webapp",
        "sender_device",
        "web_id",
        "_r",
        "_t",
        "checksum",
        "sec_user_id",
        "share_app_id",
        "share_item_id",
        "share_link_id",
        "social_sharing",
        "single",
        "comment",
        "fbclid",
        "gclid",
        "yclid",
        "hl",
    }
)

_TIME_RE = re.compile(r"^([01]\d|2[0-4]):([0-5]\d)$")
_HOURS_RULE_RE = re.compile(r"^(?:([A-Za-z,\-\s]+)\s+)?(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})$")
_OSM_DAY_INDEX: dict[str, int] = {
    "mo": 0,
    "tu": 1,
    "we": 2,
    "th": 3,
    "fr": 4,
    "sa": 5,
    "su": 6,
}
_WEEKDAY_KEYS: tuple[str, ...] = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")


def now_iso() -> str:
    return datetime.now(tz=UTC).isoformat().replace("+00:00", "Z")


def distance_m(a: Location, b: Location) -> int:
    if a.lat == b.lat and a.lng == b.lng:
        return 0
    d_lat = math.radians(b.lat - a.lat)
    d_lng = math.radians(b.lng - a.lng)
    lat1 = math.radians(a.lat)
    lat2 = math.radians(b.lat)

    sin_half_lat = math.sin(d_lat / 2.0)
    sin_half_lng = math.sin(d_lng / 2.0)
    h = sin_half_lat * sin_half_lat + math.cos(lat1) * math.cos(lat2) * sin_half_lng * sin_half_lng
    c = 2.0 * math.atan2(math.sqrt(h), math.sqrt(max(0.0, 1.0 - h)))
    return round(EARTH_RADIUS_M * c)


def is_inside_garden_ring(location: Location) -> bool:
    return distance_m(location, GARDEN_RING_CENTER) <= GARDEN_RING_RADIUS_M


def find_closest_metro(lat: float, lng: float) -> PlaceMetro:
    target = Location(lat=lat, lng=lng)
    best_name = "Чистые пруды"
    best_dist = 500
    first = True
    for _station_id, name, s_lat, s_lng in METRO_STATIONS:
        dist = distance_m(target, Location(lat=s_lat, lng=s_lng))
        if first or dist < best_dist:
            best_name = name
            best_dist = dist
            first = False
    return PlaceMetro(name=best_name, distanceM=max(0, best_dist))


def normalize_search_text(text: str) -> str:
    return text.lower().replace("ё", "е").strip()


def search_places(places: list[Place], raw_query: str) -> list[Place]:
    query = normalize_search_text(raw_query)
    if len(query) < 2:
        return []

    scored: list[tuple[int, int, int, Place]] = []
    for place in places:
        name = normalize_search_text(place.name)
        address = normalize_search_text(place.address)
        metro = normalize_search_text(place.metro.name)

        tier = 0
        if name.startswith(query):
            tier = 1
        elif query in name:
            tier = 2
        elif query in address or query in metro:
            tier = 3

        if tier == 0:
            continue

        ring_rank = 0 if is_inside_garden_ring(place.location) else 1
        center_dist = distance_m(place.location, GARDEN_RING_CENTER)
        scored.append((ring_rank, tier, center_dist, place))

    scored.sort(key=lambda item: (item[0], item[1], item[2]))
    return [item[3] for item in scored]


def _matches_domain(host: str, domain: str) -> bool:
    return host == domain or host.endswith(f".{domain}")


def detect_platform(raw_url: str) -> Platform:  # noqa: PLR0911
    trimmed = raw_url.strip()
    if not trimmed or re.search(r"\s", trimmed):
        return "other"
    if re.match(r"^[a-zA-Z][a-zA-Z\d+\-.]*:", trimmed) and not re.match(
        r"^https?://", trimmed, re.IGNORECASE
    ):
        return "other"
    with_proto = (
        trimmed if re.match(r"^https?://", trimmed, re.IGNORECASE) else f"https://{trimmed}"
    )
    try:
        parsed = urlsplit(with_proto)
        host = (parsed.hostname or "").lower().removeprefix("www.")
    except ValueError:
        return "other"
    if not host or "." not in host:
        return "other"

    if _matches_domain(host, "instagram.com") or _matches_domain(host, "instagr.am"):
        return "instagram"
    if _matches_domain(host, "tiktok.com"):
        return "tiktok"
    if (
        _matches_domain(host, "vk.com")
        or _matches_domain(host, "vk.ru")
        or _matches_domain(host, "vkvideo.ru")
        or host == "vk.cc"
    ):
        return "vk"
    if (
        _matches_domain(host, "t.me")
        or _matches_domain(host, "telegram.me")
        or _matches_domain(host, "telegram.org")
    ):
        return "telegram"
    if _matches_domain(host, "youtube.com") or _matches_domain(host, "youtu.be"):
        return "youtube"
    return "other"


def parse_link_with_path(raw_url: str) -> SplitResult | None:  # noqa: PLR0911
    trimmed = raw_url.strip()
    if not trimmed or re.search(r"\s", trimmed):
        return None
    if re.match(r"^[a-zA-Z][a-zA-Z\d+\-.]*:", trimmed) and not re.match(
        r"^https?://", trimmed, re.IGNORECASE
    ):
        return None
    with_proto = (
        trimmed if re.match(r"^https?://", trimmed, re.IGNORECASE) else f"https://{trimmed}"
    )
    try:
        parsed = urlsplit(with_proto)
    except ValueError:
        return None
    host = parsed.hostname or ""
    if "." not in host:
        return None
    clean_path = parsed.path.replace("/", "").strip()
    if not clean_path and not parsed.query:
        return None
    if not clean_path:
        return None
    return parsed


def normalize_link_for_compare(raw_url: str) -> str:
    parsed = parse_link_with_path(raw_url)
    if not parsed or not parsed.hostname:
        return raw_url.strip().lower()
    host = parsed.hostname.lower().removeprefix("www.").removeprefix("m.")
    path = parsed.path.rstrip("/").lower()
    return f"{host}{path}"


def canonicalize_link(raw_url: str) -> tuple[str, str] | None:  # noqa: PLR0911, PLR0912
    """Validate and canonicalize a URL into (canonical_key, canonical_url)."""
    parsed = parse_link_with_path(raw_url)
    if not parsed or not parsed.hostname:
        return None

    host = parsed.hostname.lower().removeprefix("www.").removeprefix("m.")
    path = re.sub(r"/+", "/", parsed.path).rstrip("/")
    if not path:
        return None

    query_items = parse_qs(parsed.query, keep_blank_values=False)
    cleaned_query: dict[str, list[str]] = {}
    for key, values in query_items.items():
        lower_key = key.lower()
        if lower_key.startswith("utm_") or lower_key in _GARBAGE_QUERY_PARAMS:
            continue
        cleaned_query[key] = values

    encoded_query = urlencode(cleaned_query, doseq=True)
    canonical_url = urlunsplit(("https", host, path, encoded_query, ""))

    segments = [seg for seg in path.split("/") if seg]
    platform = detect_platform(canonical_url)

    if platform == "instagram":
        for idx, seg in enumerate(segments):
            if seg.lower() in {"reel", "reels", "p", "tv"} and idx + 1 < len(segments):
                return (f"ig:{segments[idx + 1].lower()}", canonical_url)
    elif platform == "tiktok":
        for idx, seg in enumerate(segments):
            if seg.lower() in {"video", "photo", "v", "t"} and idx + 1 < len(segments):
                return (f"tt:{segments[idx + 1].lower()}", canonical_url)
        if host in {"vt.tiktok.com", "vm.tiktok.com"} and segments:
            return (f"tt:{segments[0].lower()}", canonical_url)
    elif platform == "youtube":
        if host == "youtu.be" and segments:
            return (f"yt:{segments[0]}", canonical_url)
        for idx, seg in enumerate(segments):
            if seg.lower() in {"shorts", "embed", "live"} and idx + 1 < len(segments):
                return (f"yt:{segments[idx + 1]}", canonical_url)
        if segments and segments[0].lower() == "watch" and "v" in cleaned_query:
            return (f"yt:{cleaned_query['v'][0]}", canonical_url)
    elif platform == "vk":
        for seg in segments:
            if seg.lower().startswith(("clip", "video")):
                return (f"vk:{seg.lower()}", canonical_url)
    elif platform == "telegram" and len(segments) >= 2:
        if segments[0].lower() in {"s", "c"} and len(segments) >= 3:
            return (f"tg:{segments[1].lower()}:{segments[2]}", canonical_url)
        return (f"tg:{segments[0].lower()}:{segments[1]}", canonical_url)

    return (f"web:{host}{path.lower()}", canonical_url)


def ensure_valid_url_or_null(raw_url: str | None) -> str | None:
    if not raw_url:
        return None
    trimmed = raw_url.strip()
    if not trimmed or re.search(r"\s", trimmed):
        return None
    with_proto = (
        trimmed if re.match(r"^https?://", trimmed, re.IGNORECASE) else f"https://{trimmed}"
    )
    try:
        parsed = urlsplit(with_proto)
        if not parsed.hostname or "." not in parsed.hostname:
            return None
        path = parsed.path or "/"
        return urlunsplit(
            (parsed.scheme.lower(), parsed.netloc, path, parsed.query, parsed.fragment)
        )
    except ValueError:
        return None


def fnv1a_hash(text: str) -> int:
    """Compute 32-bit FNV-1a hash matching handlers.ts hashString."""
    h = 2166136261
    for ch in text:
        h ^= ord(ch)
        # Simulate 32-bit signed integer multiplication Math.imul(h, 16777619)
        h = (h * 16777619) & 0xFFFFFFFF
        if h & 0x80000000:
            h -= 0x100000000
    return abs(h)


def _parse_iso_datetime(value: str | datetime) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=UTC)
    cleaned = value.strip()
    if cleaned.endswith("Z"):
        cleaned = f"{cleaned[:-1]}+00:00"
    dt = datetime.fromisoformat(cleaned)
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def get_moscow_date_key(value: str | datetime) -> str:
    dt = _parse_iso_datetime(value)
    moscow_dt = dt.astimezone(MOSCOW_TZ)
    day_index = moscow_dt.weekday()
    return f"{moscow_dt.year:04d}-{moscow_dt.month:02d}-{moscow_dt.day:02d}-{day_index}"


def create_shortlist_expires_at(created_at: str | datetime) -> str:
    dt = _parse_iso_datetime(created_at)
    expires = dt + timedelta(days=SHORTLIST_TTL_DAYS)
    return expires.astimezone(UTC).isoformat().replace("+00:00", "Z")


def is_shortlist_expired(expires_at: str, now: datetime | None = None) -> bool:
    current = now or datetime.now(tz=UTC)
    try:
        exp_dt = _parse_iso_datetime(expires_at)
    except ValueError:
        return False
    return exp_dt <= current


def upsert_vote(votes: list[Vote], next_vote: Vote) -> list[Vote]:
    for idx, existing in enumerate(votes):
        if existing.voterId == next_vote.voterId:
            return [next_vote if i == idx else v for i, v in enumerate(votes)]
    return [*votes, next_vote]


def _normalize_hhmm(raw_time: str) -> str | None:
    parts = raw_time.strip().split(":")
    if len(parts) != 2:
        return None
    try:
        h = int(parts[0])
        m = int(parts[1])
    except ValueError:
        return None
    if h == 24 and m == 0:
        return "00:00"
    if 0 <= h <= 23 and 0 <= m <= 59:
        return f"{h:02d}:{m:02d}"
    return None


def _expand_osm_days(days_spec: str | None) -> list[int]:
    if not days_spec:
        return list(range(7))
    cleaned = days_spec.strip().lower()
    if not cleaned:
        return list(range(7))
    indices: list[int] = []
    for chunk in cleaned.split(","):
        part = chunk.strip()
        if not part:
            continue
        if "-" in part:
            bounds = [b.strip()[:2] for b in part.split("-", maxsplit=1)]
            start_idx = _OSM_DAY_INDEX.get(bounds[0])
            end_idx = _OSM_DAY_INDEX.get(bounds[1])
            if start_idx is None or end_idx is None:
                continue
            cur = start_idx
            for _ in range(7):
                if cur not in indices:
                    indices.append(cur)
                if cur == end_idx:
                    break
                cur = (cur + 1) % 7
        else:
            day_idx = _OSM_DAY_INDEX.get(part[:2])
            if day_idx is not None and day_idx not in indices:
                indices.append(day_idx)
    return indices


def parse_osm_opening_hours(raw_hours: str | None) -> WeeklyHours | None:
    """Parse OSM opening_hours string from the database into WeeklyHours (or None)."""
    if not raw_hours:
        return None
    cleaned = raw_hours.strip()
    if not cleaned:
        return None
    if cleaned == "24/7":
        all_day = DayHours(open="00:00", close="00:00")
        return WeeklyHours(
            mon=all_day,
            tue=all_day,
            wed=all_day,
            thu=all_day,
            fri=all_day,
            sat=all_day,
            sun=all_day,
        )

    day_map: dict[str, DayHours | None] = dict.fromkeys(_WEEKDAY_KEYS, None)
    matched_any = False

    for raw_rule in cleaned.split(";"):
        rule = raw_rule.strip()
        if not rule:
            continue
        m = _HOURS_RULE_RE.match(rule)
        if not m:
            continue
        days_spec, open_raw, close_raw = m.group(1), m.group(2), m.group(3)
        open_hhmm = _normalize_hhmm(open_raw)
        close_hhmm = _normalize_hhmm(close_raw)
        if not open_hhmm or not close_hhmm:
            continue
        day_indices = _expand_osm_days(days_spec)
        if not day_indices:
            continue
        dh = DayHours(open=open_hhmm, close=close_hhmm)
        for idx in day_indices:
            day_map[_WEEKDAY_KEYS[idx]] = dh
            matched_any = True

    if not matched_any:
        return None
    return WeeklyHours(**day_map)


def map_category_to_place_type(
    category: str | None,
    name: str = "",
) -> tuple[PlaceType, str | None]:
    """Map an extracted or OSM category to core PlaceType + optional rawCategory."""
    raw = (category or "cafe").strip().lower()
    lower_name = name.lower()

    if raw == "coffee":
        return ("coffee", None)
    if raw in {"cafe", "fast_food", "bakery"}:
        if any(kw in lower_name for kw in ("кофе", "coffee", "эспрессо", "espresso", "фильтр")):
            return ("coffee", None if raw == "cafe" else raw)
        return ("cafe", None if raw == "cafe" else raw)
    if raw in {"rest", "restaurant"}:
        return ("rest", None)
    if raw in {"bar", "pub"}:
        return ("bar", None if raw == "bar" else raw)

    # Categories outside core schema (museum, park, exhibition, gallery, etc.)
    return ("cafe", raw)
