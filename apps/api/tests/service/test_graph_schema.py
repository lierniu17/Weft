"""Startup creates the Neo4j fulltext indexes with the CJK analyzer (spec 「中文检索」), and
the graph repository refuses unscoped Cypher (ADR-0001)."""

from __future__ import annotations

import pytest

from tests.support.users import new_user
from weft.domain.tenancy import tenant_scope
from weft.infra import Infra
from weft.main import create_app
from weft.repositories.graph import GraphRepository, UnscopedQueryError
from weft.repositories.graph_schema import FULLTEXT_INDEXES

pytestmark = pytest.mark.service


async def test_app_startup_creates_every_fulltext_index_with_the_cjk_analyzer(
    infra: Infra,
) -> None:
    app = create_app(infra.settings, infra=infra)
    async with app.router.lifespan_context(app):
        pass
    async with infra.neo4j.session() as session:
        result = await session.run(
            "SHOW FULLTEXT INDEXES YIELD name, state, options "
            "RETURN name, state, options.indexConfig['fulltext.analyzer'] AS analyzer"
        )
        indexes = {r["name"]: (r["state"], r["analyzer"]) async for r in result}
    for name in FULLTEXT_INDEXES:
        assert indexes[name] == ("ONLINE", "cjk"), name


async def test_the_graph_repository_refuses_cypher_without_a_tenant_filter(infra: Infra) -> None:
    user = await new_user(infra)
    repo = GraphRepository(infra.neo4j, user.tenant)
    with tenant_scope(user.tenant), pytest.raises(UnscopedQueryError):
        await repo._read("MATCH (n:Person) RETURN n")
    with tenant_scope(user.tenant), pytest.raises(UnscopedQueryError):
        await repo._read(
            "MATCH (n:Person {group_id: $group_id}) RETURN n", group_id="u_someone_else"
        )
