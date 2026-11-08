"""Integration and unit tests for Moscow PostGIS place matcher."""

from __future__ import annotations

from collections.abc import Generator
from typing import Any

import psycopg
import pytest

from load_osm import parse_metro_element, parse_place_element, upsert_metro_stations, upsert_places
from matcher import (
    PlaceMatcher,
    ensure_schema,
    get_default_dsn,
    normalize_metro,
    normalize_name,
    normalize_street,
    transliterate_en_to_ru,
    transliterate_ru_to_en,
)

# 12 Moscow metro and МЦК stations with real WGS84 coordinates
FIXTURE_METRO_ELEMENTS: list[dict[str, Any]] = [
    {
        "id": 1001,
        "type": "node",
        "lat": 55.7563,
        "lon": 37.6300,
        "tags": {
            "name": "Китай-город",
            "name:en": "Kitay-gorod",
            "railway": "station",
            "station": "subway",
            "network": "Московский метрополитен",
        },
    },
    {
        "id": 1002,
        "type": "node",
        "lat": 55.7653,
        "lon": 37.6039,
        "tags": {
            "name": "Тверская",
            "name:en": "Tverskaya",
            "railway": "station",
            "station": "subway",
            "network": "Московский метрополитен",
        },
    },
    {
        "id": 1003,
        "type": "node",
        "lat": 55.7767,
        "lon": 37.5835,
        "tags": {
            "name": "Белорусская",
            "name:en": "Belorusskaya",
            "railway": "station",
            "station": "subway",
            "network": "Московский метрополитен",
        },
    },
    {
        "id": 1004,
        "type": "node",
        "lat": 55.7352,
        "lon": 37.5930,
        "tags": {
            "name": "Парк культуры",
            "name:en": "Park Kultury",
            "railway": "station",
            "station": "subway",
            "network": "Московский метрополитен",
        },
    },
    {
        "id": 1005,
        "type": "node",
        "lat": 55.7649,
        "lon": 37.6388,
        "tags": {
            "name": "Чистые пруды",
            "name:en": "Chistye Prudy",
            "railway": "station",
            "station": "subway",
            "network": "Московский метрополитен",
        },
    },
    {
        "id": 1006,
        "type": "node",
        "lat": 55.7522,
        "lon": 37.6015,
        "tags": {
            "name": "Арбатская",
            "name:en": "Arbatskaya",
            "railway": "station",
            "station": "subway",
            "network": "Московский метрополитен",
        },
    },
    {
        "id": 1007,
        "type": "node",
        "lat": 55.7451,
        "lon": 37.6035,
        "tags": {
            "name": "Кропоткинская",
            "name:en": "Kropotkinskaya",
            "railway": "station",
            "station": "subway",
            "network": "Московский метрополитен",
        },
    },
    {
        "id": 1008,
        "type": "node",
        "lat": 55.7699,
        "lon": 37.5963,
        "tags": {
            "name": "Маяковская",
            "name:en": "Mayakovskaya",
            "railway": "station",
            "station": "subway",
            "network": "Московский метрополитен",
        },
    },
    {
        "id": 1009,
        "type": "node",
        "lat": 55.7408,
        "lon": 37.6256,
        "tags": {
            "name": "Третьяковская",
            "name:en": "Tretyakovskaya",
            "railway": "station",
            "station": "subway",
            "network": "Московский метрополитен",
        },
    },
    {
        "id": 1010,
        "type": "node",
        "lat": 55.7477,
        "lon": 37.5838,
        "tags": {
            "name": "Смоленская",
            "name:en": "Smolenskaya",
            "railway": "station",
            "station": "subway",
            "network": "Московский метрополитен",
        },
    },
    {
        "id": 1011,
        "type": "node",
        "lat": 55.7675,
        "lon": 37.6219,
        "tags": {
            "name": "Трубная",
            "name:en": "Trubnaya",
            "railway": "station",
            "station": "subway",
            "network": "Московский метрополитен",
        },
    },
    {
        "id": 1012,
        "type": "node",
        "lat": 55.7203,
        "lon": 37.5608,
        "tags": {
            "name": "Лужники",
            "name:en": "Luzhniki",
            "railway": "station",
            "station": "light_rail",
            "network": "МЦК",
        },
    },
]

