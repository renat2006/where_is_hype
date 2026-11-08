from __future__ import annotations

from typing import Any, cast

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from where_is_hype_api.config import Settings
from where_is_hype_api.domain import (
    canonicalize_link,
    detect_platform,
    distance_m,
    ensure_valid_url_or_null,
    get_moscow_date_key,
    is_shortlist_expired,
    normalize_link_for_compare,
    now_iso,
    search_places,
    upsert_vote,
)
from where_is_hype_api.extraction import ExtractionPipeline
from where_is_hype_api.fixtures import DEMO_SEED_PLACES_FIXTURE
from where_is_hype_api.matcher_adapter import match_extracted_place
from where_is_hype_api.schemas import (
    MAX_NOTE_LENGTH,
    MAX_VOTER_NAME_LENGTH,
    SHORTLIST_MAX_PLACES,
    VISIT_VERIFICATION_RADIUS_M,
    Location,
    Place,
    SavedPlace,
    Shortlist,
    Visit,
    VisitExpectation,
    Vote,
)
from where_is_hype_api.storage import SqliteStorage

router = APIRouter()


def _get_storage(request: Request) -> SqliteStorage:
    return cast(SqliteStorage, request.app.state.storage)


def _get_pipeline(request: Request) -> ExtractionPipeline:
    return cast(ExtractionPipeline, request.app.state.extraction_pipeline)


def _get_settings(request: Request) -> Settings:
    return cast(Settings, request.app.state.settings)


def _extract_session_id(request: Request) -> str | None:
    for header_name in ("x-session-id", "x-anonymous-id"):
        val = request.headers.get(header_name)
        if val and val.strip():
            return val.strip()

    auth = request.headers.get("authorization")
    if auth and auth.lower().startswith("bearer "):
        token = auth[7:].strip()
        if token:
            return token

    for cookie_name in ("session_id", "where_is_hype_session"):
        cookie_val = request.cookies.get(cookie_name)
        if cookie_val and cookie_val.strip():
            return cookie_val.strip()

    return None


async def _read_json_body(request: Request) -> dict[str, Any]:
    try:
        parsed = await request.json()
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


@router.get("/me")
async def get_me(request: Request) -> JSONResponse:
    storage = _get_storage(request)
    session_id = _extract_session_id(request)
    session = storage.get_session(session_id)
    return JSONResponse(
        content=session.model_dump() if session is not None else None,
        status_code=200,
    )


@router.post("/me")
async def post_me(request: Request) -> JSONResponse:
    storage = _get_storage(request)
    session_id = _extract_session_id(request)
    session, created = storage.get_or_create_session(session_id)
    response = JSONResponse(
        content=session.model_dump(),
        status_code=201 if created else 200,
    )
    response.set_cookie(
        key="session_id",
        value=session.id,
        path="/",
        httponly=True,
        samesite="lax",
    )
    return response


@router.get("/places/search")
async def search_places_route(request: Request, q: str = "") -> JSONResponse:
    storage = _get_storage(request)
    places = storage.list_places()
    results = search_places(places, q)
    return JSONResponse(content=[p.model_dump() for p in results], status_code=200)


@router.get("/places")
async def list_places_route(request: Request) -> JSONResponse:
    storage = _get_storage(request)
    places = storage.list_places()
    return JSONResponse(content=[p.model_dump() for p in places], status_code=200)


