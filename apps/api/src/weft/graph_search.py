"""Graphiti hybrid search (BM25 over the CJK fulltext indexes + cosine over embeddings).

Only reachable through ``weft.domain.tenancy.ScopedGraphiti``, which always passes the
session's ``group_ids`` (never ``None``). This module only adapts Graphiti to Weft:

* ``GraphitiEmbedder`` — Graphiti's embedder interface on top of ``weft.llm.embeddings``.
* ``SearchOnlyNeo4jDriver`` — Graphiti's Neo4j driver that never builds Graphiti's own
  indexes (Weft owns the schema, with CJK analyzers: ``graph_schema.py``).
* ``GraphitiSearchClient`` — ``search(query, group_ids=..., ...)`` running Graphiti's
  hybrid recipe over facts (edges) and nodes, reranked with RRF (no cross-encoder).
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from graphiti_core.driver.neo4j_driver import Neo4jDriver
from graphiti_core.embedder.client import EmbedderClient
from graphiti_core.graphiti_types import GraphitiClients
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
from graphiti_core.search.search_filters import SearchFilters
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


class SearchOnlyNeo4jDriver(Neo4jDriver):
    """Graphiti's driver for reads; Graphiti's own (non-CJK) indexes are never created."""

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
    "build_graph_search",
    "hybrid_config",
]
