from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from where_is_hype_api.config import get_settings
from where_is_hype_api.routes import health


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Где Хайп? API", version="0.1.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["*"],
    )
    app.include_router(health.router)

    return app


app = create_app()