@router.post("/links/resolve")
async def resolve_link_route(request: Request) -> JSONResponse:
    body = await _read_json_body(request)
    url_val = body.get("url")
    raw_url: str = url_val if isinstance(url_val, str) else ""

    canon = canonicalize_link(raw_url)
    if canon is None:
        return JSONResponse(
            content=[],
            status_code=200,
            headers={"X-Resolve-Status": "invalid_url"},
        )

    canonical_key, canonical_url = canon
    storage = _get_storage(request)

    cached = storage.get_cached_resolution(canonical_key)
    if cached is not None:
        return JSONResponse(
            content=[c.model_dump() for c in cached],
            status_code=200,
            headers={"X-Cache": "HIT", "X-Canonical-Key": canonical_key},
        )

    pipeline = _get_pipeline(request)
    settings = _get_settings(request)
    extraction = pipeline.extract(canonical_url)

    if extraction.no_place_reason or not extraction.places:
        storage.set_cached_resolution(canonical_key, canonical_url, [])
        return JSONResponse(
            content=[],
            status_code=200,
            headers={
                "X-Cache": "MISS",
                "X-Canonical-Key": canonical_key,
                "X-No-Place-Reason": extraction.no_place_reason or "no_places",
            },
        )

    candidates = [
        match_extracted_place(
            item,
            storage,
            geo_database_url=settings.geo_database_url,
        )
        for item in extraction.places
    ]
    storage.set_cached_resolution(canonical_key, canonical_url, candidates)

    return JSONResponse(
        content=[c.model_dump() for c in candidates],
        status_code=200,
        headers={"X-Cache": "MISS", "X-Canonical-Key": canonical_key},
    )


@router.get("/me/places")
async def get_my_places(request: Request) -> JSONResponse:
    storage = _get_storage(request)
    bucket = storage.resolve_bucket_key(_extract_session_id(request))
    saved = storage.list_saved_places(bucket)
    return JSONResponse(content=[s.model_dump() for s in saved], status_code=200)


@router.post("/me/places")
async def save_my_place(request: Request) -> JSONResponse:
    storage = _get_storage(request)
    bucket = storage.resolve_bucket_key(_extract_session_id(request))
    body = await _read_json_body(request)

    target_place: Place | None = None
    place_id_raw = body.get("placeId")
    place_obj_raw = body.get("place")

    if isinstance(place_id_raw, str) and place_id_raw:
        target_place = storage.get_place(place_id_raw)
    elif isinstance(place_obj_raw, dict):
        try:
            parsed_place = Place.model_validate(place_obj_raw)
            target_place = storage.get_place(parsed_place.id) or parsed_place
        except Exception:
            target_place = None

    if target_place is None:
        return JSONResponse(
            content={"message": "Место не найдено в базе", "code": "PLACE_NOT_FOUND"},
            status_code=404,
        )

    raw_source_url = body.get("sourceUrl") if isinstance(body.get("sourceUrl"), str) else None
    source_url = ensure_valid_url_or_null(raw_source_url)
    norm_incoming_url = normalize_link_for_compare(source_url) if source_url else None

    existing = storage.find_duplicate_saved_place(bucket, target_place.id, norm_incoming_url)
    if existing is not None:
        return JSONResponse(
            content={
                "message": "Уже в твоих местах",
                "code": "ALREADY_SAVED",
                "placeId": existing.place.id,
                "savedPlace": existing.model_dump(),
            },
            status_code=409,
        )

    note_val = body.get("note")
    raw_note: str = note_val if isinstance(note_val, str) else ""
    if len(raw_note) > MAX_NOTE_LENGTH:
        return JSONResponse(
            content={"message": "Заметка не длиннее 280 символов", "code": "NOTE_TOO_LONG"},
            status_code=400,
        )

    visits: list[Visit] = []
    if isinstance(body.get("visits"), list):
        try:
            visits = [Visit.model_validate(v) for v in body["visits"]]
        except Exception:
            visits = []

    added_at = (
        body["addedAt"] if isinstance(body.get("addedAt"), str) and body["addedAt"] else now_iso()
    )
    saved_place = SavedPlace(
        place=target_place,
        sourceUrl=source_url,
        sourcePlatform=detect_platform(source_url) if source_url else "other",
        note=raw_note,
        addedAt=added_at,
        visits=visits,
    )
    storage.insert_saved_place(bucket, saved_place, prepend=True)
    return JSONResponse(content=saved_place.model_dump(), status_code=201)


