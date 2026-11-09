"""Place name normalization, RU<->EN transliteration, and PostGIS matcher."""

from __future__ import annotations

import argparse
import json
import os
import re
import unicodedata
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Literal

import psycopg

MatchStatus = Literal["exact", "chain_ambiguous", "ambiguous", "not_found"]

DEFAULT_DSN = "postgresql://where_is_hype:local-only@127.0.0.1:54329/where_is_hype_geo"
SCHEMA_PATH = Path(__file__).resolve().parent / "schema.sql"

GENERIC_PLACE_WORDS: frozenset[str] = frozenset(
    {
        # RU generic venue words
        "кафе",
        "кофейня",
        "бар",
        "паб",
        "гастробар",
        "гастропаб",
        "ресторан",
        "рестобар",
        "бистро",
        "рюмочная",
        "винотека",
        "пекарня",
        "кондитерская",
        "столовая",
        "закусочная",
        "пиццерия",
        "бургерная",
        "хинкальная",
        "раменная",
        "чайхана",
        "музей",
        "галерея",
        "выставочный",
        "зал",
        "парк",
        "сад",
        "сквер",
        "усадьба",
        "траттория",
        "остерия",
        "брассери",
        "клуб",
        "лаунж",
        "таверна",
        "фудмолл",
        "фудкорт",
        # EN generic venue words
        "cafe",
        "bar",
        "pub",
        "gastrobar",
        "gastropub",
        "restaurant",
        "restobar",
        "bistro",
        "bakery",
        "museum",
        "gallery",
        "park",
        "garden",
        "trattoria",
        "osteria",
        "brasserie",
        "club",
        "lounge",
        "tavern",
    }
)

STREET_STOP_WORDS: frozenset[str] = frozenset(
    {
        "улица",
        "ул",
        "переулок",
        "пер",
        "проспект",
        "пр",
        "прт",
        "бульвар",
        "бр",
        "бул",
        "набережная",
        "наб",
        "площадь",
        "пл",
        "шоссе",
        "ш",
        "проезд",
        "прд",
        "аллея",
        "тупик",
        "вал",
        "линия",
        "дом",
        "д",
        "строение",
        "стр",
        "корпус",
        "к",
        "корп",
        "вл",
        "владение",
        "на",
        "у",
        "по",
        "street",
        "st",
        "lane",
        "ln",
        "avenue",
        "ave",
        "boulevard",
        "blvd",
    }
)

METRO_STOP_WORDS: frozenset[str] = frozenset(
    {
        "метро",
        "м",
        "станция",
        "ст",
        "мцк",
        "мцд",
        "бкл",
        "около",
        "рядом",
        "с",
        "у",
        "на",
        "metro",
        "station",
    }
)

RU_TO_EN_MAP: dict[str, str] = {
    "а": "a",
    "б": "b",
    "в": "v",
    "г": "g",
    "д": "d",
    "е": "e",
    "ё": "e",
    "ж": "zh",
    "з": "z",
    "и": "i",
    "й": "y",
    "к": "k",
    "л": "l",
    "м": "m",
    "н": "n",
    "о": "o",
    "п": "p",
    "р": "r",
    "с": "s",
    "т": "t",
    "у": "u",
    "ф": "f",
    "х": "kh",
    "ц": "ts",
    "ч": "ch",
    "ш": "sh",
    "щ": "shch",
    "ъ": "",
    "ы": "y",
    "ь": "",
    "э": "e",
    "ю": "yu",
    "я": "ya",
}

EN_WORD_TO_RU: dict[str, str] = {
    "coffee": "кофе",
    "surf": "серф",
    "white": "вайт",
    "rabbit": "рэббит",
    "black": "блэк",
    "swan": "свон",
    "underdog": "андердог",
    "starbucks": "старбакс",
    "stars": "старс",
    "one": "ван",
    "price": "прайс",
    "green": "грин",
    "point": "поинт",
    "lucky": "лаки",
    "izakaya": "изакая",
    "house": "хаус",
    "room": "рум",
    "spot": "спот",
    "kitchen": "китчен",
    "prime": "прайм",
    "burger": "бургер",
    "king": "кинг",
    "french": "френч",
    "touch": "тач",
    "daily": "дейли",
}

