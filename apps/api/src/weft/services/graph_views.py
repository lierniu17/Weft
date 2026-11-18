"""图 (graph views): a person's local graph and the panorama around Self, now or at a point
in time (AC-33, AC-34, graph-viz AC-14)."""

from __future__ import annotations

from weft.domain.dates import PartialDate
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
            first_mentions=await q.mention_dates(),
        )
    )


async def panorama(infra: Infra, f: PanoramaFilter, *, at: PartialDate | None = None) -> GraphView:
    """The whole graph centred on Self, filtered by type and Self's closeness; as it was at
    ``at`` when given (persons met by then, closeness and Relationships as of then)."""
    q = GraphQueryRepository(infra.neo4j, require_tenant())
    return _panorama_view(
        await graph(infra).list_persons(),
        await q.relationships(),
        await q.feelings(),
        f,
        at=at,
        first_mentions=await q.mention_dates(),
        facts=await q.facts(),
        today=infra.today(),
    )


__all__ = ["MAX_HOPS", "local_graph", "panorama"]
