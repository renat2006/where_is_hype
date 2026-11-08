from typing import Literal

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_CORS_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:4700",
    "http://localhost:4701",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:4700",
    "http://127.0.0.1:4701",
]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="API_", env_file=".env", extra="ignore")

    environment: str = Field(
        default="local",
        validation_alias=AliasChoices("API_ENVIRONMENT", "ENVIRONMENT"),
    )
    cors_origins: list[str] = Field(
        default_factory=lambda: list(DEFAULT_CORS_ORIGINS),
        validation_alias=AliasChoices("API_CORS_ORIGINS", "CORS_ORIGINS"),
    )
    database_path: str = Field(
        default="where_is_hype.db",
        validation_alias=AliasChoices("DATABASE_PATH", "API_DATABASE_PATH"),
    )
    extraction_mode: Literal["fake", "http"] = Field(
        default="fake",
        validation_alias=AliasChoices("EXTRACTION_MODE", "API_EXTRACTION_MODE"),
    )
    extract_service_url: str = Field(
        default="http://127.0.0.1:8090",
        validation_alias=AliasChoices("EXTRACT_SERVICE_URL", "API_EXTRACT_SERVICE_URL"),
    )
    extract_service_token: str = Field(
        default="",
        validation_alias=AliasChoices("EXTRACT_SERVICE_TOKEN", "API_EXTRACT_SERVICE_TOKEN"),
    )
    geo_database_url: str | None = Field(
        default=None,
        validation_alias=AliasChoices("GEO_DATABASE_URL", "API_GEO_DATABASE_URL"),
    )
    demo_disabled: bool = Field(
        default=False,
        validation_alias=AliasChoices("DEMO_DISABLED", "API_DEMO_DISABLED"),
    )


def get_settings() -> Settings:
    return Settings()