# 40 realistic Moscow places across all target categories (cafe, restaurant, bar, pub,
# fast_food, museum, gallery, park) including multi-branch chains and translit names
FIXTURE_PLACE_ELEMENTS: list[dict[str, Any]] = [
    {
        "id": 2001,
        "type": "node",
        "lat": 55.7621,
        "lon": 37.6368,
        "tags": {
            "name": "Flâner",
            "amenity": "bar",
            "addr:street": "Кривоколенный переулок",
            "addr:housenumber": "7",
            "opening_hours": "Mo-Su 12:00-00:00",
        },
    },
    {
        "id": 2002,
        "type": "node",
        "lat": 55.7638,
        "lon": 37.6046,
        "tags": {
            "name": "Кафе «Пушкинъ»",
            "name:en": "Cafe Pushkin",
            "amenity": "restaurant",
            "addr:street": "Тверской бульвар",
            "addr:housenumber": "26А",
            "opening_hours": "24/7",
        },
    },
    {
        "id": 2003,
        "type": "node",
        "lat": 55.7629,
        "lon": 37.6062,
        "tags": {
            "name": "Бар Ровесник",
            "amenity": "bar",
            "addr:street": "Малый Гнездниковский переулок",
            "addr:housenumber": "9с2",
            "opening_hours": "Mo-Su 14:00-04:00",
        },
    },
    {
        "id": 2004,
        "type": "node",
        "lat": 55.7473,
        "lon": 37.5815,
        "tags": {
            "name": "White Rabbit",
            "amenity": "restaurant",
            "addr:street": "Смоленская площадь",
            "addr:housenumber": "3",
            "opening_hours": "Mo-Su 12:00-00:00",
        },
    },
    {
        "id": 2005,
        "type": "node",
        "lat": 55.7574,
        "lon": 37.6352,
        "tags": {
            "name": "Underdog",
            "amenity": "bar",
            "addr:street": "улица Маросейка",
            "addr:housenumber": "6-8с1",
            "opening_hours": "Mo-Su 12:00-23:00",
        },
    },
    {
        "id": 2006,
        "type": "node",
        "lat": 55.7595,
        "lon": 37.6442,
        "tags": {
            "name": "Pims",
            "amenity": "cafe",
            "addr:street": "улица Покровка",
            "addr:housenumber": "16",
            "opening_hours": "Mo-Su 10:00-23:00",
        },
    },
    {
        "id": 2007,
        "type": "node",
        "lat": 55.7423,
        "lon": 37.6095,
        "tags": {
            "name": "Бар «Стрелка»",
            "name:en": "Strelka Bar",
            "amenity": "bar",
            "addr:street": "Берсеневская набережная",
            "addr:housenumber": "14с5",
            "opening_hours": "Mo-Su 12:00-00:00",
        },
    },
    {
        "id": 2008,
        "type": "way",
        "center": {"lat": 55.7277, "lon": 37.6015},
        "tags": {
            "name": "Музей современного искусства «Гараж»",
            "name:en": "Garage Museum of Contemporary Art",
            "tourism": "museum",
            "addr:street": "улица Крымский Вал",
            "addr:housenumber": "9с32",
            "opening_hours": "Mo-Su 11:00-22:00",
        },
    },
    {
        "id": 2009,
        "type": "way",
        "center": {"lat": 55.7429, "lon": 37.6126},
        "tags": {
            "name": "Дом культуры «ГЭС-2»",
            "name:en": "GES-2",
            "tourism": "museum",
            "addr:street": "Болотная набережная",
            "addr:housenumber": "15",
            "opening_hours": "Mo-Su 11:00-22:00",
        },
    },
    {
        "id": 2010,
        "type": "way",
        "center": {"lat": 55.7415, "lon": 37.6208},
        "tags": {
            "name": "Третьяковская галерея",
            "tourism": "gallery",
            "addr:street": "Лаврушинский переулок",
            "addr:housenumber": "10",
            "opening_hours": "Tu-Su 10:00-18:00",
        },
    },
    {
        "id": 2011,
        "type": "way",
        "center": {"lat": 55.7510, "lon": 37.6288},
        "tags": {
            "name": "Парк «Зарядье»",
            "leisure": "park",
            "addr:street": "улица Варварка",
            "addr:housenumber": "6с1",
            "opening_hours": "24/7",
        },
    },
    {
        "id": 2012,
        "type": "way",
        "center": {"lat": 55.7298, "lon": 37.6012},
        "tags": {
            "name": "Парк Горького",
            "leisure": "park",
            "addr:street": "улица Крымский Вал",
            "addr:housenumber": "9",
            "opening_hours": "24/7",
        },
    },
    {
        "id": 2013,
        "type": "way",
        "center": {"lat": 55.7703, "lon": 37.6095},
        "tags": {
            "name": "Сад «Эрмитаж»",
            "leisure": "park",
            "addr:street": "улица Каретный Ряд",
            "addr:housenumber": "3",
        },
    },
    {
        "id": 2014,
        "type": "node",
        "lat": 55.7405,
        "lon": 37.6001,
        "tags": {
            "name": "Галерея Ruarts",
            "tourism": "gallery",
            "addr:street": "1-й Зачатьевский переулок",
            "addr:housenumber": "10",
        },
    },
    {
        "id": 2015,
        "type": "way",
        "center": {"lat": 55.7368, "lon": 37.5919},
        "tags": {
            "name": "Музей Москвы",
            "tourism": "museum",
            "addr:street": "Зубовский бульвар",
            "addr:housenumber": "2",
        },
    },
    {
        "id": 2016,
        "type": "node",
        "lat": 55.7541,
        "lon": 37.6382,
        "tags": {
            "name": "Black Swan",
            "amenity": "pub",
            "addr:street": "улица Солянка",
            "addr:housenumber": "1/2с1",
        },
    },
    {
        "id": 2017,
        "type": "node",
        "lat": 55.7573,
        "lon": 37.6032,
        "tags": {
            "name": "Ресторан «Уголёк»",
            "amenity": "restaurant",
            "addr:street": "Большая Никитская улица",
            "addr:housenumber": "12",
        },
    },
    {
        "id": 2018,
        "type": "node",
        "lat": 55.7669,
        "lon": 37.6224,
        "tags": {
            "name": "Горыныч",
            "amenity": "restaurant",
            "addr:street": "Рождественский бульвар",
            "addr:housenumber": "1",
        },
    },
    {
        "id": 2019,
        "type": "node",
        "lat": 55.7574,
        "lon": 37.6034,
        "tags": {
            "name": "Северяне",
            "amenity": "restaurant",
            "addr:street": "Большая Никитская улица",
            "addr:housenumber": "12",
        },
    },
    {
        "id": 2020,
        "type": "node",
        "lat": 55.7618,
        "lon": 37.6198,
        "tags": {
            "name": "Вечные Французы",
            "amenity": "bar",
            "addr:street": "улица Кузнецкий Мост",
            "addr:housenumber": "9/10",
        },
    },
    {
        "id": 2021,
        "type": "node",
        "lat": 55.7289,
        "lon": 37.6004,
        "tags": {
            "name": "Лебединое озеро",
            "amenity": "bar",
            "addr:street": "улица Крымский Вал",
            "addr:housenumber": "9с22",
        },
    },
    {
        "id": 2022,
        "type": "node",
        "lat": 55.7634,
        "lon": 37.6132,
        "tags": {
            "name": "Энтузиаст",
            "amenity": "cafe",
            "addr:street": "Столешников переулок",
            "addr:housenumber": "7с5",
        },
    },
    {
        "id": 2023,
        "type": "node",
        "lat": 55.7619,
        "lon": 37.5945,
        "tags": {
            "name": "Ladurée",
            "amenity": "cafe",
            "addr:street": "Малая Бронная улица",
            "addr:housenumber": "27/14",
        },
    },
    {
        "id": 2024,
        "type": "node",
        "lat": 55.7636,
        "lon": 37.5955,
        "tags": {
            "name": "Pinch",
            "amenity": "restaurant",
            "addr:street": "Большой Палашевский переулок",
            "addr:housenumber": "2",
        },
    },
    {
        "id": 2025,
        "type": "node",
        "lat": 55.7655,
        "lon": 37.5948,
        "tags": {
            "name": "Butler",
            "amenity": "restaurant",
            "addr:street": "Трёхпрудный переулок",
            "addr:housenumber": "15",
        },
    },
    # Chain 1: Surf Coffee (5 branches in different districts/metros)
    {
        "id": 2026,
        "type": "node",
        "lat": 55.7576,
        "lon": 37.6361,
        "tags": {
            "name": "Surf Coffee",
            "brand": "Surf Coffee",
            "amenity": "cafe",
            "addr:street": "улица Маросейка",
            "addr:housenumber": "9/2",
        },
    },
    {
        "id": 2027,
        "type": "node",
        "lat": 55.7755,
        "lon": 37.5852,
        "tags": {
            "name": "Surf Coffee",
            "brand": "Surf Coffee",
            "amenity": "cafe",
            "addr:street": "1-я Тверская-Ямская улица",
            "addr:housenumber": "27",
        },
    },
    {
        "id": 2028,
        "type": "node",
        "lat": 55.7501,
        "lon": 37.5961,
        "tags": {
            "name": "Surf Coffee",
            "brand": "Surf Coffee",
            "amenity": "cafe",
            "addr:street": "улица Арбат",
            "addr:housenumber": "19",
        },
    },
    {
        "id": 2029,
        "type": "node",
        "lat": 55.7341,
        "lon": 37.5902,
        "tags": {
            "name": "Surf Coffee",
            "brand": "Surf Coffee",
            "amenity": "cafe",
            "addr:street": "улица Остоженка",
            "addr:housenumber": "42",
        },
    },
    {
        "id": 2030,
        "type": "node",
        "lat": 55.7212,
        "lon": 37.5621,
        "tags": {
            "name": "Surf Coffee",
            "brand": "Surf Coffee",
            "amenity": "cafe",
            "addr:street": "улица Хамовнический Вал",
            "addr:housenumber": "36",
        },
    },
    # Chain 2: Дринкит / Drinkit (4 branches in different districts/metros)
    {
        "id": 2031,
        "type": "node",
        "lat": 55.7779,
        "lon": 37.5829,
        "tags": {
            "name": "Дринкит",
            "name:en": "Drinkit",
            "brand": "Дринкит",
            "amenity": "cafe",
            "addr:street": "улица Бутырский Вал",
            "addr:housenumber": "10",
        },
    },
    {
        "id": 2032,
        "type": "node",
        "lat": 55.7586,
        "lon": 37.6410,
        "tags": {
            "name": "Дринкит",
            "name:en": "Drinkit",
            "brand": "Дринкит",
            "amenity": "cafe",
            "addr:street": "улица Покровка",
            "addr:housenumber": "4",
        },
    },
    {
        "id": 2033,
        "type": "node",
        "lat": 55.7524,
        "lon": 37.5910,
        "tags": {
            "name": "Дринкит",
            "name:en": "Drinkit",
            "brand": "Дринкит",
            "amenity": "cafe",
            "addr:street": "улица Новый Арбат",
            "addr:housenumber": "15",
        },
    },
    {
        "id": 2034,
        "type": "node",
        "lat": 55.7361,
        "lon": 37.5945,
        "tags": {
            "name": "Дринкит",
            "name:en": "Drinkit",
            "brand": "Дринкит",
            "amenity": "cafe",
            "addr:street": "Зубовский бульвар",
            "addr:housenumber": "17",
        },
    },
    # Chain 3: Теремок (3 fast_food branches)
    {
        "id": 2035,
        "type": "node",
        "lat": 55.7505,
        "lon": 37.5948,
        "tags": {
            "name": "Теремок",
            "brand": "Теремок",
            "amenity": "fast_food",
            "addr:street": "улица Арбат",
            "addr:housenumber": "22",
        },
    },
    {
        "id": 2036,
        "type": "node",
        "lat": 55.7760,
        "lon": 37.5841,
        "tags": {
            "name": "Теремок",
            "brand": "Теремок",
            "amenity": "fast_food",
            "addr:street": "1-я Тверская-Ямская улица",
            "addr:housenumber": "29",
        },
    },
    {
        "id": 2037,
        "type": "node",
        "lat": 55.7568,
        "lon": 37.6322,
        "tags": {
            "name": "Теремок",
            "brand": "Теремок",
            "amenity": "fast_food",
            "addr:street": "улица Маросейка",
            "addr:housenumber": "2/15",
        },
    },
    # Ambiguous non-chain pair with close names ("Рассвет Паб" vs "Рассвет Бистро")
    {
        "id": 2038,
        "type": "node",
        "lat": 55.7418,
        "lon": 37.6285,
        "tags": {
            "name": "Рассвет Северный",
            "amenity": "pub",
            "addr:street": "улица Пятницкая",
            "addr:housenumber": "25",
        },
    },
    {
        "id": 2039,
        "type": "node",
        "lat": 55.7602,
        "lon": 37.6481,
        "tags": {
            "name": "Рассвет Южный",
            "amenity": "cafe",
            "addr:street": "улица Покровка",
            "addr:housenumber": "31",
        },
    },
    {
        "id": 2040,
        "type": "node",
        "lat": 55.7642,
        "lon": 37.6378,
        "tags": {
            "name": "Дом Культур",
            "amenity": "restaurant",
            "addr:street": "улица Сретенка",
            "addr:housenumber": "25",
        },
    },
]