@router.post("/me/places/{place_id}/visits")
async def mark_place_visit(request: Request, place_id: str) -> JSONResponse:
    storage = _get_storage(request)
    bucket = storage.resolve_bucket_key(_extract_session_id(request))
    body = await _read_json_body(request)

    saved_list = storage.list_saved_places(bucket)
    current = next((item for item in saved_list if item.place.id == place_id), None)
    if current is None:
        return JSONResponse(
            content={"message": "Место не найдено в сохранённых", "code": "SAVED_PLACE_NOT_FOUND"},
            status_code=404,
        )

    now_str = now_iso()
    today_key = get_moscow_date_key(now_str)
    if any(get_moscow_date_key(v.at) == today_key for v in current.visits):
        return JSONResponse(
            content={
                "message": "Не больше одного визита в место за день",
                "code": "VISIT_ALREADY_MARKED_TODAY",
                "placeId": place_id,
            },
            status_code=409,
        )

    verified = False
    if isinstance(body.get("verified"), bool):
        verified = body["verified"]
    elif isinstance(body.get("location"), dict):
        try:
            loc = Location.model_validate(body["location"])
            verified = distance_m(loc, current.place.location) <= VISIT_VERIFICATION_RADIUS_M
        except Exception:
            verified = False

    raw_exp = body.get("expectation")
    expectation: VisitExpectation | None = (
        cast(VisitExpectation, raw_exp) if raw_exp in {"better", "as_expected", "worse"} else None
    )
    comment = body["comment"][:MAX_NOTE_LENGTH] if isinstance(body.get("comment"), str) else None

    visit = Visit(
        at=now_str,
        verified=verified,
        expectation=expectation,
        comment=comment,
    )
    updated = current.model_copy(update={"visits": [*current.visits, visit]})
    storage.update_saved_place(bucket, updated)
    return JSONResponse(content=updated.model_dump(), status_code=201)


@router.patch("/me/places/{place_id}/visits")
async def patch_place_visit(request: Request, place_id: str) -> JSONResponse:
    storage = _get_storage(request)
    bucket = storage.resolve_bucket_key(_extract_session_id(request))
    body = await _read_json_body(request)

    saved_list = storage.list_saved_places(bucket)
    current = next((item for item in saved_list if item.place.id == place_id), None)
    if current is None:
        return JSONResponse(
            content={"message": "Место не найдено в сохранённых", "code": "SAVED_PLACE_NOT_FOUND"},
            status_code=404,
        )

    if not current.visits:
        return JSONResponse(
            content={"message": "Визит ещё не отмечен", "code": "VISIT_NOT_FOUND"},
            status_code=400,
        )

    raw_exp = body.get("expectation", None)
    if raw_exp is not None and raw_exp not in {"better", "as_expected", "worse"}:
        return JSONResponse(
            content={"message": "Некорректное значение ожиданий", "code": "INVALID_EXPECTATION"},
            status_code=400,
        )

    last_visit = current.visits[-1]
    next_comment = (
        (body["comment"][:MAX_NOTE_LENGTH] if isinstance(body.get("comment"), str) else None)
        if "comment" in body
        else last_visit.comment
    )
    updated_visit = last_visit.model_copy(
        update={
            "expectation": cast(VisitExpectation | None, raw_exp),
            "comment": next_comment,
        }
    )
    updated = current.model_copy(update={"visits": [*current.visits[:-1], updated_visit]})
    storage.update_saved_place(bucket, updated)
    return JSONResponse(content=updated.model_dump(), status_code=200)


@router.patch("/me/places/{place_id}")
async def patch_saved_place(request: Request, place_id: str) -> JSONResponse:
    storage = _get_storage(request)
    bucket = storage.resolve_bucket_key(_extract_session_id(request))
    body = await _read_json_body(request)

    saved_list = storage.list_saved_places(bucket)
    current = next((item for item in saved_list if item.place.id == place_id), None)
    if current is None:
        return JSONResponse(
            content={"message": "Место не найдено в сохранённых", "code": "SAVED_PLACE_NOT_FOUND"},
            status_code=404,
        )

    next_note = current.note
    if isinstance(body.get("note"), str):
        if len(body["note"]) > MAX_NOTE_LENGTH:
            return JSONResponse(
                content={"message": "Заметка не длиннее 280 символов", "code": "NOTE_TOO_LONG"},
                status_code=400,
            )
        next_note = body["note"]

    updated = current.model_copy(update={"note": next_note})
    storage.update_saved_place(bucket, updated)
    return JSONResponse(content=updated.model_dump(), status_code=200)


