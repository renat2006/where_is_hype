from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from where_is_hype_api.config import Settings, get_settings
from where_is_hype_api.extraction import (
    ExtractionPipeline,
    FakeExtractionPipeline,
    HttpExtractionPipeline,
)
from where_is_hype_api.routes import api, health
from where_is_hype_api.storage import SqliteStorage


def _build_default_pipeline(settings: Settings) -> ExtractionPipeline:
    if settings.extraction_mode == "http":
        return HttpExtractionPipeline(
            service_url=settings.extract_service_url,
            service_token=settings.extract_service_token,
        )
    return FakeExtractionPipeline()


def create_app(
    settings: Settings | None = None,
    *,
    extraction_pipeline: ExtractionPipeline | None = None,
    storage: SqliteStorage | None = None,
) -> FastAPI:
    effective_settings = settings or get_settings()
    app = FastAPI(title="Где Хайп? API", version="0.1.0")

    app.state.settings = effective_settings
    app.state.storage = storage or SqliteStorage(effective_settings.database_path)
    app.state.extraction_pipeline = extraction_pipeline or _build_default_pipeline(
        effective_settings
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=effective_settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )
    app.include_router(health.router)
    app.include_router(api.router)
    app.include_router(api.router, prefix="/api", include_in_schema=False)

    return app


app = create_app()