@pytest.fixture(scope="module")
def db_conn() -> Generator[psycopg.Connection[Any], None, None]:
    """Connect to PostGIS from docker-compose.geo.yml or skip with clear reason."""
    dsn = get_default_dsn()
    try:
        conn = psycopg.connect(dsn, connect_timeout=3)
    except psycopg.OperationalError as exc:
        pytest.skip(f"PostGIS container from docker-compose.geo.yml is unreachable ({dsn}): {exc}")
        return

    try:
        # Use an isolated test schema so running pytest never wipes out public.places
        conn.execute("DROP SCHEMA IF EXISTS test_geo_fixture CASCADE;")
        conn.execute("CREATE SCHEMA test_geo_fixture;")
        conn.execute("SET search_path TO test_geo_fixture, public;")
        ensure_schema(conn)

        place_rows = [
            r for el in FIXTURE_PLACE_ELEMENTS if (r := parse_place_element(el)) is not None
        ]
        metro_rows = [
            r for el in FIXTURE_METRO_ELEMENTS if (r := parse_metro_element(el)) is not None
        ]
        assert 30 <= len(place_rows) <= 50, f"Expected 30..50 fixture places, got {len(place_rows)}"

        upsert_places(conn, place_rows)
        upsert_metro_stations(conn, metro_rows)
        yield conn
    finally:
        try:
            conn.execute("DROP SCHEMA IF EXISTS test_geo_fixture CASCADE;")
            conn.commit()
        except Exception:
            pass
        conn.close()


