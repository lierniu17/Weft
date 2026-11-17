"""Local graph (1–2 hops, 50-node cap by closeness) and the filtered panorama (AC-33, AC-34)."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from weft.domain.confidence import Confidence
from weft.domain.dates import PartialDate
from weft.domain.graph_view import PanoramaFilter, local_view, panorama_view
from weft.repositories.records import (
    FeelingRecord,
    PersonRecord,
    RelationshipRecord,
    RelationshipTypeRecord,
)

pytestmark = pytest.mark.unit

T0 = datetime(2026, 1, 1, tzinfo=UTC)


def person(pid: str, *, me: bool = False) -> PersonRecord:
    return PersonRecord(id=pid, name=pid, aliases=(), is_self=me)


def rel(a: str, b: str, category: str = "social", subtype: str = "朋友") -> RelationshipRecord:
    return RelationshipRecord(
        id=f"{a}-{b}",
        person_a=a,
        person_b=b,
        types=[RelationshipTypeRecord(category, subtype, subtype)],
        met_at=None,
        origin=None,
        introduced_by=None,
        status="active",
        summary=None,
        confidence=Confidence.WITNESSED,
        sources=(),
    )


def close(src: str, dst: str, level: str, when: str = "2026-01") -> FeelingRecord:
    return FeelingRecord(
        id=f"{src}>{dst}@{when}",
        from_id=src,
        to_id=dst,
        dimension="closeness",
        level=level,
        confidence=Confidence.WITNESSED,
        occurred_at=PartialDate.parse(when),
        source="e",
        created_at=T0,
    )


#   me — zhang — li — zhao        zhang — wang
PERSONS = [person("me", me=True), *(person(p) for p in ("zhang", "li", "zhao", "wang"))]
RELS = [
    rel("me", "zhang"),
    rel("zhang", "li"),
    rel("li", "zhao", "kin", "亲戚"),
    rel("zhang", "wang"),
]


def ids(view: object) -> list[str]:
    return sorted(n.id for n in view.nodes)  # type: ignore[attr-defined]


def test_one_hop_shows_direct_relations_and_two_hops_reaches_further() -> None:
    one = local_view("zhang", PERSONS, RELS, [], hops=1)
    two = local_view("zhang", PERSONS, RELS, [], hops=2)
    assert ids(one) == ["li", "me", "wang", "zhang"]
    assert ids(two) == ["li", "me", "wang", "zhang", "zhao"]
    assert len(two.edges) == 4 and one.omitted == two.omitted == 0
    assert {(e.source, e.target) for e in one.edges} == {
        ("me", "zhang"),
        ("zhang", "li"),
        ("zhang", "wang"),
    }


def test_above_fifty_nodes_only_the_closest_stay_and_the_rest_are_counted() -> None:
    friends = [person(f"f{i:02d}") for i in range(60)]
    rels = [rel("center", f.id) for f in friends]
    feelings = [close("center", f"f{i:02d}", "intimate") for i in range(5)]
    feelings += [close(f"f{i:02d}", "center", "close") for i in range(5, 10)]
    feelings += [close("center", f"f{i:02d}", "distant") for i in range(10, 60)]
    view = local_view("center", [person("center"), *friends], rels, feelings, hops=1)
    assert len(view.nodes) == 50 and view.omitted == 11
    kept = {n.id for n in view.nodes}
    assert {f"f{i:02d}" for i in range(10)} <= kept  # intimate and close first
    assert "center" in kept


def test_the_latest_feeling_is_the_current_closeness() -> None:
    feelings = [close("me", "zhang", "intimate", "2020"), close("me", "zhang", "distant", "2026")]
    [edge] = [e for e in local_view("me", PERSONS, RELS, feelings, hops=1).edges]
    assert edge.closeness == "distant"


def test_the_panorama_is_centred_on_self_and_unfiltered_shows_everyone() -> None:
    view = panorama_view(PERSONS, RELS, [], PanoramaFilter())
    assert view.center_id == "me" and len(view.nodes) == 5 and len(view.edges) == 4


def test_filtering_the_panorama_by_category_keeps_matching_relationships_only() -> None:
    view = panorama_view(PERSONS, RELS, [], PanoramaFilter(categories=frozenset({"kin"})))
    assert ids(view) == ["li", "me", "zhao"]
    assert [(e.source, e.target) for e in view.edges] == [("li", "zhao")]


def test_filtering_the_panorama_by_self_closeness() -> None:
    feelings = [
        close("me", "zhang", "close"),
        close("me", "li", "familiar"),
        close("me", "wang", "intimate"),
    ]
    view = panorama_view(PERSONS, RELS, feelings, PanoramaFilter(min_closeness="close"))
    assert ids(view) == ["me", "wang", "zhang"]
    assert {(e.source, e.target) for e in view.edges} == {("me", "zhang"), ("zhang", "wang")}


def test_filters_combine_and_drop_persons_left_without_a_matching_relationship() -> None:
    feelings = [
        close("me", "zhang", "close"),
        close("me", "wang", "close"),
        close("me", "zhao", "close"),
    ]
    view = panorama_view(
        PERSONS,
        RELS,
        feelings,
        PanoramaFilter(
            categories=frozenset({"social"}), subtypes=frozenset({"朋友"}), min_closeness="close"
        ),
    )
    assert ids(view) == ["me", "wang", "zhang"]  # zhao is close but only kin to li
