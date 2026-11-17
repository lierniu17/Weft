"""Which persons' and pairs' summaries a graph write makes stale (AC-24, AC-28)."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from weft.domain.confidence import Confidence
from weft.domain.dates import PartialDate
from weft.domain.graph_write import (
    EpisodeWrite,
    GraphWrite,
    IdentitySet,
    NewFact,
    NewFeeling,
    NewPerson,
    RelationshipUpsert,
)
from weft.domain.taxonomy import Category, RelationshipType

pytestmark = pytest.mark.unit

EPISODE = EpisodeWrite(
    "e1", "text", PartialDate(2026, 11, 16), "user", datetime(2026, 1, 1, tzinfo=UTC)
)
W = Confidence.WITNESSED


def _fact(fid: str, subject: str, *, person: str | None = None, kind: str = "fact") -> NewFact:
    return NewFact(fid, subject, "LIKES", "x", "f", W, object_person_id=person, kind=kind)


def test_new_persons_identity_changes_facts_and_opinion_targets_are_touched() -> None:
    write = GraphWrite(
        episode=EPISODE,
        persons=[NewPerson("new", "老张")],
        identity=[IdentitySet("li", "birthday", "03-05", W)],
        facts=[_fact("f1", "wang"), _fact("f2", "self", person="zhou", kind="opinion")],
    )
    assert write.touched_persons() == ["new", "li", "zhou", "wang"]


def test_relationships_feelings_and_person_to_person_facts_touch_their_pair_once() -> None:
    social = (RelationshipType(Category.SOCIAL, "同事", "同事"),)
    write = GraphWrite(
        episode=EPISODE,
        relationships=[
            RelationshipUpsert("r1", "a", "b", social, W),
            RelationshipUpsert("r2", "c", "d", social, W, summary="我写的", summary_from_user=True),
        ],
        feelings=[NewFeeling("e1", "b", "a", "closeness", "close", W, PartialDate(2026))],
        facts=[_fact("f1", "a", person="e"), _fact("f2", "self", person="a", kind="opinion")],
    )
    assert write.touched_pairs() == [("a", "b"), ("a", "e")]
