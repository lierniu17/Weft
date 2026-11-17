"""Postgres access: engine, session factory and migrations (Alembic)."""

from __future__ import annotations

from pathlib import Path

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from weft.settings import API_DIR

SessionFactory = async_sessionmaker[AsyncSession]


def create_engine(url: str) -> AsyncEngine:
    return create_async_engine(url, pool_pre_ping=True)


def session_factory(engine: AsyncEngine) -> SessionFactory:
    return async_sessionmaker(engine, expire_on_commit=False)


def migrate(url: str, *, revision: str = "head", api_dir: Path = API_DIR) -> None:
    """Apply Alembic migrations to ``url``. Synchronous: call it outside an event loop."""
    from alembic import command
    from alembic.config import Config

    config = Config(str(api_dir / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", url)
    command.upgrade(config, revision)


__all__ = ["SessionFactory", "create_engine", "migrate", "session_factory"]
