"""Tests for Pydantic models and strict coordinate exclusion."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from extractlab.models import ExtractedPlace, Extraction


def test_extracted_place_and_extraction_valid() -> None:
    place = ExtractedPlace(
        name="Полдень",
        aliases=["Polden Cafe"],
        category="cafe",
        address_raw="Чистопрудный бульвар, 12с2",
        metro_hint="Чистые пруды",
        landmark_hint="Чистые пруды",
        city="Москва",
        evidence="speech",
        quote="Зашли в кафе Полдень на Чистых прудах",
        timecode_sec=3.5,
        confidence=0.95,
    )
    extraction = Extraction(
        items=[place],
        video_has_multiple_places=False,
        resolution_hint="exact",
        notes="Одно место с адресом.",
    )
    assert len(extraction.items) == 1
    assert extraction.items[0].name == "Полдень"
    assert extraction.items[0].evidence == "speech"
    assert extraction.items[0].confidence == 0.95


def test_models_do_not_expose_or_accept_coordinates() -> None:
    place_schema = ExtractedPlace.model_json_schema()
    extraction_schema = Extraction.model_json_schema()

    forbidden_coord_keys = {"lat", "lon", "lng", "latitude", "longitude", "coordinates", "geom"}
    assert forbidden_coord_keys.isdisjoint(place_schema.get("properties", {}).keys())
    assert forbidden_coord_keys.isdisjoint(extraction_schema.get("properties", {}).keys())

    with pytest.raises(ValidationError):
        ExtractedPlace.model_validate(
            {
                "name": "Underdog",
                "lat": 55.757,
                "lon": 37.636,
            }
        )


def test_confidence_bounds_and_evidence_enum() -> None:
    with pytest.raises(ValidationError):
        ExtractedPlace(name="Бар", confidence=1.2)

    with pytest.raises(ValidationError):
        ExtractedPlace(name="Бар", confidence=-0.1)

    with pytest.raises(ValidationError):
        ExtractedPlace.model_validate({"name": "Бар", "evidence": "telepathy"})
