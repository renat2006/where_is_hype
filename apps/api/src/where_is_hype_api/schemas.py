from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_serializer, model_validator

PlaceType = Literal["coffee", "cafe", "rest", "bar"]
Platform = Literal["instagram", "tiktok", "vk", "telegram", "youtube", "other"]
VisitExpectation = Literal["better", "as_expected", "worse"]
MatchStatus = Literal["exact", "ambiguous", "chain_ambiguous", "not_found"]

MAX_NOTE_LENGTH = 280
MAX_VOTER_NAME_LENGTH = 80
SHORTLIST_MAX_PLACES = 5
SHORTLIST_TTL_DAYS = 7
VISIT_VERIFICATION_RADIUS_M = 200


class Location(BaseModel):
    model_config = ConfigDict(extra="ignore")

    lat: float = Field(ge=-90.0, le=90.0)
    lng: float = Field(ge=-180.0, le=180.0)

    @model_validator(mode="before")
    @classmethod
    def _accept_lon_alias(cls, data: Any) -> Any:
        if isinstance(data, dict) and "lng" not in data and "lon" in data:
            return {**data, "lng": data["lon"]}
        return data


class DayHours(BaseModel):
    open: str
    close: str


class WeeklyHours(BaseModel):
    mon: DayHours | None = None
    tue: DayHours | None = None
    wed: DayHours | None = None
    thu: DayHours | None = None
    fri: DayHours | None = None
    sat: DayHours | None = None
    sun: DayHours | None = None


class PlaceMetro(BaseModel):
    name: str = Field(min_length=1)
    distanceM: int = Field(ge=0)


class Place(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    type: PlaceType
    address: str = Field(min_length=1)
    metro: PlaceMetro
    location: Location
    hours: WeeklyHours | None = None
    avgCheck: int | None = None
    yandexOrgId: str | None = None
    rawCategory: str | None = None

    @model_serializer(mode="wrap")
    def _serialize(self, handler: Any) -> dict[str, Any]:
        result: dict[str, Any] = handler(self)
        if result.get("rawCategory") is None:
            result.pop("rawCategory", None)
        return result


class Visit(BaseModel):
    at: str = Field(min_length=1)
    verified: bool
    expectation: VisitExpectation | None = None
    comment: str | None = None


class SavedPlace(BaseModel):
    place: Place
    sourceUrl: str | None = None
    sourcePlatform: Platform = "other"
    note: str = ""
    addedAt: str = Field(min_length=1)
    visits: list[Visit] = Field(default_factory=list)


class Candidate(BaseModel):
    place: Place | None = None
    confidence: float = Field(ge=0.0, le=1.0)
    matchStatus: MatchStatus = "exact"
    status: MatchStatus = "exact"
    rawCategory: str | None = None
    category: str | None = None
    extractedName: str | None = None
    isChain: bool = False
    addressOrMetro: str | None = None
    evidence: str | None = None
    evidenceQuote: str | None = None
    reason: str | None = None
    branchCandidates: list[Place] | None = None

    @model_serializer(mode="wrap")
    def _serialize(self, handler: Any) -> dict[str, Any]:
        result: dict[str, Any] = handler(self)
        for optional_key in (
            "rawCategory",
            "category",
            "extractedName",
            "addressOrMetro",
            "evidence",
            "evidenceQuote",
            "reason",
            "branchCandidates",
        ):
            if result.get(optional_key) is None:
                result.pop(optional_key, None)
        return result


class Vote(BaseModel):
    voterId: str = Field(min_length=1)
    name: str | None = None
    placeIds: list[str] = Field(default_factory=list)

    @model_serializer(mode="wrap")
    def _serialize(self, handler: Any) -> dict[str, Any]:
        result: dict[str, Any] = handler(self)
        if result.get("name") is None:
            result.pop("name", None)
        return result


class Shortlist(BaseModel):
    token: str = Field(min_length=1)
    places: list[Place] = Field(default_factory=list)
    createdAt: str = Field(min_length=1)
    expiresAt: str = Field(min_length=1)
    votes: list[Vote] = Field(default_factory=list)


class SessionModel(BaseModel):
    id: str = Field(min_length=1)
    createdAt: str = Field(min_length=1)


class ReportResponse(BaseModel):
    id: str = Field(min_length=1)
    query: str = Field(min_length=1)
    sourceUrl: str | None = None
    createdAt: str = Field(min_length=1)


class ExtractedPlaceItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str
    category: str = "cafe"
    address_or_metro: str | None = None
    address_is_stated: bool = False
    evidence: str | None = None
    evidence_quote: str | None = None
    is_chain: bool = False
    confidence: float = Field(default=0.8, ge=0.0, le=1.0)


class ExtractionResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    places: list[ExtractedPlaceItem] = Field(default_factory=list)
    no_place_reason: str | None = None
