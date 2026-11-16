"""FastAPI application factory."""

from __future__ import annotations

from fastapi import FastAPI

from weft import __version__
from weft.routes import health
from weft.settings import Settings, get_settings


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    app = FastAPI(title="Weft API", version=__version__)
    app.state.settings = settings
    app.include_router(health.router, prefix="/api")
    return app


def app() -> FastAPI:  # uvicorn factory: `uvicorn weft.main:app --factory`
    return create_app()