@router.delete("/me/places/{place_id}")
async def delete_saved_place_route(request: Request, place_id: str) -> JSONResponse:
    storage = _get_storage(request)
    bucket = storage.resolve_bucket_key(_extract_session_id(request))
    deleted = storage.delete_saved_place(bucket, place_id)
    if deleted is None:
        return JSONResponse(
            content={"message": "Место не найдено в сохранённых", "code": "SAVED_PLACE_NOT_FOUND"},
            status_code=404,
        )
    return JSONResponse(
        content={"deletedId": place_id, "savedPlace": deleted.model_dump()},
        status_code=200,
    )


@router.get("/me/shortlist")
async def get_my_shortlist_route(request: Request) -> JSONResponse:
    storage = _get_storage(request)
    bucket = storage.resolve_bucket_key(_extract_session_id(request))
    shortlist = storage.ensure_shortlist(bucket)
    return JSONResponse(content=shortlist.model_dump(), status_code=200)


@router.put("/me/shortlist")
async def put_my_shortlist_route(request: Request) -> JSONResponse:
    storage = _get_storage(request)
    bucket = storage.resolve_bucket_key(_extract_session_id(request))
    body = await _read_json_body(request)
    current = storage.ensure_shortlist(bucket)

    place_ids: list[str] = []
    if isinstance(body.get("placeIds"), list):
        place_ids = [item for item in body["placeIds"] if isinstance(item, str) and len(item) > 0]
    elif isinstance(body.get("places"), list):
        place_ids = [
            item["id"]
            for item in body["places"]
            if isinstance(item, dict) and isinstance(item.get("id"), str) and len(item["id"]) > 0
        ]

    unique_place_ids = list(dict.fromkeys(place_ids))
    if len(unique_place_ids) > SHORTLIST_MAX_PLACES:
        return JSONResponse(
            content={"message": "Уже 5 мест", "code": "SHORTLIST_LIMIT_EXCEEDED"},
            status_code=400,
        )

    saved_by_id = {item.place.id: item.place for item in storage.list_saved_places(bucket)}
    resolved_places: list[Place] = []
    for pid in unique_place_ids:
        found = saved_by_id.get(pid) or storage.get_place(pid)
        if found is not None:
            resolved_places.append(found)

    valid_ids = {p.id for p in resolved_places}
    filtered_votes: list[Vote] = []
    for vote in current.votes:
        kept_ids = [pid for pid in vote.placeIds if pid in valid_ids]
        if kept_ids:
            filtered_votes.append(vote.model_copy(update={"placeIds": kept_ids}))

    updated = Shortlist(
        token=current.token,
        places=resolved_places,
        createdAt=current.createdAt,
        expiresAt=current.expiresAt,
        votes=filtered_votes,
    )
    storage.save_shortlist(bucket, updated)
    return JSONResponse(content=updated.model_dump(), status_code=200)


@router.post("/me/shortlist/share")
async def share_my_shortlist_route(request: Request) -> JSONResponse:
    storage = _get_storage(request)
    bucket = storage.resolve_bucket_key(_extract_session_id(request))
    shared = storage.share_shortlist(bucket)
    return JSONResponse(content=shared.model_dump(), status_code=200)


@router.get("/s/{token}")
async def get_shared_shortlist_route(request: Request, token: str) -> JSONResponse:
    storage = _get_storage(request)
    shortlist = storage.get_shared_shortlist(token)
    if shortlist is None:
        return JSONResponse(
            content={"message": "Подборка не найдена", "code": "SHORTLIST_NOT_FOUND"},
            status_code=404,
        )

    if is_shortlist_expired(shortlist.expiresAt):
        return JSONResponse(
            content={"message": "Ссылка устарела", "code": "SHORTLIST_EXPIRED"},
            status_code=410,
        )

    return JSONResponse(content=shortlist.model_dump(), status_code=200)