def test_normalization_and_translit_unit() -> None:
    """Verify normalization (case, ё, quotes, generic words) and RU<->EN transliteration."""
    assert normalize_name("Кафе «Пушкинъ»") == "пушкин"
    assert normalize_name("Ресторан «Уголёк»") == "уголек"
    assert normalize_name("Бар Ровесник") == "ровесник"
    assert normalize_name("Flâner") == "flaner"
    assert transliterate_en_to_ru("Flâner") == "фланер"
    assert transliterate_ru_to_en("Фланер") == "flaner"
    assert normalize_street("ул. Маросейка, д. 6-8с1") == "маросейка"
    assert normalize_metro("ст. м. Китай-город") == "китай город"


def test_exact_name_match(db_conn: psycopg.Connection[Any]) -> None:
    """Exact name with quotes, ё, and generic words resolves to status='exact'."""
    matcher = PlaceMatcher(db_conn)

    res_pushkin = matcher.match("Кафе «Пушкинъ»")
    assert res_pushkin.status == "exact"
    assert res_pushkin.candidates[0].osm_id == 2002
    assert res_pushkin.candidates[0].score >= 0.95

    res_ugolek = matcher.match("ресторан Уголёк")
    assert res_ugolek.status == "exact"
    assert res_ugolek.candidates[0].osm_id == 2017

    res_rovesnik = matcher.match("Ровесник")
    assert res_rovesnik.status == "exact"
    assert res_rovesnik.candidates[0].osm_id == 2003