EN_DIGRAPHS_TO_RU: tuple[tuple[str, str], ...] = (
    ("shch", "щ"),
    ("sch", "ш"),
    ("sh", "ш"),
    ("ch", "ч"),
    ("zh", "ж"),
    ("ts", "ц"),
    ("tz", "ц"),
    ("kh", "х"),
    ("ph", "ф"),
    ("th", "т"),
    ("ck", "к"),
    ("qu", "кв"),
    ("yu", "ю"),
    ("ya", "я"),
    ("yo", "е"),
    ("ee", "и"),
    ("oo", "у"),
)

EN_CHAR_TO_RU: dict[str, str] = {
    "a": "а",
    "b": "б",
    "c": "к",
    "d": "д",
    "e": "е",
    "f": "ф",
    "g": "г",
    "h": "х",
    "i": "и",
    "j": "дж",
    "k": "к",
    "l": "л",
    "m": "м",
    "n": "н",
    "o": "о",
    "p": "п",
    "q": "к",
    "r": "р",
    "s": "с",
    "t": "т",
    "u": "у",
    "v": "в",
    "w": "в",
    "x": "кс",
    "y": "й",
    "z": "з",
}

_QUOTES_RE = re.compile(r"[\"'«»“”„‘’`´]+")
_NON_WORD_RE = re.compile(r"[^0-9a-zа-я\s]+")
_MULTI_SPACE_RE = re.compile(r"\s+")
_TRAILING_HARD_SIGN_RE = re.compile(r"(?<=[а-я])ъ\b")
_HOUSE_TOKEN_RE = re.compile(r"^\d+[а-яa-z0-9/\-]*$")


@dataclass(slots=True)
class PlaceCandidate:
    """Single candidate returned by the PostGIS place matcher."""

    osm_id: int
    name: str
    name_en: str | None
    category: str
    brand: str | None
    chain_branch_count: int
    addr_street: str | None
    addr_housenumber: str | None
    address_full: str | None
    lat: float
    lon: float
    opening_hours: str | None
    score: float
    name_score: float
    geo_score: float
    metro_distance_m: float | None
    matched_metro: str | None
    reason: str


@dataclass(slots=True)
class MatchResult:
    """Complete result of matching an extracted venue name against Moscow places."""

    query: str
    normalized_query: str
    translit_variants: list[str]
    status: MatchStatus
    candidates: list[PlaceCandidate]
    reason: str


def get_default_dsn() -> str:
    """Return database connection string from environment or local compose default."""
    if env_dsn := os.environ.get("GEO_DATABASE_URL"):
        return env_dsn
    user = os.environ.get("GEO_DB_USER", "where_is_hype")
    password = os.environ.get("GEO_DB_PASSWORD", "local-only")
    host = os.environ.get("GEO_DB_HOST", "127.0.0.1")
    port = os.environ.get("GEO_DB_PORT", "54329")
    dbname = os.environ.get("GEO_DB_NAME", "where_is_hype_geo")
    return f"postgresql://{user}:{password}@{host}:{port}/{dbname}"


def ensure_schema(conn: psycopg.Connection[Any]) -> None:
    """Ensure PostGIS, pg_trgm, btree_gist and required tables/indexes exist."""
    sql = SCHEMA_PATH.read_text(encoding="utf-8")
    conn.execute(sql)
    conn.commit()


