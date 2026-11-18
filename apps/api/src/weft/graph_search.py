"""Graphiti hybrid search (BM25 over the CJK fulltext indexes + cosine over embeddings).

Only reachable through ``weft.domain.tenancy.ScopedGraphiti``, which always passes the
session's ``group_ids`` (never ``None``). This module only adapts Graphiti to Weft:

* ``GraphitiEmbedder`` — Graphiti's embedder interface on top of ``weft.llm.embeddings``.
* ``SearchOnlyNeo4jDriver`` — Graphiti's Neo4j driver that never builds Graphiti's own
  indexes (Weft owns the schema, with CJK analyzers: ``graph_schema.py``) and searches
  through ``StableSearch``.
* ``StableSearch`` — Graphiti's four Neo4j search queries (BM25 / cosine over facts and
  nodes) with a deterministic tie-break, so equally relevant hits are cut in the same
  order on every run, whatever else the shared database holds.
* ``GraphitiSearchClient`` — ``search(query, group_ids=..., ...)`` running Graphiti's
  hybrid recipe over facts (edges) and nodes, reranked with RRF (no cross-encoder).
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from graphiti_core.driver.driver import GraphProvider
from graphiti_core.driver.neo4j_driver import Neo4jDriver
from graphiti_core.driver.search_interface.search_interface import SearchInterface
from graphiti_core.edges import EntityEdge, get_entity_edge_from_record
from graphiti_core.embedder.client import EmbedderClient
from graphiti_core.graphiti_types import GraphitiClients
from graphiti_core.models.edges.edge_db_queries import get_entity_edge_return_query
from graphiti_core.models.nodes.node_db_queries import get_entity_node_return_query
from graphiti_core.nodes import EntityNode, get_entity_node_from_record
from graphiti_core.search.search import search as graphiti_search
from graphiti_core.search.search_config import (
    EdgeReranker,
    EdgeSearchConfig,
    EdgeSearchMethod,
    NodeReranker,
    NodeSearchConfig,
    NodeSearchMethod,
    SearchConfig,
    SearchResults,
)
from graphiti_core.search.search_filters import (
    SearchFilters,
    edge_search_filter_query_constructor,
    node_search_filter_query_constructor,
)
from graphiti_core.search.search_utils import fulltext_query
from graphiti_core.tracer import NoOpTracer

from weft.llm.embeddings import Embedder
from weft.settings import Settings


class GraphitiEmbedder(EmbedderClient):
    def __init__(self, embedder: Embedder) -> None:
        self._embedder = embedder

    async def create(
        self, input_data: str | list[str] | Iterable[int] | Iterable[Iterable[int]]
    ) -> list[float]:
        if isinstance(input_data, str):
            text = input_data
        else:
            items = list(input_data)
            if not items or not isinstance(items[0], str):
                raise TypeError("Weft embeds text only")
            text = str(items[0])
        [vector] = await self._embedder.embed([text])
        return vector

    async def create_batch(self, input_data_list: list[str]) -> list[list[float]]:
        return await self._embedder.embed(input_data_list)


NEO4J = GraphProvider.NEO4J
EDGE_RETURN = get_entity_edge_return_query(NEO4J)
NODE_RETURN = get_entity_node_return_query(NEO4J)
# Equal scores are ordered by content, then id; never by Neo4j's storage order, which
# depends on other tenants' data and on which deleted record ids the store reused.
EDGE_ORDER = "ORDER BY score DESC, e.fact, e.name, e.uuid LIMIT $limit"
NODE_ORDER = "ORDER BY score DESC, n.name, n.uuid LIMIT $limit"


def _where(
    filters: list[str], params: dict[str, Any], var: str, group_ids: list[str] | None
) -> tuple[str, dict[str, Any]]:
    if group_ids is not None:
        filters = [*filters, f"{var}.group_id IN $group_ids"]
        params = {**params, "group_ids": group_ids}
    return (" WHERE " + " AND ".join(filters) if filters else ""), params


class StableSearch(SearchInterface):
    """Graphiti's Neo4j BM25 and cosine searches, with ties broken by content.

    The queries of ``graphiti_core.search.search_utils``, except for the ``ORDER BY`` and
    that the fulltext index is not asked for a top-k of its own (that would cut its ties
    in Lucene's insertion order); its query is already restricted to the tenant's group.
    Only the four methods ``hybrid_config`` uses are implemented.
    """

    async def edge_fulltext_search(
        self,
        driver: Any,
        query: str,
        search_filter: Any,
        group_ids: list[str] | None = None,
        limit: int = 100,
    ) -> list[EntityEdge]:
        lucene = fulltext_query(query, group_ids, driver)
        if lucene == "":
            return []
        filters, params = edge_search_filter_query_constructor(search_filter, NEO4J)
        where, params = _where(filters, params, "e", group_ids)
        cypher = (
            'CALL db.index.fulltext.queryRelationships("edge_name_and_fact", $query)'
            " YIELD relationship AS rel, score"
            " MATCH (n:Entity)-[e:RELATES_TO {uuid: rel.uuid}]->(m:Entity)"
            f"{where} WITH e, score, n, m RETURN {EDGE_RETURN} {EDGE_ORDER}"
        )
        records, _, _ = await driver.execute_query(
            cypher, query=lucene, limit=limit, routing_="r", **params
        )
        return [get_entity_edge_from_record(r, NEO4J) for r in records]

    async def edge_similarity_search(
        self,
        driver: Any,
        search_vector: list[float],
        source_node_uuid: str | None,
        target_node_uuid: str | None,
        search_filter: Any,
        group_ids: list[str] | None = None,
        limit: int = 100,
        min_score: float = 0.7,
    ) -> list[EntityEdge]:
        filters, params = edge_search_filter_query_constructor(search_filter, NEO4J)
        if group_ids is not None and source_node_uuid is not None:
            filters, params = (
                [*filters, "n.uuid = $source_uuid"],
                {
                    **params,
                    "source_uuid": source_node_uuid,
                },
            )
        if group_ids is not None and target_node_uuid is not None:
            filters, params = (
                [*filters, "m.uuid = $target_uuid"],
                {
                    **params,
                    "target_uuid": target_node_uuid,
                },
            )
        where, params = _where(filters, params, "e", group_ids)
        cypher = (
            f"MATCH (n:Entity)-[e:RELATES_TO]->(m:Entity){where}"
            " WITH DISTINCT e, n, m,"
            " vector.similarity.cosine(e.fact_embedding, $search_vector) AS score"
            f" WHERE score > $min_score RETURN {EDGE_RETURN} {EDGE_ORDER}"
        )
        records, _, _ = await driver.execute_query(
            cypher,
            search_vector=search_vector,
            limit=limit,
            min_score=min_score,
            routing_="r",
            **params,
        )
        return [get_entity_edge_from_record(r, NEO4J) for r in records]

    async def node_fulltext_search(
        self,
        driver: Any,
        query: str,
        search_filter: Any,
        group_ids: list[str] | None = None,
        limit: int = 100,
    ) -> list[EntityNode]:
        lucene = fulltext_query(query, group_ids, driver)
        if lucene == "":
            return []
        filters, params = node_search_filter_query_constructor(search_filter, NEO4J)
        where, params = _where(filters, params, "n", group_ids)
        cypher = (
            'CALL db.index.fulltext.queryNodes("node_name_and_summary", $query)'
            f" YIELD node AS n, score{where}"
            f" WITH n, score {NODE_ORDER} RETURN {NODE_RETURN}"
        )
        records, _, _ = await driver.execute_query(
            cypher, query=lucene, limit=limit, routing_="r", **params
        )
        return [get_entity_node_from_record(r, NEO4J) for r in records]

    async def node_similarity_search(
        self,
        driver: Any,
        search_vector: list[float],
        search_filter: Any,
        group_ids: list[str] | None = None,
        limit: int = 100,
        min_score: float = 0.7,
    ) -> list[EntityNode]:
        filters, params = node_search_filter_query_constructor(search_filter, NEO4J)
        where, params = _where(filters, params, "n", group_ids)
        cypher = (
            f"MATCH (n:Entity){where}"
            " WITH n, vector.similarity.cosine(n.name_embedding, $search_vector) AS score"
            f" WHERE score > $min_score WITH n, score {NODE_ORDER} RETURN {NODE_RETURN}"
        )
        records, _, _ = await driver.execute_query(
            cypher,
            search_vector=search_vector,
            limit=limit,
            min_score=min_score,
            routing_="r",
            **params,
        )
        return [get_entity_node_from_record(r, NEO4J) for r in records]


class SearchOnlyNeo4jDriver(Neo4jDriver):
    """Graphiti's driver for reads; Graphiti's own (non-CJK) indexes are never created."""

    search_interface = StableSearch()

    async def build_indices_and_constraints(self, delete_existing: bool = False) -> None:
        return None


def hybrid_config(limit: int) -> SearchConfig:
    return SearchConfig(
        edge_config=EdgeSearchConfig(
            search_methods=[EdgeSearchMethod.bm25, EdgeSearchMethod.cosine_similarity],
            reranker=EdgeReranker.rrf,
        ),
        node_config=NodeSearchConfig(
            search_methods=[NodeSearchMethod.bm25, NodeSearchMethod.cosine_similarity],
            reranker=NodeReranker.rrf,
        ),
        limit=limit,
    )


class GraphitiSearchClient:
    """The raw client ``ScopedGraphiti`` wraps; never handed out on its own."""

    def __init__(self, driver: Neo4jDriver, embedder: Embedder) -> None:
        self._driver = driver
        # No LLM / cross-encoder: the hybrid recipe reranks with RRF only.
        unused: dict[str, Any] = {"llm_client": None, "cross_encoder": None}
        self._clients = GraphitiClients.model_construct(
            driver=driver,
            embedder=GraphitiEmbedder(embedder),
            **unused,
            tracer=NoOpTracer(),
            prompt_library=None,
            llm_runtime=None,
            max_coroutines=None,
        )

    async def search(
        self,
        query: str,
        *,
        group_ids: list[str],
        num_results: int = 10,
        center_node_uuid: str | None = None,
        search_filter: Any = None,
    ) -> SearchResults:
        if not group_ids or any(not g for g in group_ids):
            raise ValueError("Graphiti search needs explicit, non-empty group_ids (ADR-0001)")
        result: SearchResults = await graphiti_search(
            self._clients,
            query,
            group_ids,
            hybrid_config(num_results),
            search_filter if search_filter is not None else SearchFilters(),
            center_node_uuid=center_node_uuid,
        )
        return result

    async def aclose(self) -> None:
        await self._driver.close()


def build_graph_search(settings: Settings, embedder: Embedder) -> GraphitiSearchClient:
    driver = SearchOnlyNeo4jDriver(
        settings.neo4j_uri, settings.neo4j_user, settings.neo4j_password.get_secret_value()
    )
    return GraphitiSearchClient(driver, embedder)


__all__ = [
    "GraphitiEmbedder",
    "GraphitiSearchClient",
    "SearchOnlyNeo4jDriver",
    "StableSearch",
    "build_graph_search",
    "hybrid_config",
]
