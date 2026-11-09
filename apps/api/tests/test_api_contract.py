from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from where_is_hype_api.config import Settings
from where_is_hype_api.extraction import (
    FakeExtractionPipeline,
    HttpExtractionPipeline,
)
from where_is_hype_api.fixtures import DEMO_RECOGNIZED_LINK, DEMO_UNKNOWN_LINK
from where_is_hype_api.main import create_app
from where_is_hype_api.schemas import ExtractedPlaceItem, ExtractionResponse


def _make_client(
    tmp_path: Path,
    *,
    pipeline: Any | None = None,
    geo_database_url: str | None = None,
) -> tuple[TestClient, FakeExtractionPipeline]:
    db_file = tmp_path / "test_hype.db"
    fake_pipe = FakeExtractionPipeline()
    settings = Settings(
        database_path=str(db_file),
        extraction_mode="fake",
        geo_database_url=geo_database_url,
    )
    app = create_app(
        settings=settings,
        extraction_pipeline=pipeline or fake_pipe,
    )
    return (TestClient(app), fake_pipe)


def test_session_lifecycle_and_isolation(tmp_path: Path) -> None:
    client, _ = _make_client(tmp_path)

    initial = client.get("/me")
    assert initial.status_code == 200
    assert initial.json() is None

    created = client.post("/me")
    assert created.status_code == 201
    session_data = created.json()
    assert session_data["id"].startswith("usr-")
    assert "createdAt" in session_data

    again = client.post("/me")
    assert again.status_code == 200
    assert again.json()["id"] == session_data["id"]

    current = client.get("/me")
    assert current.status_code == 200
    assert current.json()["id"] == session_data["id"]

    # Save place for default session
    save_res = client.post("/me/places", json={"placeId": "zhuk-i-pchela"})
    assert save_res.status_code == 201

    # Another user with explicit X-Session-Id header sees empty saved places
    other_places = client.get("/me/places", headers={"X-Session-Id": "usr-other999"})
    assert other_places.status_code == 200
    assert other_places.json() == []


def test_places_list_and_search(tmp_path: Path) -> None:
    client, _ = _make_client(tmp_path)

    all_places = client.get("/places")
    assert all_places.status_code == 200
    places_data = all_places.json()
    assert len(places_data) == 40
    first = places_data[0]
    assert set(first.keys()) == {
        "id",
        "name",
        "type",
        "address",
        "metro",
        "location",
        "hours",
        "avgCheck",
        "yandexOrgId",
    }
    assert set(first["location"].keys()) == {"lat", "lng"}

    one_char = client.get("/places/search", params={"q": "Ж"})
    assert one_char.status_code == 200
    assert one_char.json() == []

    two_chars = client.get("/places/search", params={"q": "Жу"})
    assert two_chars.status_code == 200
    names = [p["name"] for p in two_chars.json()]
    assert "Журавли" in names
    assert "Жук и Пчела" in names
    assert "Жужжалка" in names


def test_resolve_new_link_and_repeat_uses_cache(tmp_path: Path) -> None:
    client, fake_pipe = _make_client(tmp_path)

    # First resolve (with tracking query parameter)
    first_res = client.post(
        "/links/resolve",
        json={"url": f"{DEMO_RECOGNIZED_LINK}?igsh=MzRlODBiNWFlZA=="},
    )
    assert first_res.status_code == 200
    assert first_res.headers.get("x-cache") == "MISS"
    assert first_res.headers.get("x-canonical-key") == "ig:hype-coffee"
    assert fake_pipe.call_count == 1

    candidates = first_res.json()
    assert len(candidates) == 3
    assert candidates[0]["place"]["id"] == "zhuk-i-pchela"
    assert candidates[0]["place"]["type"] == "coffee"
    assert candidates[0]["confidence"] == 0.95
    assert candidates[0]["matchStatus"] == "exact"

    # Second resolve of the same canonical link (different tracking params & no www)
    second_res = client.post(
        "/links/resolve",
        json={"url": "https://instagram.com/reel/hype-coffee?utm_source=ig_web_copy_link"},
    )
    assert second_res.status_code == 200
    assert second_res.headers.get("x-cache") == "HIT"
    assert second_res.json() == candidates
    assert fake_pipe.call_count == 1


def test_resolve_closed_private_and_invalid_links(tmp_path: Path) -> None:
    client, _ = _make_client(tmp_path)

    for url in (
        DEMO_UNKNOWN_LINK,
        "https://www.instagram.com/p/private-post/",
        "https://www.instagram.com/",
        "not a url",
        "",
    ):
        res = client.post("/links/resolve", json={"url": url})
        assert res.status_code == 200
        assert res.json() == []