def recompute_chain_counts(conn: psycopg.Connection[Any]) -> None:
    """Recompute chain_branch_count across places by chain_key or normalized_name."""
    conn.execute(
        """
        UPDATE places
        SET chain_key = COALESCE(NULLIF(normalized_brand, ''), normalized_name)
        WHERE chain_key IS NULL OR chain_key = '';
        """
    )
    conn.execute(
        """
        WITH counts AS (
            SELECT chain_key, COUNT(*)::int AS cnt
            FROM places
            WHERE chain_key IS NOT NULL AND chain_key <> ''
            GROUP BY chain_key
        )
        UPDATE places AS p
        SET chain_branch_count = c.cnt
        FROM counts AS c
        WHERE p.chain_key = c.chain_key;
        """
    )
    conn.commit()


def _strip_latin_accents(text: str) -> str:
    """Remove diacritical marks from Latin characters while keeping Cyrillic 'й' intact."""
    out: list[str] = []
    for ch in text:
        if "а" <= ch <= "я" or ch == "ё":
            out.append(ch)
            continue
        decomposed = unicodedata.normalize("NFKD", ch)
        stripped = "".join(c for c in decomposed if not unicodedata.combining(c))
        out.append(stripped)
    return "".join(out)


def normalize_name(text: str | None, *, strip_generic: bool = True) -> str:
    """Normalize venue name: lowercase, ё->е, strip accents/quotes/generic venue words."""
    if not text:
        return ""
    cleaned = text.strip().lower().replace("ё", "е")
    cleaned = _strip_latin_accents(cleaned)
    cleaned = _QUOTES_RE.sub("", cleaned)
    cleaned = _NON_WORD_RE.sub(" ", cleaned)
    cleaned = _TRAILING_HARD_SIGN_RE.sub("", cleaned)
    cleaned = _MULTI_SPACE_RE.sub(" ", cleaned).strip()
    if not cleaned:
        return ""

    tokens = cleaned.split()
    if strip_generic:
        filtered = [tok for tok in tokens if tok not in GENERIC_PLACE_WORDS]
        if filtered:
            tokens = filtered
    return " ".join(tokens)


def transliterate_ru_to_en(text: str) -> str:
    """Transliterate Cyrillic characters in normalized text to Latin."""
    if not text:
        return ""
    norm = normalize_name(text, strip_generic=False)
    out: list[str] = []
    for ch in norm:
        out.append(RU_TO_EN_MAP.get(ch, ch))
    return _MULTI_SPACE_RE.sub(" ", "".join(out)).strip()


def _transliterate_en_token_to_ru(token: str, *, phonetic: bool = True) -> str:
    if phonetic and token in EN_WORD_TO_RU:
        return EN_WORD_TO_RU[token]
    work = token
    for src, dst in EN_DIGRAPHS_TO_RU:
        work = work.replace(src, dst)
    out: list[str] = []
    for ch in work:
        out.append(EN_CHAR_TO_RU.get(ch, ch))
    return "".join(out)


def transliterate_en_to_ru(text: str, *, phonetic: bool = True) -> str:
    """Transliterate Latin characters in normalized text to Cyrillic."""
    if not text:
        return ""
    norm = normalize_name(text, strip_generic=False)
    tokens = [_transliterate_en_token_to_ru(tok, phonetic=phonetic) for tok in norm.split() if tok]
    return _MULTI_SPACE_RE.sub(" ", " ".join(tokens)).strip()


def build_translit_name(
    name: str,
    name_en: str | None = None,
    brand: str | None = None,
) -> str:
    """Build opposite-script and alternate transliterated forms for GIN trgm indexing."""
    norm = normalize_name(name)
    variants: list[str] = []

    def _add(val: str) -> None:
        v = val.strip()
        if v and v != norm and v not in variants:
            variants.append(v)

    if norm:
        _add(transliterate_ru_to_en(norm))
        _add(transliterate_en_to_ru(norm, phonetic=True))
        _add(transliterate_en_to_ru(norm, phonetic=False))

    if name_en:
        norm_en = normalize_name(name_en)
        _add(norm_en)
        if norm_en:
            _add(transliterate_en_to_ru(norm_en, phonetic=True))
            _add(transliterate_en_to_en_or_ru(norm_en))

    if brand:
        norm_brand = normalize_name(brand)
        _add(norm_brand)
        if norm_brand:
            _add(transliterate_ru_to_en(norm_brand))
            _add(transliterate_en_to_ru(norm_brand, phonetic=True))

    return " ".join(variants) if variants else norm