def test_translit_match_flaner_and_others(db_conn: psycopg.Connection[Any]) -> None:
    """RU<->EN transliteration ('Flâner'/'Фланер', 'Пимс'/'Pims', 'Андердог'/'Underdog')."""
    matcher = PlaceMatcher(db_conn)

    # DB has 'Flâner', query in Cyrillic 'Фланер' and Latin 'Flâner'
    res_ru = matcher.match("Фланер")
    assert res_ru.status == "exact"
    assert res_ru.candidates[0].osm_id == 2001
    assert res_ru.candidates[0].name == "Flâner"

    res_en = matcher.match("Flâner")
    assert res_en.status == "exact"
    assert res_en.candidates[0].osm_id == 2001

    # DB has 'Pims', query in Cyrillic 'Пимс'
    res_pims = matcher.match("кафе Пимс")
    assert res_pims.status == "exact"
    assert res_pims.candidates[0].osm_id == 2006

    # DB has 'Underdog', query in Cyrillic 'бар Андердог'
    res_underdog = matcher.match("бар Андердог")
    assert res_underdog.status == "exact"
    assert res_underdog.candidates[0].osm_id == 2005


def test_chain_without_street_or_metro_never_picks_random_branch(
    db_conn: psycopg.Connection[Any],
) -> None:
    """Chain without address/metro hint MUST return 'chain_ambiguous', never 'exact'."""
    matcher = PlaceMatcher(db_conn)

    res_surf = matcher.match("Surf Coffee")
    assert res_surf.status == "chain_ambiguous"
    assert len(res_surf.candidates) >= 2
    assert all(c.chain_branch_count == 5 for c in res_surf.candidates)

    res_drinkit = matcher.match("Дринкит")
    assert res_drinkit.status == "chain_ambiguous"
    assert len(res_drinkit.candidates) >= 2
    assert all(c.chain_branch_count == 4 for c in res_drinkit.candidates)

    # Also via Russian transliteration of 'Surf Coffee' -> 'Серф Кофе'
    res_surf_ru = matcher.match("Серф Кофе")
    assert res_surf_ru.status == "chain_ambiguous"