def test_resolve_compilation_multiple_places(tmp_path: Path) -> None:
    client, _ = _make_client(tmp_path)

    res = client.post(
        "/links/resolve",
        json={"url": "https://www.instagram.com/reel/moscow-compilation-top3/"},
    )
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 3
    ids = [item["place"]["id"] for item in data]
    assert ids == ["zhuk-i-pchela", "zhuravli", "sosny-pekarnya"]
    for item in data:
        assert item["matchStatus"] == "exact"
        assert item["place"]["location"]["lat"] > 55.0
        assert item["place"]["location"]["lng"] > 37.0


def test_resolve_chain_without_address_and_not_found_never_invent_coordinates(
    tmp_path: Path,
) -> None:
    client, _ = _make_client(tmp_path)

    # Chain without stated address -> chain_ambiguous, place is None
    chain_res = client.post(
        "/links/resolve",
        json={"url": "https://www.instagram.com/reel/surf-coffee-chain-no-address/"},
    )
    assert chain_res.status_code == 200
    chain_items = chain_res.json()
    assert len(chain_items) == 1
    chain_cand = chain_items[0]
    assert chain_cand["place"] is None
    assert chain_cand["matchStatus"] == "chain_ambiguous"
    assert chain_cand["status"] == "chain_ambiguous"
    assert chain_cand["isChain"] is True
    assert chain_cand["extractedName"] == "Surf Coffee"
    assert len(chain_cand["branchCandidates"]) >= 2

    # Unmatched place -> not_found, place is None
    missing_res = client.post(
        "/links/resolve",
        json={"url": "https://www.instagram.com/reel/not-in-db-atlantis/"},
    )
    assert missing_res.status_code == 200
    missing_items = missing_res.json()
    assert len(missing_items) == 1
    missing_cand = missing_items[0]
    assert missing_cand["place"] is None
    assert missing_cand["matchStatus"] == "not_found"
    assert missing_cand["status"] == "not_found"


def test_resolve_extended_categories_museum_park_exhibition(tmp_path: Path) -> None:
    client, _ = _make_client(tmp_path)

    for slug, expected_raw_cat in (
        ("tretyakovka-museum", "museum"),
        ("gorky-park", "park"),
        ("vystavka-art", "exhibition"),
    ):
        res = client.post(
            "/links/resolve",
            json={"url": f"https://www.youtube.com/shorts/{slug}"},
        )
        assert res.status_code == 200
        items = res.json()
        assert len(items) == 1
        cand = items[0]
        assert cand["matchStatus"] == "exact"
        assert cand["rawCategory"] == expected_raw_cat
        assert cand["category"] == expected_raw_cat
        assert cand["place"] is not None
        # Core PlaceType compatibility for web frontend
        assert cand["place"]["type"] in {"coffee", "cafe", "rest", "bar"}
        assert cand["place"]["rawCategory"] == expected_raw_cat
        assert cand["place"]["hours"] is not None


def test_http_extraction_pipeline_contract_and_hours_from_db_only(tmp_path: Path) -> None:
    captured_requests: list[tuple[str, dict[str, str], dict[str, Any]]] = []

    def fake_sender(
        endpoint: str,
        headers: dict[str, str],
        body: bytes,
        _timeout: float,
    ) -> tuple[int, bytes]:
        parsed_body = json.loads(body.decode("utf-8"))
        captured_requests.append((endpoint, headers, parsed_body))
        response_payload = {
            "places": [
                {
                    "name": "Тихий двор",
                    "category": "coffee",
                    "address_or_metro": "Кривоколенный пер., 9",
                    "address_is_stated": True,
                    "evidence": "caption",
                    "evidence_quote": "Кофейня Тихий двор в Кривоколенном",
                    "is_chain": False,
                    "confidence": 0.91,
                }
            ],
            "no_place_reason": None,
        }
        return (200, json.dumps(response_payload).encode("utf-8"))

    http_pipe = HttpExtractionPipeline(
        service_url="http://extract.internal:8090",
        service_token="secret-test-token",  # noqa: S106
        sender=fake_sender,
    )
    client, _ = _make_client(tmp_path, pipeline=http_pipe)

    res = client.post(
        "/links/resolve",
        json={"url": "https://www.instagram.com/reel/tihiy-dvor-test/"},
    )
    assert res.status_code == 200
    assert len(captured_requests) == 1
    endpoint, headers, sent_body = captured_requests[0]
    assert endpoint == "http://extract.internal:8090/extract"
    assert headers["Authorization"] == "Bearer secret-test-token"
    assert sent_body["url"] == "https://instagram.com/reel/tihiy-dvor-test"

    data = res.json()
    assert len(data) == 1
    assert data[0]["place"]["id"] == "tihiy-dvor"
    # 'tihiy-dvor' has hours=None in DB; verify hours remain None from DB
    assert data[0]["place"]["hours"] is None