def transliterate_en_to_en_or_ru(text: str) -> str:
    """Return literal RU->EN transliteration helper."""
    return transliterate_ru_to_en(text)


def generate_query_variants(query: str) -> list[str]:
    """Generate normalized + RU<->EN transliterated query variants."""
    norm = normalize_name(query, strip_generic=True)
    if not norm:
        norm = normalize_name(query, strip_generic=False)
    if not norm:
        return []

    variants: list[str] = []
    for candidate in (
        norm,
        transliterate_ru_to_en(norm),
        transliterate_en_to_ru(norm, phonetic=True),
        transliterate_en_to_ru(norm, phonetic=False),
    ):
        cleaned = normalize_name(candidate, strip_generic=True) or candidate.strip()
        if cleaned and cleaned not in variants:
            variants.append(cleaned)
    return variants


def normalize_street(text: str | None) -> str:
    """Normalize street name or street address hint."""
    if not text:
        return ""
    cleaned = text.strip().lower().replace("ё", "е")
    cleaned = _strip_latin_accents(cleaned)
    cleaned = _QUOTES_RE.sub("", cleaned)
    cleaned = _NON_WORD_RE.sub(" ", cleaned)
    tokens = [
        tok
        for tok in cleaned.split()
        if tok not in STREET_STOP_WORDS and not _HOUSE_TOKEN_RE.match(tok)
    ]
    return " ".join(tokens)


def normalize_metro(text: str | None) -> str:
    """Normalize metro / МЦК station name hint."""
    if not text:
        return ""
    cleaned = text.strip().lower().replace("ё", "е")
    cleaned = _strip_latin_accents(cleaned)
    cleaned = _QUOTES_RE.sub("", cleaned)
    cleaned = _NON_WORD_RE.sub(" ", cleaned)
    tokens = [tok for tok in cleaned.split() if tok not in METRO_STOP_WORDS]
    return " ".join(tokens)


