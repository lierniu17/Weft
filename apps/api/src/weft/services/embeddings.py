"""Embeddings for Graphiti's hybrid search (``name_embedding`` / ``fact_embedding``).

* ``attach`` — just before a graph write (confirmed Draft, manual edit, seed), embed the new
  persons' names, renamed persons, every new fact sentence and its object entity's name.
  Best effort: if the embedding provider is down the write goes ahead without vectors.
* ``backfill`` — embed whatever in the tenant's graph still has no vector (``python -m
  weft.cli embeddings backfill``).
"""

from __future__ import annotations

import dataclasses
import logging
from dataclasses import dataclass

import httpx

from weft.domain.graph_write import GraphWrite, Vector
from weft.infra import Infra
from weft.llm import LLMError
from weft.services._uow import graph

logger = logging.getLogger(__name__)

BACKFILL_BATCH = 100


@dataclass(frozen=True)
class Backfilled:
    nodes: int
    facts: int


async def _embed(infra: Infra, texts: list[str]) -> dict[str, Vector] | None:
    unique = list(dict.fromkeys(t for t in texts if t.strip()))
    if not unique:
        return {}
    try:
        vectors = await infra.embedder.embed(unique)
    except (LLMError, httpx.HTTPError) as exc:
        logger.warning("embedding %d texts failed, writing without vectors: %r", len(unique), exc)
        return None
    return dict(zip(unique, vectors, strict=True))


async def embed_one(infra: Infra, text: str) -> Vector | None:
    vectors = await _embed(infra, [text])
    return None if vectors is None else vectors.get(text)


async def attach(infra: Infra, write: GraphWrite) -> GraphWrite:
    """``write`` with embeddings for everything it creates (unchanged if embedding fails)."""
    texts = [p.name for p in write.persons]
    texts += [i.value for i in write.identity if i.field == "name"]
    texts += [f.fact for f in write.facts]
    texts += [f.object for f in write.facts if f.object_person_id is None]
    vectors = await _embed(infra, texts)
    if not vectors:
        return write
    return dataclasses.replace(
        write,
        persons=[dataclasses.replace(p, name_embedding=vectors.get(p.name)) for p in write.persons],
        identity=[
            dataclasses.replace(i, name_embedding=vectors.get(i.value)) if i.field == "name" else i
            for i in write.identity
        ],
        facts=[
            dataclasses.replace(
                f,
                fact_embedding=vectors.get(f.fact),
                object_embedding=None if f.object_person_id else vectors.get(f.object),
            )
            for f in write.facts
        ],
    )


async def backfill(infra: Infra) -> Backfilled:
    """Embed every node and fact of the session's tenant that has no vector yet."""
    g = graph(infra)
    total_nodes = total_facts = 0
    while True:
        nodes, facts = await g.missing_embeddings(BACKFILL_BATCH)
        if not nodes and not facts:
            return Backfilled(nodes=total_nodes, facts=total_facts)
        vectors = await _embed(infra, [*nodes.values(), *facts.values()])
        if vectors is None:
            raise LLMError("the embedding provider is unavailable; nothing was backfilled")
        node_vectors = {k: vectors[t] for k, t in nodes.items() if t in vectors}
        fact_vectors = {k: vectors[t] for k, t in facts.items() if t in vectors}
        if not node_vectors and not fact_vectors:  # only blank texts left
            return Backfilled(nodes=total_nodes, facts=total_facts)
        await g.store_embeddings(node_vectors, fact_vectors)
        total_nodes += len(node_vectors)
        total_facts += len(fact_vectors)


__all__ = ["Backfilled", "attach", "backfill", "embed_one"]
