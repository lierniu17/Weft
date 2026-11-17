"""Process-wide infrastructure handed to services: databases, LLM clients, the clock.

Built once at startup (``build_infra``) or by tests (pointing at a throwaway database
and the LLM replay transport). Services never read the tenant from here: it always
comes from ``weft.domain.tenancy.require_tenant()``.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, date, datetime

import httpx
from neo4j import AsyncDriver, AsyncGraphDatabase
from sqlalchemy.ext.asyncio import AsyncEngine

from weft.db import SessionFactory, create_engine, session_factory
from weft.domain.quota import beijing_day
from weft.extraction.llm import ExtractionLLM, build_extraction_llm
from weft.llm import build_http_client
from weft.settings import Settings

Clock = Callable[[], datetime]
FaultHook = Callable[[str], None]


def utc_now() -> datetime:
    return datetime.now(UTC)


@dataclass
class Infra:
    settings: Settings
    engine: AsyncEngine
    sql: SessionFactory
    neo4j: AsyncDriver
    http: httpx.AsyncClient
    llm: ExtractionLLM
    clock: Clock = utc_now
    # Test seam: called with a step name at each step of a graph write; raising there
    # simulates the graph write failing half-way (AC-19).
    graph_fault_hook: FaultHook | None = field(default=None)

    def today(self) -> date:
        """Today in Beijing time (Entry dates, AC-7; quota days, AC-40)."""
        return beijing_day(self.clock())

    async def aclose(self) -> None:
        await self.http.aclose()
        await self.neo4j.close()
        await self.engine.dispose()


def create_neo4j_driver(settings: Settings) -> AsyncDriver:
    return AsyncGraphDatabase.driver(
        settings.neo4j_uri,
        auth=(settings.neo4j_user, settings.neo4j_password.get_secret_value()),
        notifications_min_severity="OFF",
    )


def build_infra(
    settings: Settings,
    *,
    upstream_transport: httpx.AsyncBaseTransport | None = None,
    http: httpx.AsyncClient | None = None,
    clock: Clock = utc_now,
) -> Infra:
    engine = create_engine(settings.database_url)
    http = http or build_http_client(settings, upstream_transport=upstream_transport)
    return Infra(
        settings=settings,
        engine=engine,
        sql=session_factory(engine),
        neo4j=create_neo4j_driver(settings),
        http=http,
        llm=build_extraction_llm(settings, http),
        clock=clock,
    )


__all__ = ["Clock", "FaultHook", "Infra", "build_infra", "create_neo4j_driver", "utc_now"]