class PlaceMatcher:
    """Matches extracted venue names and optional geo hints against PostGIS."""

    def __init__(
        self,
        conn: psycopg.Connection[Any],
        *,
        metro_radius_m: float = 1500.0,
        min_name_similarity: float = 0.45,
    ) -> None:
        self.conn = conn
        self.metro_radius_m = metro_radius_m
        self.min_name_similarity = min_name_similarity

    def _find_metro_stations(self, metro_hint: str) -> list[tuple[str, float, float, float]]:
        """Return matching metro stations as (name, lon, lat, sim_score)."""
        norm_metro = normalize_metro(metro_hint)
        if not norm_metro:
            return []
        metro_en = transliterate_ru_to_en(norm_metro)
        metro_ru = transliterate_en_to_ru(norm_metro)

        rows = self.conn.execute(
            """
            SELECT
                name,
                ST_X(geom) AS lon,
                ST_Y(geom) AS lat,
                GREATEST(
                    word_similarity(%(q1)s, normalized_name),
                    similarity(%(q1)s, normalized_name),
                    word_similarity(%(q2)s, translit_name),
                    word_similarity(%(q3)s, normalized_name)
                ) AS sim
            FROM metro_stations
            WHERE
                word_similarity(%(q1)s, normalized_name) >= 0.55
                OR word_similarity(%(q2)s, translit_name) >= 0.55
                OR word_similarity(%(q3)s, normalized_name) >= 0.55
            ORDER BY sim DESC
            LIMIT 6
            """,
            {"q1": norm_metro, "q2": metro_en, "q3": metro_ru},
        ).fetchall()

        if not rows:
            return []
        best_sim = float(rows[0][3])
        # Keep all nodes of the same transfer hub (e.g. multiple lines of the same station)
        return [
            (str(r[0]), float(r[1]), float(r[2]), float(r[3]))
            for r in rows
            if float(r[3]) >= max(0.6, best_sim - 0.12)
        ]

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
        """Match an extracted place name with optional metro/street hints."""
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

        q1 = variants[0]
        q2 = variants[1] if len(variants) > 1 else q1
        q3 = variants[2] if len(variants) > 2 else q1

        eff_metro = metro or geo_hint
        eff_street = street or geo_hint
        norm_street = normalize_street(eff_street) if eff_street else ""
        matched_metros = self._find_metro_stations(eff_metro) if eff_metro else []
        has_geo_hint = bool(norm_street or eff_metro)
        primary_metro_lon = matched_metros[0][1] if matched_metros else None
        primary_metro_lat = matched_metros[0][2] if matched_metros else None

        # Configure pg_trgm word_similarity threshold so GIN index can accelerate queries
        self.conn.execute("SELECT set_limit(0.35);")

        sql = """
            WITH raw_candidates AS (
                SELECT
                    p.osm_id,
                    p.name,
                    p.name_en,
                    p.normalized_name,
                    p.translit_name,
                    p.category,
                    p.brand,
                    p.normalized_brand,
                    p.chain_key,
                    p.chain_branch_count,
                    p.addr_street,
                    p.normalized_street,
                    p.addr_housenumber,
                    p.address_full,
                    p.opening_hours,
                    ST_Y(p.geom) AS lat,
                    ST_X(p.geom) AS lon,
                    p.geom,
                    GREATEST(
                        word_similarity(%(q1)s, p.normalized_name),
                        word_similarity(%(q2)s, p.normalized_name),
                        word_similarity(%(q3)s, p.normalized_name),
                        word_similarity(%(q1)s, p.translit_name),
                        word_similarity(%(q2)s, p.translit_name),
                        word_similarity(%(q3)s, p.translit_name),
                        COALESCE(word_similarity(%(q1)s, p.normalized_brand), 0.0),
                        COALESCE(word_similarity(%(q2)s, p.normalized_brand), 0.0)
                    ) AS w_sim,
                    GREATEST(
                        similarity(%(q1)s, p.normalized_name),
                        similarity(%(q2)s, p.normalized_name),
                        similarity(%(q3)s, p.normalized_name),
                        similarity(%(q1)s, p.translit_name),
                        similarity(%(q2)s, p.translit_name),
                        similarity(%(q3)s, p.translit_name),
                        COALESCE(similarity(%(q1)s, p.normalized_brand), 0.0),
                        COALESCE(similarity(%(q2)s, p.normalized_brand), 0.0)
                    ) AS f_sim,
                    CASE
                        WHEN %(norm_street)s <> ''
                            AND p.normalized_street IS NOT NULL
                            AND p.normalized_street <> ''
                        THEN GREATEST(
                            word_similarity(%(norm_street)s, p.normalized_street),
                            similarity(%(norm_street)s, p.normalized_street)
                        )
                        ELSE 0.0
                    END AS street_sim,
                    CASE
                        WHEN %(metro_lon)s::double precision IS NOT NULL
                            AND %(metro_lat)s::double precision IS NOT NULL
                        THEN ST_Distance(
                            p.geom::geography,
                            ST_SetSRID(
                                ST_MakePoint(
                                    %(metro_lon)s::double precision,
                                    %(metro_lat)s::double precision
                                ),
                                4326
                            )::geography
                        )
                        ELSE 1000000.0
                    END AS approx_metro_dist
                FROM places AS p
                WHERE
                    (
                        %(q1)s <%% p.normalized_name
                        OR %(q2)s <%% p.normalized_name
                        OR %(q3)s <%% p.normalized_name
                        OR %(q1)s <%% p.translit_name
                        OR %(q2)s <%% p.translit_name
                        OR %(q3)s <%% p.translit_name
                        OR word_similarity(%(q1)s, p.normalized_name) >= %(min_sim)s
                        OR word_similarity(%(q2)s, p.normalized_name) >= %(min_sim)s
                        OR word_similarity(%(q1)s, p.translit_name) >= %(min_sim)s
                        OR word_similarity(%(q2)s, p.translit_name) >= %(min_sim)s
                    )
                    AND (%(category)s::text IS NULL OR p.category = %(category)s)
            )
            SELECT
                osm_id,
                name,
                name_en,
                normalized_name,
                translit_name,
                category,
                brand,
                normalized_brand,
                chain_key,
                chain_branch_count,
                addr_street,
                normalized_street,
                addr_housenumber,
                address_full,
                opening_hours,
                lat,
                lon,
                w_sim,
                f_sim,
                street_sim
            FROM raw_candidates
            WHERE w_sim >= %(min_sim)s
            ORDER BY
                (0.7 * w_sim + 0.3 * f_sim) DESC,
                street_sim DESC,
                approx_metro_dist ASC
            LIMIT 100
        """

        rows = self.conn.execute(
            sql,
            {
                "q1": q1,
                "q2": q2,
                "q3": q3,
                "norm_street": norm_street,
                "metro_lon": primary_metro_lon,
                "metro_lat": primary_metro_lat,
                "min_sim": self.min_name_similarity,
                "category": category,
            },
        ).fetchall()

        if not rows:
            return MatchResult(
                query=name,
                normalized_query=norm_query,
                translit_variants=variants,
                status="not_found",
                candidates=[],
                reason="no candidates above word_similarity threshold",
            )

        variant_set = set(variants)
        scored_candidates: list[tuple[PlaceCandidate, bool, str]] = []

        for row in rows:
            (
                osm_id,
                r_name,
                r_name_en,
                r_norm_name,
                r_translit_name,
                r_category,
                r_brand,
                r_norm_brand,
                r_chain_key,
                r_chain_count,
                r_addr_street,
                _r_norm_street,
                r_addr_house,
                r_address_full,
                r_opening_hours,
                r_lat,
                r_lon,
                w_sim,
                f_sim,
                street_sim,
            ) = row

            w_sim_f = float(w_sim)
            f_sim_f = float(f_sim)
            street_sim_f = float(street_sim)

            translit_tokens = set(str(r_translit_name or "").split())
            exact_name_hit = (
                str(r_norm_name) in variant_set
                or str(r_translit_name) in variant_set
                or (r_norm_brand and str(r_norm_brand) in variant_set)
                or (len(variant_set & translit_tokens) > 0 and f_sim_f >= 0.65)
            )

            name_score = 1.0 if exact_name_hit else min(1.0, 0.72 * w_sim_f + 0.28 * f_sim_f)

            # Evaluate metro distance if metro stations matched
            min_metro_dist: float | None = None
            closest_metro_name: str | None = None
            if matched_metros:
                for m_name, m_lon, m_lat, _m_sim in matched_metros:
                    dist_row = self.conn.execute(
                        "SELECT ST_Distance("
                        "ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography, "
                        "ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography)",
                        (float(r_lon), float(r_lat), m_lon, m_lat),
                    ).fetchone()
                    if dist_row is not None:
                        dist_m = float(dist_row[0])
                        if min_metro_dist is None or dist_m < min_metro_dist:
                            min_metro_dist = dist_m
                            closest_metro_name = m_name

            geo_score = 0.0
            geo_matched = False
            reason_parts: list[str] = [f"name_score={name_score:.2f}"]
            if exact_name_hit and r_norm_name not in variant_set:
                reason_parts.append("translit/alias match")

            if (street is not None or geo_hint is not None) and street_sim_f >= 0.60:
                geo_matched = True
                geo_score = max(geo_score, street_sim_f)
                reason_parts.append(f"street match '{r_addr_street}' ({street_sim_f:.2f})")

            if min_metro_dist is not None and closest_metro_name is not None:
                if min_metro_dist <= self.metro_radius_m:
                    geo_matched = True
                    metro_proximity = max(
                        0.60,
                        1.0 - (min_metro_dist / (self.metro_radius_m * 2.5)),
                    )
                    geo_score = max(geo_score, metro_proximity)
                    reason_parts.append(
                        f"near metro '{closest_metro_name}' ({min_metro_dist:.0f} m)"
                    )
                else:
                    reason_parts.append(
                        f"far from metro '{closest_metro_name}' ({min_metro_dist:.0f} m)"
                    )

            if has_geo_hint:
                if geo_matched:
                    total_score = min(1.0, 0.75 * name_score + 0.25 * geo_score)
                else:
                    total_score = 0.55 * name_score
            else:
                total_score = name_score

            chain_key_str = str(r_chain_key or r_norm_name)
            if int(r_chain_count) > 1:
                reason_parts.append(f"chain ({int(r_chain_count)} branches)")

            cand = PlaceCandidate(
                osm_id=int(osm_id),
                name=str(r_name),
                name_en=str(r_name_en) if r_name_en is not None else None,
                category=str(r_category),
                brand=str(r_brand) if r_brand is not None else None,
                chain_branch_count=int(r_chain_count),
                addr_street=str(r_addr_street) if r_addr_street is not None else None,
                addr_housenumber=str(r_addr_house) if r_addr_house is not None else None,
                address_full=str(r_address_full) if r_address_full is not None else None,
                lat=float(r_lat),
                lon=float(r_lon),
                opening_hours=str(r_opening_hours) if r_opening_hours is not None else None,
                score=round(total_score, 4),
                name_score=round(name_score, 4),
                geo_score=round(geo_score, 4),
                metro_distance_m=(round(min_metro_dist, 1) if min_metro_dist is not None else None),
                matched_metro=closest_metro_name,
                reason="; ".join(reason_parts),
            )
            scored_candidates.append((cand, geo_matched, chain_key_str))

        scored_candidates.sort(
            key=lambda item: (item[0].score, item[0].name_score, item[0].geo_score),
            reverse=True,
        )

        top_cand, top_geo_matched, top_chain_key = scored_candidates[0]
        if top_cand.name_score < 0.58:
            return MatchResult(
                query=name,
                normalized_query=norm_query,
                translit_variants=variants,
                status="not_found",
                candidates=[],
                reason=f"best candidate name_score={top_cand.name_score:.2f} below threshold 0.58",
            )

        # Count how many strong candidates belong to the same chain / normalized name
        same_chain_strong = [
            (c, gm)
            for c, gm, ck in scored_candidates
            if ck == top_chain_key and c.name_score >= max(0.75, top_cand.name_score - 0.08)
        ]
        is_chain = top_cand.chain_branch_count > 1 or len(same_chain_strong) > 1

        if is_chain:
            if not has_geo_hint:
                # NEVER pick a random branch of a chain without address/metro hint
                chain_cands = [c for c, _gm in same_chain_strong[:limit]]
                return MatchResult(
                    query=name,
                    normalized_query=norm_query,
                    translit_variants=variants,
                    status="chain_ambiguous",
                    candidates=chain_cands,
                    reason=(
                        f"chain '{top_cand.name}' has "
                        f"{max(top_cand.chain_branch_count, len(same_chain_strong))} "
                        "branches and no street/metro hint was provided"
                    ),
                )

            geo_matched_chain = [c for c, gm in same_chain_strong if gm]
            if len(geo_matched_chain) == 1:
                winner = geo_matched_chain[0]
                others = [c for c, _gm, _ck in scored_candidates if c.osm_id != winner.osm_id][
                    : max(0, limit - 1)
                ]
                return MatchResult(
                    query=name,
                    normalized_query=norm_query,
                    translit_variants=variants,
                    status="exact",
                    candidates=[winner, *others],
                    reason=(
                        f"chain '{winner.name}' uniquely resolved by geo hint ({winner.reason})"
                    ),
                )

            if len(geo_matched_chain) > 1:
                return MatchResult(
                    query=name,
                    normalized_query=norm_query,
                    translit_variants=variants,
                    status="chain_ambiguous",
                    candidates=geo_matched_chain[:limit],
                    reason=(
                        f"chain '{top_cand.name}' still has {len(geo_matched_chain)} "
                        "branches matching the geo hint"
                    ),
                )

            return MatchResult(
                query=name,
                normalized_query=norm_query,
                translit_variants=variants,
                status="chain_ambiguous",
                candidates=[c for c, _gm in same_chain_strong[:limit]],
                reason=(
                    f"chain '{top_cand.name}' matched by name, but no branch matched "
                    "the provided geo hint"
                ),
            )

        # Non-chain resolution: check if top candidate is unambiguous
        if has_geo_hint and not top_geo_matched:
            # Check if another strong candidate matched the geo hint
            geo_hits = [
                (c, gm, ck) for c, gm, ck in scored_candidates if gm and c.name_score >= 0.72
            ]
            if len(geo_hits) == 1:
                winner = geo_hits[0][0]
                others = [c for c, _gm, _ck in scored_candidates if c.osm_id != winner.osm_id][
                    : max(0, limit - 1)
                ]
                return MatchResult(
                    query=name,
                    normalized_query=norm_query,
                    translit_variants=variants,
                    status="exact",
                    candidates=[winner, *others],
                    reason=f"resolved by name and geo hint ({winner.reason})",
                )
            return MatchResult(
                query=name,
                normalized_query=norm_query,
                translit_variants=variants,
                status="ambiguous",
                candidates=[c for c, _gm, _ck in scored_candidates[:limit]],
                reason="name matched, but geo hint did not match the candidate location",
            )

        second_cand = scored_candidates[1][0] if len(scored_candidates) > 1 else None
        if top_cand.name_score >= 0.82 and (
            second_cand is None or (top_cand.score - second_cand.score) >= 0.10
        ):
            return MatchResult(
                query=name,
                normalized_query=norm_query,
                translit_variants=variants,
                status="exact",
                candidates=[c for c, _gm, _ck in scored_candidates[:limit]],
                reason=f"unambiguous match ({top_cand.reason})",
            )

        return MatchResult(
            query=name,
            normalized_query=norm_query,
            translit_variants=variants,
            status="ambiguous",
            candidates=[c for c, _gm, _ck in scored_candidates[:limit]],
            reason=(
                "multiple close candidates or partial name similarity "
                f"(top_score={top_cand.score:.2f})"
            ),
        )


def _main() -> None:
    parser = argparse.ArgumentParser(description="Match a Moscow venue name in PostGIS.")
    parser.add_argument("name", help="Extracted venue name to match")
    parser.add_argument("--metro", help="Optional metro / МЦК station hint")
    parser.add_argument("--street", help="Optional street hint")
    parser.add_argument("--geo-hint", help="Optional combined metro/street hint")
    parser.add_argument("--category", help="Optional category filter")
    parser.add_argument("--limit", type=int, default=5, help="Max candidates to return")
    parser.add_argument("--dsn", default=get_default_dsn(), help="PostgreSQL DSN")
    args = parser.parse_args()

    with psycopg.connect(args.dsn) as conn:
        matcher = PlaceMatcher(conn)
        result = matcher.match(
            args.name,
            metro=args.metro,
            street=args.street,
            geo_hint=args.geo_hint,
            category=args.category,
            limit=args.limit,
        )
    print(json.dumps(asdict(result), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    _main()