def test_resolve_with_postgis_matcher_when_configured(tmp_path: Path) -> None:
    dsn = "postgresql://where_is_hype:local-only@127.0.0.1:54329/where_is_hype_geo"

    class CustomPipe:
        def extract(self, url: str) -> ExtractionResponse:
            if "pushkin" in url:
                return ExtractionResponse(
                    places=[
                        ExtractedPlaceItem(
                            name="Кафе Пушкинъ",
                            category="cafe",
                            address_or_metro=None,
                            address_is_stated=False,
                            evidence="caption",
                            evidence_quote="Кафе Пушкинъ",
                            is_chain=True,
                            confidence=0.9,
                        )
                    ]
                )
            return ExtractionResponse(
                places=[
                    ExtractedPlaceItem(
                        name="Underdog",
                        category="bar",
                        address_or_metro="Маросейка",
                        address_is_stated=True,
                        evidence="caption",
                        evidence_quote="Underdog",
                        is_chain=False,
                        confidence=0.92,
                    )
                ]
            )

    client, _ = _make_client(tmp_path, pipeline=CustomPipe(), geo_database_url=dsn)

    chain_res = client.post("/links/resolve", json={"url": "https://t.me/test/1?q=pushkin"})
    assert chain_res.status_code == 200
    chain_data = chain_res.json()
    assert chain_data[0]["matchStatus"] == "chain_ambiguous"
    assert chain_data[0]["place"] is None

    exact_res = client.post("/links/resolve", json={"url": "https://t.me/test/2?q=underdog"})
    assert exact_res.status_code == 200
    exact_data = exact_res.json()
    if exact_data[0]["matchStatus"] in {"exact", "ambiguous"} and exact_data[0]["place"]:
        assert exact_data[0]["place"]["name"] == "Underdog"
        assert exact_data[0]["place"]["type"] == "bar"


def test_saved_places_crud_duplicates_and_visits(tmp_path: Path) -> None:
    client, _ = _make_client(tmp_path)

    saved_res = client.post(
        "/me/places",
        json={
            "placeId": "zhuk-i-pchela",
            "sourceUrl": DEMO_RECOGNIZED_LINK,
            "note": "раф с халвой",
        },
    )
    assert saved_res.status_code == 201
    saved = saved_res.json()
    assert saved["place"]["id"] == "zhuk-i-pchela"
    assert saved["sourcePlatform"] == "instagram"
    assert saved["note"] == "раф с халвой"

    # Duplicate by placeId -> 409
    dup_place = client.post("/me/places", json={"placeId": "zhuk-i-pchela"})
    assert dup_place.status_code == 409
    assert dup_place.json()["code"] == "ALREADY_SAVED"
    assert dup_place.json()["message"] == "Уже в твоих местах"

    # Duplicate by sourceUrl -> 409
    dup_url = client.post(
        "/me/places",
        json={"placeId": "pokrovka-coffee", "sourceUrl": DEMO_RECOGNIZED_LINK},
    )
    assert dup_url.status_code == 409
    assert dup_url.json()["code"] == "ALREADY_SAVED"

    # Note too long -> 400
    long_note = client.patch(
        "/me/places/zhuk-i-pchela",
        json={"note": "а" * 281},
    )
    assert long_note.status_code == 400
    assert long_note.json()["code"] == "NOTE_TOO_LONG"

    # Update note -> 200
    updated_note = client.patch(
        "/me/places/zhuk-i-pchela",
        json={"note": "новая заметка"},
    )
    assert updated_note.status_code == 200
    assert updated_note.json()["note"] == "новая заметка"

    # Mark visit within 200m -> verified True
    visit_res = client.post(
        "/me/places/zhuk-i-pchela/visits",
        json={"location": saved["place"]["location"]},
    )
    assert visit_res.status_code == 201
    visits = visit_res.json()["visits"]
    assert len(visits) == 1
    assert visits[0]["verified"] is True

    # Second visit on the same day -> 409
    dup_visit = client.post(
        "/me/places/zhuk-i-pchela/visits",
        json={"verified": True},
    )
    assert dup_visit.status_code == 409
    assert dup_visit.json()["code"] == "VISIT_ALREADY_MARKED_TODAY"

    # Patch visit expectation
    exp_res = client.patch(
        "/me/places/zhuk-i-pchela/visits",
        json={"expectation": "better", "comment": "Отличный фильтр"},
    )
    assert exp_res.status_code == 200
    assert exp_res.json()["visits"][0]["expectation"] == "better"
    assert exp_res.json()["visits"][0]["comment"] == "Отличный фильтр"

    # Delete place
    del_res = client.delete("/me/places/zhuk-i-pchela")
    assert del_res.status_code == 200
    assert del_res.json()["deletedId"] == "zhuk-i-pchela"

    after_del = client.get("/me/places")
    assert after_del.status_code == 200
    assert after_del.json() == []


