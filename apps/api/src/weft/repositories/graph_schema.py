"""Neo4j schema bootstrap, run on startup (idempotent).

Fulltext indexes use the ``cjk`` analyzer: Neo4j's default analyzer does not segment
Chinese (spec 「中文检索」). Graphiti's own index names are reused so that Graphiti's
hybrid search (batch 2, always through ``ScopedGraphiti``) hits the CJK-analyzed indexes.
The server-wide default analyzer is left alone (docker-compose.yml).
"""

from __future__ import annotations

from typing import LiteralString

from neo4j import AsyncDriver

CJK = "OPTIONS {indexConfig: {`fulltext.analyzer`: 'cjk'}}"

FULLTEXT_INDEXES: dict[str, LiteralString] = {
    # Graphiti's names (graphiti_core.graph_queries.get_fulltext_indices), CJK analyzer
    "episode_content": "CREATE FULLTEXT INDEX episode_content IF NOT EXISTS "
    "FOR (e:Episodic) ON EACH [e.content, e.source, e.source_description, e.group_id] " + CJK,
    "node_name_and_summary": "CREATE FULLTEXT INDEX node_name_and_summary IF NOT EXISTS "
    "FOR (n:Entity) ON EACH [n.name, n.summary, n.group_id] " + CJK,
    "community_name": "CREATE FULLTEXT INDEX community_name IF NOT EXISTS "
    "FOR (n:Community) ON EACH [n.name, n.group_id] " + CJK,
    "edge_name_and_fact": "CREATE FULLTEXT INDEX edge_name_and_fact IF NOT EXISTS "
    "FOR ()-[e:RELATES_TO]-() ON EACH [e.name, e.fact, e.group_id] " + CJK,
    # Weft: person lookup by name or any alias (aliases_text = aliases joined by spaces)
    "weft_person_names": "CREATE FULLTEXT INDEX weft_person_names IF NOT EXISTS "
    "FOR (p:Person) ON EACH [p.name, p.aliases_text] " + CJK,
}

RANGE_INDEXES: tuple[LiteralString, ...] = (
    "CREATE INDEX weft_entity_uuid IF NOT EXISTS FOR (n:Entity) ON (n.uuid)",
    "CREATE INDEX weft_entity_group IF NOT EXISTS FOR (n:Entity) ON (n.group_id)",
    "CREATE INDEX weft_episode_group IF NOT EXISTS FOR (n:Episodic) ON (n.group_id)",
    "CREATE INDEX weft_relationship_group IF NOT EXISTS FOR (n:Relationship) ON (n.group_id)",
    "CREATE INDEX weft_relates_uuid IF NOT EXISTS FOR ()-[e:RELATES_TO]-() ON (e.uuid)",
)


# An Entry is written to the graph at most once: its id is the episode uuid and the
# idempotency key of draft confirmation (AC-19).
CONSTRAINTS: tuple[LiteralString, ...] = (
    "CREATE CONSTRAINT weft_episode_uuid_unique IF NOT EXISTS "
    "FOR (e:Episodic) REQUIRE e.uuid IS UNIQUE",
)


async def ensure_graph_schema(driver: AsyncDriver) -> None:
    async with driver.session() as session:
        for statement in (*CONSTRAINTS, *FULLTEXT_INDEXES.values(), *RANGE_INDEXES):
            await session.run(statement)
        await session.run("CALL db.awaitIndexes(60)")


__all__ = ["CONSTRAINTS", "FULLTEXT_INDEXES", "RANGE_INDEXES", "ensure_graph_schema"]
