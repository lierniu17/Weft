"""Extraction quality eval runner (AC-42): the real pipeline over ``eval/extraction/samples.jsonl``.

For each sample: seed its ``graph_context`` (persons with aliases and notes, facts) into a
throwaway tenant, run exactly the extraction a Draft gets (``drafts.draft_for``) with the
sample's occurred date, and collect ``{"id", "draft"}``. Then ``eval/extraction/score.py``
scores the predictions against the gold Drafts. A sample whose extraction fails is left out
(reported under ``missing_predictions`` and ``errors``).
"""

from __future__ import annotations

import importlib.util
import logging
import uuid
from datetime import datetime
from types import ModuleType
from typing import Any

from weft.domain.confidence import Confidence
from weft.domain.dates import PartialDate
from weft.domain.graph_write import (
    PREDICATE_TARGETS,
    AliasAdd,
    EpisodeWrite,
    GraphWrite,
    NewFact,
    NewPerson,
    RelationshipUpsert,
    fact_sentence,
)
from weft.domain.taxonomy import BUILTIN, OTHER, Category, RelationshipType
from weft.domain.tenancy import TenantContext, tenant_scope
from weft.infra import Infra
from weft.repositories.graph import GraphRepository
from weft.repositories.records import EntryRecord
from weft.services import drafts
from weft.settings import API_DIR

logger = logging.getLogger(__name__)

EVAL_DIR = API_DIR / "eval" / "extraction"
SAMPLES_PATH = EVAL_DIR / "samples.jsonl"
SELF_ID = "self"

Sample = dict[str, Any]


def load_scorer() -> ModuleType:
    """``eval/extraction/score.py`` (standard library only, kept outside the package)."""
    spec = importlib.util.spec_from_file_location(
        "weft_eval_extraction_score", EVAL_DIR / "score.py"
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _context_write(sample: Sample, self_id: str, now: datetime) -> GraphWrite:
    context = sample.get("graph_context") or {}
    ids = {SELF_ID: self_id}
    names = {self_id: "我"}
    write = GraphWrite(
        episode=EpisodeWrite(
            entry_id=str(uuid.uuid4()),
            content="(eval graph context)",
            occurred=PartialDate(2000),
            kind="manual_edit",
            created_at=now,
        )
    )
    for p in context.get("persons", []):
        if p.get("is_self"):
            continue
        ids[p["id"]] = p["id"]
        names[p["id"]] = p["name"]
        write.persons.append(NewPerson(id=p["id"], name=p["name"]))
        write.aliases.extend(AliasAdd(p["id"], a) for a in p.get("aliases", []) if a != p["name"])
        if p.get("note"):  # the note shown to matching is the Self relationship's wording
            write.relationships.append(
                RelationshipUpsert(
                    id=str(uuid.uuid4()),
                    person_a=self_id,
                    person_b=p["id"],
                    types=(RelationshipType(Category.SOCIAL, OTHER, p["note"]),),
                    confidence=Confidence.WITNESSED,
                )
            )
    for f in context.get("facts", []):
        subject = ids[f["subject"]]
        write.facts.append(
            NewFact(
                id=str(uuid.uuid4()),
                subject_id=subject,
                predicate=f["predicate"],
                object=f["object"],
                fact=fact_sentence(names[subject], f["predicate"], f["object"]),
                confidence=Confidence(f["confidence"]),
                object_label=PREDICATE_TARGETS.get(f["predicate"]),
            )
        )
    return write


async def predict(infra: Infra, sample: Sample) -> dict[str, Any]:
    """The Draft the pipeline extracts for one sample, in a throwaway tenant."""
    tenant = TenantContext.for_user(uuid.uuid4())
    with tenant_scope(tenant):
        g = GraphRepository(infra.neo4j, tenant)
        me = await g.create_self(person_id=str(uuid.uuid4()), name="我", now=infra.clock())
        try:
            await g.apply(_context_write(sample, me.id, infra.clock()))
            entry = EntryRecord(
                id=uuid.uuid4(),
                text=sample["text"],
                occurred=PartialDate.parse(sample["occurred_date"]),
                kind="user",
                created_at=infra.clock(),
            )
            draft = await drafts.draft_for(infra, entry, BUILTIN)
        finally:
            await g.delete_tenant()
    return {"id": sample["id"], "draft": draft.model_dump(mode="json", by_alias=True)}


async def run(infra: Infra, samples: list[Sample]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Predict every sample and score; returns (predictions, report)."""
    predictions: list[dict[str, Any]] = []
    errors: dict[str, str] = {}
    for sample in samples:
        try:
            predictions.append(await predict(infra, sample))
        except Exception as exc:  # one failed sample must not stop the run
            logger.warning("extraction eval: sample %s failed: %r", sample["id"], exc)
            errors[sample["id"]] = f"{type(exc).__name__}: {str(exc)[:200]}"
    scorer = load_scorer()
    report: dict[str, Any] = scorer.score(samples, {p["id"]: p["draft"] for p in predictions})
    report["errors"] = errors
    return predictions, report


__all__ = ["SAMPLES_PATH", "load_scorer", "predict", "run"]
