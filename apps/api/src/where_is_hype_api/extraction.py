from __future__ import annotations

import json
import urllib.error
import urllib.request
from collections.abc import Callable
from typing import Protocol

from where_is_hype_api.domain import fnv1a_hash, normalize_link_for_compare
from where_is_hype_api.fixtures import (
    DEMO_RECOGNIZED_LINK,
    DEMO_UNKNOWN_LINK,
    PLACES_BY_ID,
    PLACES_FIXTURE,
)
from where_is_hype_api.schemas import ExtractedPlaceItem, ExtractionResponse, Place

HttpSender = Callable[[str, dict[str, str], bytes, float], tuple[int, bytes]]


class ExtractionPipeline(Protocol):
    """Interface for extracting place mentions from a video/post URL."""

    def extract(self, url: str) -> ExtractionResponse: ...


def _place_to_extracted(place: Place, confidence: float) -> ExtractedPlaceItem:
    return ExtractedPlaceItem(
        name=place.name,
        category=place.rawCategory or place.type,
        address_or_metro=f"{place.address}, м. {place.metro.name}",
        address_is_stated=True,
        evidence="caption",
        evidence_quote=f"{place.name}, {place.address}",
        is_chain=False,
        confidence=confidence,
    )


class FakeExtractionPipeline:
    """Deterministic fake ExtractionPipeline compatible with web prototype mocks."""

    def __init__(self) -> None:
        self.calls: list[str] = []

    @property
    def call_count(self) -> int:
        return len(self.calls)

    def extract(self, url: str) -> ExtractionResponse:  # noqa: PLR0911, PLR0912
        self.calls.append(url)
        normalized = normalize_link_for_compare(url)
        norm_recognized = normalize_link_for_compare(DEMO_RECOGNIZED_LINK)
        norm_unknown = normalize_link_for_compare(DEMO_UNKNOWN_LINK)

        if (
            normalized == norm_unknown
            or "private" in normalized
            or "unknown-place" in normalized
            or "/unknown" in normalized
            or "closed" in normalized
            or "deleted" in normalized
            or "unavailable" in normalized
        ):
            return ExtractionResponse(places=[], no_place_reason="private_or_unavailable")

        if normalized == norm_recognized or "hype-coffee" in normalized:
            items: list[ExtractedPlaceItem] = []
            for pid, conf in (
                ("zhuk-i-pchela", 0.95),
                ("pokrovka-coffee", 0.72),
                ("zerno", 0.48),
            ):
                if pid in PLACES_BY_ID:
                    items.append(_place_to_extracted(PLACES_BY_ID[pid], conf))
            return ExtractionResponse(places=items, no_place_reason=None)

        if "zs8kq2plm" in normalized:
            items = []
            for pid, conf in (
                ("sosny", 0.94),
                ("sosny-pekarnya", 0.68),
                ("zhuk-i-pchela", 0.41),
            ):
                if pid in PLACES_BY_ID:
                    items.append(_place_to_extracted(PLACES_BY_ID[pid], conf))
            return ExtractionResponse(places=items, no_place_reason=None)

        if any(
            kw in normalized
            for kw in ("chain-no-address", "surf-coffee", "pims", "starbucks", "chain-ambiguous")
        ):
            chain_name = "Pims" if "pims" in normalized else "Surf Coffee"
            return ExtractionResponse(
                places=[
                    ExtractedPlaceItem(
                        name=chain_name,
                        category="coffee",
                        address_or_metro=None,
                        address_is_stated=False,
                        evidence="frame",
                        evidence_quote=chain_name,
                        is_chain=True,
                        confidence=0.86,
                    )
                ],
                no_place_reason=None,
            )

        if "pushkin-no-address" in normalized:
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
                        confidence=0.89,
                    )
                ],
                no_place_reason=None,
            )

        if any(kw in normalized for kw in ("not-in-db", "nonexistent", "atlantis")):
            return ExtractionResponse(
                places=[
                    ExtractedPlaceItem(
                        name="Несуществующее Кафе Атлантида 999",
                        category="cafe",
                        address_or_metro=None,
                        address_is_stated=False,
                        evidence="audio",
                        evidence_quote="Кафе Атлантида",
                        is_chain=False,
                        confidence=0.75,
                    )
                ],
                no_place_reason=None,
            )

        if any(kw in normalized for kw in ("park", "gorky-park")):
            return ExtractionResponse(
                places=[
                    ExtractedPlaceItem(
                        name="Парк Горького",
                        category="park",
                        address_or_metro="ул. Крымский Вал, 9, м. Парк культуры",
                        address_is_stated=True,
                        evidence="caption",
                        evidence_quote="Прогулка в Парке Горького",
                        is_chain=False,
                        confidence=0.92,
                    )
                ],
                no_place_reason=None,
            )

        if any(kw in normalized for kw in ("exhibition", "vystavka")):
            return ExtractionResponse(
                places=[
                    ExtractedPlaceItem(
                        name="Третьяковская галерея",
                        category="exhibition",
                        address_or_metro="Лаврушинский пер., 10, м. Третьяковская",
                        address_is_stated=True,
                        evidence="caption",
                        evidence_quote="Новая выставка в Третьяковской галерее",
                        is_chain=False,
                        confidence=0.90,
                    )
                ],
                no_place_reason=None,
            )

        if any(kw in normalized for kw in ("museum", "tretyakovka", "gallery")):
            return ExtractionResponse(
                places=[
                    ExtractedPlaceItem(
                        name="Третьяковская галерея",
                        category="museum",
                        address_or_metro="Лаврушинский пер., 10, м. Третьяковская",
                        address_is_stated=True,
                        evidence="caption",
                        evidence_quote="Третьяковская галерея в Лаврушинском переулке",
                        is_chain=False,
                        confidence=0.93,
                    )
                ],
                no_place_reason=None,
            )

        if any(kw in normalized for kw in ("compilation", "podborka", "top-3", "top3")):
            return ExtractionResponse(
                places=[
                    _place_to_extracted(PLACES_BY_ID["zhuk-i-pchela"], 0.94),
                    _place_to_extracted(PLACES_BY_ID["zhuravli"], 0.87),
                    _place_to_extracted(PLACES_BY_ID["sosny"], 0.82),
                ],
                no_place_reason=None,
            )

        total = len(PLACES_FIXTURE)
        if total == 0:
            return ExtractionResponse(places=[], no_place_reason="empty_catalog")

        h = fnv1a_hash(normalized)
        selected: list[Place] = []

        for place in PLACES_FIXTURE:
            if place.id in normalized:
                selected.append(place)
                break

        for offset in (0, 7, 19, 31):
            if len(selected) >= 3:
                break
            cand = PLACES_FIXTURE[(h + offset) % total]
            if all(item.id != cand.id for item in selected):
                selected.append(cand)

        confidences = (0.91, 0.64, 0.39)
        return ExtractionResponse(
            places=[
                _place_to_extracted(place, confidences[idx] if idx < len(confidences) else 0.35)
                for idx, place in enumerate(selected[:3])
            ],
            no_place_reason=None,
        )