def test_chain_with_metro_or_street_resolves_exact_branch(
    db_conn: psycopg.Connection[Any],
) -> None:
    """Chain with metro or street hint uniquely resolves the specific branch ('exact')."""
    matcher = PlaceMatcher(db_conn)

    # Surf Coffee near metro Белорусская -> branch 2027 (1-я Тверская-Ямская, 27)
    res_surf_bel = matcher.match("Surf Coffee", metro="м. Белорусская")
    assert res_surf_bel.status == "exact"
    assert res_surf_bel.candidates[0].osm_id == 2027
    assert res_surf_bel.candidates[0].matched_metro == "Белорусская"
    assert (res_surf_bel.candidates[0].metro_distance_m or 9999) < 500

    # Surf Coffee near МЦК Лужники -> branch 2030 (Хамовнический Вал, 36)
    res_surf_mck = matcher.match("Surf Coffee", metro="МЦК Лужники")
    assert res_surf_mck.status == "exact"
    assert res_surf_mck.candidates[0].osm_id == 2030

    # Дринкит near metro Китай-город -> branch 2032 (Покровка, 4)
    res_drinkit_kg = matcher.match("Дринкит", metro="Китай-город")
    assert res_drinkit_kg.status == "exact"
    assert res_drinkit_kg.candidates[0].osm_id == 2032

    # Теремок on street Маросейка -> branch 2037
    res_teremok_st = matcher.match("Теремок", street="ул. Маросейка")
    assert res_teremok_st.status == "exact"
    assert res_teremok_st.candidates[0].osm_id == 2037


def test_ambiguous_and_not_found(db_conn: psycopg.Connection[Any]) -> None:
    """Close non-chain candidates return 'ambiguous'; non-existent place returns 'not_found'."""
    matcher = PlaceMatcher(db_conn)

    # Two distinct non-chain venues 'Рассвет Северный' and 'Рассвет Южный'
    res_amb = matcher.match("Рассвет")
    assert res_amb.status == "ambiguous"
    assert len(res_amb.candidates) >= 2
    assert {res_amb.candidates[0].osm_id, res_amb.candidates[1].osm_id} == {2038, 2039}

    # With street hint 'Пятницкая', 'Рассвет' resolves to 2038 ('exact')
    res_amb_resolved = matcher.match("Рассвет", street="Пятницкая")
    assert res_amb_resolved.status == "exact"
    assert res_amb_resolved.candidates[0].osm_id == 2038

    # Non-existent venue
    res_missing = matcher.match("Несуществующее Кафе На Юпитере 404")
    assert res_missing.status == "not_found"
    assert res_missing.candidates == []
