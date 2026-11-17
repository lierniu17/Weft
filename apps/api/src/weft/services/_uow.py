"""Small helpers shared by services: repositories bound to the session's tenant."""

from __future__ import annotations

from weft.domain.tenancy import TenantContext, require_tenant
from weft.infra import Infra
from weft.repositories.graph import GraphRepository


def tenant() -> TenantContext:
    return require_tenant()


def graph(infra: Infra, scope: TenantContext | None = None) -> GraphRepository:
    return GraphRepository(
        infra.neo4j, scope or require_tenant(), fault_hook=infra.graph_fault_hook
    )


__all__ = ["graph", "tenant"]