def test_shortlist_sharing_and_voting(tmp_path: Path) -> None:
    client, _ = _make_client(tmp_path)

    empty = client.get("/me/shortlist")
    assert empty.status_code == 200
    assert empty.json()["places"] == []

    # Reject > 5 places
    too_many = client.put(
        "/me/shortlist",
        json={
            "placeIds": [
                "zhuk-i-pchela",
                "pokrovka-coffee",
                "zerno",
                "myata-na-kryshe",
                "sosny",
                "zhuravli",
            ]
        },
    )
    assert too_many.status_code == 400
    assert too_many.json()["code"] == "SHORTLIST_LIMIT_EXCEEDED"

    updated = client.put(
        "/me/shortlist",
        json={"placeIds": ["sosny", "zhuk-i-pchela", "myata-na-kryshe"]},
    )
    assert updated.status_code == 200
    assert len(updated.json()["places"]) == 3

    shared = client.post("/me/shortlist/share")
    assert shared.status_code == 200
    token = shared.json()["token"]
    assert token

    by_token = client.get(f"/s/{token}")
    assert by_token.status_code == 200
    assert len(by_token.json()["places"]) == 3

    # Unknown token -> 404
    missing = client.get("/s/nonexistent-token")
    assert missing.status_code == 404
    assert missing.json()["code"] == "SHORTLIST_NOT_FOUND"

    # First vote from friend
    vote1 = client.post(
        f"/s/{token}/votes",
        json={"name": "АК", "placeIds": ["sosny"]},
    )
    assert vote1.status_code == 200
    assert len(vote1.json()["votes"]) == 1
    assert vote1.json()["votes"][0]["placeIds"] == ["sosny"]
    assert vote1.json()["votes"][0]["name"] == "АК"

    # Second vote from same browser replaces previous vote
    vote2 = client.post(
        f"/s/{token}/votes",
        json={"name": "АК", "placeIds": ["zhuk-i-pchela", "myata-na-kryshe"]},
    )
    assert vote2.status_code == 200
    assert len(vote2.json()["votes"]) == 1
    assert vote2.json()["votes"][0]["placeIds"] == ["zhuk-i-pchela", "myata-na-kryshe"]

    # Second voter with distinct voterId adds a second vote without name (name key omitted)
    vote3 = client.post(
        f"/s/{token}/votes",
        json={"voterId": "voter-2", "placeIds": ["sosny"]},
    )
    assert vote3.status_code == 200
    assert len(vote3.json()["votes"]) == 2
    assert "name" not in vote3.json()["votes"][1]

    # Author sees both votes in /me/shortlist
    author_view = client.get("/me/shortlist")
    assert author_view.status_code == 200
    assert len(author_view.json()["votes"]) == 2


def test_demo_seed_reports_events_and_sqlite_persistence(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    db_path = tmp_path / "persistent.db"
    monkeypatch.setenv("DATABASE_PATH", str(db_path))

    client1 = TestClient(create_app())
    seeded = client1.post("/demo/seed")
    assert seeded.status_code == 200
    assert len(seeded.json()) == 8

    rep = client1.post(
        "/reports",
        json={"query": "Новое кафе на Покровке", "sourceUrl": DEMO_UNKNOWN_LINK},
    )
    assert rep.status_code == 201
    assert rep.json()["query"] == "Новое кафе на Покровке"
    assert rep.json()["id"].startswith("rep-")

    ev = client1.post(
        "/events",
        json={
            "event": "link_pasted",
            "anonymousId": "anon-123",
            "timestamp": "2026-11-08T20:00:00Z",
            "props": {"platform": "instagram"},
        },
    )
    assert ev.status_code == 201
    assert ev.json() == {"ok": True}

    # Recreate app from the same SQLite file and verify persistence
    client2 = TestClient(create_app())
    persisted_places = client2.get("/me/places")
    assert persisted_places.status_code == 200
    assert len(persisted_places.json()) == 8
