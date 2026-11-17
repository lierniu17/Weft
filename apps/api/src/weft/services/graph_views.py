"""图 (graph views): a person's local graph and the panorama around Self (AC-33, AC-34)."""

from __future__ import annotations

from weft.domain.graph_view import LOCAL_GRAPH_LIMIT, GraphView, PanoramaFilter, local_view
from weft.domain.graph_view import panorama_view as _panorama_view
from weft.domain.tenancy import require_tenant
from weft.infra import Infra
from weft.repositories.graph_query import GraphQueryRepository
from weft.services._uow import graph
from weft.services.results import Ok, Result, not_found

MAX_HOPS = 2


async def local_graph(infra: Infra, person_id: str, *, hops: int = 1) -> Result[GraphView]:
    """Everyone within ``hops`` (1 or 2) Relationships of the person, at most 50 nodes."""
    if hops not in (1, MAX_HOPS):
        raise ValueError("hops must be 1 or 2")
    persons = await graph(infra).list_persons()
    if all(p.id != person_id for p in persons):
        return not_found("person")
    q = GraphQueryRepository(infra.neo4j, require_tenant())
    return Ok(
        local_view(
            person_id,
            persons,
            await q.relationships(),
            await q.feelings(),
            hops=hops,
            limit=LOCAL_GRAPH_LIMIT,
        )
    )


async def panorama(infra: Infra, f: PanoramaFilter) -> GraphView:
    """The whole graph centred on Self, filtered by type and Self's closeness."""
    q = GraphQueryRepository(infra.neo4j, require_tenant())
    return _panorama_view(
        await graph(infra).list_persons(), await q.relationships(), await q.feelings(), f
    )


__all__ = ["MAX_HOPS", "local_graph", "panorama"]
