"""图 routes: a person's local graph and the panorama, now or at a time point (AC-33, AC-34,
graph-viz AC-14)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from weft.domain.dates import PartialDate
from weft.domain.draft import ClosenessLevel
from weft.domain.graph_view import PanoramaFilter
from weft.domain.taxonomy import Category
from weft.domain.tenancy import tenant_scope
from weft.routes.deps import ApiError, InfraDep, SessionDep, unwrap
from weft.routes.schemas import GraphOut
from weft.services import graph_views

router = APIRouter(tags=["graph"])


@router.get("/persons/{person_id}/graph", response_model=GraphOut)
async def local_graph(
    person_id: str,
    session: SessionDep,
    infra: InfraDep,
    hops: Annotated[int, Query(ge=1, le=graph_views.MAX_HOPS, description="1 层或 2 层")] = 1,
) -> GraphOut:
    with tenant_scope(session.tenant):
        view = unwrap(
            await graph_views.local_graph(infra, person_id, hops=hops), {"not_found": 404}
        )
    return GraphOut.of(view)


def _list(value: str | None) -> list[str]:
    return [v.strip() for v in (value or "").split(",") if v.strip()]


def _time_point(at: str | None) -> PartialDate | None:
    if at is None:
        return None
    try:
        return PartialDate.parse(at)
    except ValueError as exc:
        raise ApiError(
            422,
            "validation_error",
            "时间点不正确",
            {"fields": [{"loc": ["query", "at"], "msg": str(exc)}]},
        ) from exc


@router.get("/graph", response_model=GraphOut)
async def panorama(
    session: SessionDep,
    infra: InfraDep,
    category: Annotated[str | None, Query(description="关系大类，逗号分隔，如 social,kin")] = None,
    subtype: Annotated[str | None, Query(description="关系小类，逗号分隔，如 同学,室友")] = None,
    closeness: Annotated[ClosenessLevel | None, Query(description="亲密度至少到这一档")] = None,
    at: Annotated[
        str | None,
        Query(
            description="时间点（YYYY / YYYY-MM / YYYY-MM-DD，含当期最后一天）："
            "只显示那时已认识的人，亲密度与关系按那时；不传为现在",
            examples=["2013", "2025-06"],
        ),
    ] = None,
) -> GraphOut:
    categories = _list(category)
    unknown = sorted(set(categories) - {c.value for c in Category})
    if unknown:
        raise ApiError(422, "validation_error", "关系大类不正确", {"categories": unknown})
    f = PanoramaFilter(
        categories=frozenset(categories),
        subtypes=frozenset(_list(subtype)),
        min_closeness=None if closeness is None else closeness.value,
    )
    with tenant_scope(session.tenant):
        view = await graph_views.panorama(infra, f, at=_time_point(at))
    return GraphOut.of(view)
