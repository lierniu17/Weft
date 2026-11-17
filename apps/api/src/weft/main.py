"""FastAPI application factory."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from weft import __version__
from weft.infra import Infra, build_infra
from weft.repositories.graph_schema import ensure_graph_schema
from weft.routes import ask, auth, entries, graph, health, persons
from weft.routes.deps import install_error_handlers
from weft.settings import Settings, get_settings

PUBLIC_ROUTES = frozenset(
    {
        ("GET", "/api/health"),
        ("POST", "/api/auth/register"),
        ("POST", "/api/auth/login"),
    }
)
"""The only routes that work without a login session; every other route requires one."""


def create_app(settings: Settings | None = None, *, infra: Infra | None = None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        owned = app.state.infra is None
        if owned:
            app.state.infra = build_infra(settings)
        await ensure_graph_schema(app.state.infra.neo4j)  # CJK fulltext indexes
        try:
            yield
        finally:
            if owned:
                await app.state.infra.aclose()
                app.state.infra = None

    app = FastAPI(title="Weft API", version=__version__, lifespan=lifespan)
    app.state.settings = settings
    app.state.infra = infra
    install_error_handlers(app)
    for module in (health, auth, entries, persons, graph, ask):
        app.include_router(module.router, prefix="/api")
    return app


def app() -> FastAPI:  # uvicorn factory: `uvicorn weft.main:app --factory`
    return create_app()


__all__ = ["PUBLIC_ROUTES", "app", "create_app"]
