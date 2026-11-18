"""Graphiti hybrid search is deterministic within a tenant.

Equally relevant hits (same BM25 score, same cosine similarity) used to come back in
Neo4j's storage order, which depends on everything else in the shared database (other
tenants, deleted and reused record ids). Where ``num_results`` cuts through such a tie,
which hits survived changed from run to run — and so did the tool output the ask service
sends to the model (and the LLM fixture it is keyed by).
"""

from __future__ import annotations

import uuid

import pytest

from tests.conftest import track_user
from tests.support.llm_script import fake_embedding
from weft.domain.tenancy import ScopedGraphiti, TenantContext, tenant_scope
from weft.infra import Infra
from weft.settings import Settings

pytestmark = pytest.mark.service

# Same length, same shared bigram 露营: equal BM25 scores; one embedding: equal cosine.
TIED = ["露营丁", "露营丙", "露营乙", "露营甲", "露营戊", "露营己"]


async def _tied_graph(infra: Infra, settings: Settings, tenant: TenantContext) -> None:
    vector = fake_embedding("露营", settings.embedding_dimensions)
    async with infra.neo4j.session() as neo:
        # Written in reverse order, so storage order is the opposite of the tie-break.
        for text in sorted(TIED, reverse=True):
            await neo.run(
                "CREATE (a:Entity {group_id: $g, uuid: randomUUID(), name: $text,"
                " summary: '', name_embedding: $v, created_at: datetime()})"
                "-[:RELATES_TO {group_id: $g, uuid: randomUUID(), name: 'LIKES',"
                " fact: $text, fact_embedding: $v, episodes: [], created_at: datetime()}]->"
                "(:Entity {group_id: $g, uuid: randomUUID(), name: '某处', summary: '',"
                " created_at: datetime()})",
                g=tenant.group_id,
                text=text,
                v=vector,
            )


async def test_equally_relevant_hits_are_cut_in_a_stable_order(
    infra: Infra, settings: Settings
) -> None:
    tenant = track_user(uuid.uuid4())
    await _tied_graph(infra, settings, tenant)
    with tenant_scope(tenant):
        results = await ScopedGraphiti(infra.graph_search, tenant).search("露营", num_results=2)
    expected = sorted(TIED)[:2]
    assert [e.fact for e in results.edges] == expected
    assert [n.name for n in results.nodes] == expected