@router.post("/s/{token}/votes")
async def submit_vote_route(request: Request, token: str) -> JSONResponse:
    storage = _get_storage(request)
    shortlist = storage.get_shared_shortlist(token)
    if shortlist is None:
        return JSONResponse(
            content={"message": "Подборка не найдена", "code": "SHORTLIST_NOT_FOUND"},
            status_code=404,
        )

    if is_shortlist_expired(shortlist.expiresAt):
        return JSONResponse(
            content={"message": "Ссылка устарела", "code": "SHORTLIST_EXPIRED"},
            status_code=410,
        )

    body = await _read_json_body(request)
    raw_voter_id = body.get("voterId")
    voter_id = (
        raw_voter_id.strip()
        if isinstance(raw_voter_id, str) and raw_voter_id.strip()
        else (
            request.headers.get("x-voter-id", "").strip()
            or request.cookies.get("voter_id", "").strip()
            or _extract_session_id(request)
            or "voter-anon"
        )
    )

    raw_place_ids: list[str] = []
    if isinstance(body.get("placeIds"), list):
        raw_place_ids = [item for item in body["placeIds"] if isinstance(item, str)]
    elif isinstance(body.get("placeId"), str):
        raw_place_ids = [body["placeId"]]

    valid_place_ids = {p.id for p in shortlist.places}
    place_ids = list(dict.fromkeys(pid for pid in raw_place_ids if pid in valid_place_ids))

    raw_name = body.get("name")
    name = (
        raw_name.strip()[:MAX_VOTER_NAME_LENGTH]
        if isinstance(raw_name, str) and raw_name.strip()
        else None
    )

    next_vote = Vote(voterId=voter_id, name=name, placeIds=place_ids)
    updated = Shortlist(
        token=shortlist.token,
        places=shortlist.places,
        createdAt=shortlist.createdAt,
        expiresAt=shortlist.expiresAt,
        votes=upsert_vote(shortlist.votes, next_vote),
    )
    storage.save_shared_shortlist(token, updated)

    response = JSONResponse(content=updated.model_dump(), status_code=200)
    response.set_cookie(
        key="voter_id",
        value=voter_id,
        path="/",
        httponly=True,
        samesite="lax",
    )
    return response


@router.post("/demo/seed")
async def demo_seed_route(request: Request) -> JSONResponse:
    settings = _get_settings(request)
    if settings.demo_disabled:
        return JSONResponse(
            content={
                "message": "Демо-данные доступны только в режиме моков",
                "code": "DEMO_DISABLED",
            },
            status_code=403,
        )

    storage = _get_storage(request)
    bucket = storage.resolve_bucket_key(_extract_session_id(request))
    existing = storage.list_saved_places(bucket)
    existing_ids = {item.place.id for item in existing}

    for item in DEMO_SEED_PLACES_FIXTURE:
        if item.place.id not in existing_ids:
            storage.insert_saved_place(bucket, item, prepend=False)

    updated = storage.list_saved_places(bucket)
    return JSONResponse(content=[s.model_dump() for s in updated], status_code=200)


@router.post("/reports")
async def create_report_route(request: Request) -> JSONResponse:
    storage = _get_storage(request)
    bucket = storage.resolve_bucket_key(_extract_session_id(request))
    body = await _read_json_body(request)

    raw_query = (
        body["query"]
        if isinstance(body.get("query"), str)
        else (body["name"] if isinstance(body.get("name"), str) else "Неизвестное место")
    )
    query = raw_query.strip() or "Неизвестное место"
    source_url = body.get("sourceUrl") if isinstance(body.get("sourceUrl"), str) else None
    comment = body["comment"][:MAX_NOTE_LENGTH] if isinstance(body.get("comment"), str) else None

    report = storage.create_report(bucket, query, source_url, comment)
    return JSONResponse(content=report.model_dump(), status_code=201)


@router.post("/events")
async def create_event_route(request: Request) -> JSONResponse:
    storage = _get_storage(request)
    bucket = storage.resolve_bucket_key(_extract_session_id(request))
    body = await _read_json_body(request)

    raw_event = body.get("event")
    if isinstance(raw_event, str) and raw_event.strip():
        anon_id = body.get("anonymousId") if isinstance(body.get("anonymousId"), str) else None
        timestamp = body.get("timestamp") if isinstance(body.get("timestamp"), str) else None
        props = body.get("props") if isinstance(body.get("props"), dict) else None
        storage.create_event(bucket, raw_event.strip(), anon_id, timestamp, props)

    return JSONResponse(content={"ok": True}, status_code=201)