def _default_http_sender(
    endpoint: str,
    headers: dict[str, str],
    body: bytes,
    timeout_sec: float,
) -> tuple[int, bytes]:
    if not endpoint.startswith(("http://", "https://")):
        raise ValueError(f"Unsupported URL scheme in endpoint: {endpoint}")
    req = urllib.request.Request(endpoint, data=body, headers=headers, method="POST")  # noqa: S310
    try:
        with urllib.request.urlopen(req, timeout=timeout_sec) as resp:  # noqa: S310
            status = int(getattr(resp, "status", 200))
            return (status, resp.read())
    except urllib.error.HTTPError as exc:
        return (int(exc.code), exc.read())


class HttpExtractionPipeline:
    """HTTP client implementation calling POST {EXTRACT_SERVICE_URL}/extract."""

    def __init__(
        self,
        service_url: str,
        service_token: str = "",
        *,
        timeout_sec: float = 15.0,
        sender: HttpSender | None = None,
    ) -> None:
        self._service_url = service_url.rstrip("/")
        self._service_token = service_token
        self._timeout_sec = timeout_sec
        self._sender = sender or _default_http_sender

    def extract(self, url: str) -> ExtractionResponse:
        endpoint = f"{self._service_url}/extract"
        headers: dict[str, str] = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": f"Bearer {self._service_token}",
        }
        payload = json.dumps({"url": url}).encode("utf-8")
        try:
            status_code, raw_bytes = self._sender(endpoint, headers, payload, self._timeout_sec)
        except Exception:
            return ExtractionResponse(places=[], no_place_reason="extract_service_unreachable")

        if status_code >= 400:
            return ExtractionResponse(
                places=[],
                no_place_reason=f"extract_service_http_{status_code}",
            )

        try:
            parsed = json.loads(raw_bytes.decode("utf-8"))
            return ExtractionResponse.model_validate(parsed)
        except Exception:
            return ExtractionResponse(places=[], no_place_reason="invalid_extract_response")
