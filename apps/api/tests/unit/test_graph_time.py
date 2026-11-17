"""The panorama at a point in time (graph-viz AC-14) and what the star graph needs per node.

Pure functions over persons, Relationships (with their per-Entry history), Feelings and
facts: who was known then (认识时间, else the first Entry mentioning them), Self's closeness
in both directions then, a Relationship's types / status / confidence as of then, groups
(群体) and, for persons not directly related to Self, the anchor person (锚点).
"""

from __future__ import annotations

from datetime import UTC, date, datetime

import pytest

from weft.domain.confidence import Confidence
from weft.domain.dates import PartialDate
from weft.domain.graph_view import PanoramaFilter, panorama_view, relationship_at
from weft.repositories.records import (
    FactRecord,
    FeelingRecord,
    PersonRecord,
    RelationshipChange,
    RelationshipRecord,
    RelationshipTypeRecord,
)

pytestmark = pytest.mark.unit

T0 = datetime(2026, 1, 1, tzinfo=UTC)
TODAY = date(2026, 11, 16)
W, H = Confidence.WITNESSED, Confidence.HEARSAY


def pd(text: str) -> PartialDate:
    return PartialDate.parse(text)


def person(pid: str, *, me: bool = False) -> PersonRecord:
    return PersonRecord(id=pid, name=pid, aliases=(), is_self=me)


def t(category: str, subtype: str) -> RelationshipTypeRecord:
    return RelationshipTypeRecord(category, subtype, subtype)


def change(
    when: str,
    *types: RelationshipTypeRecord,
    status: str | None = None,
    confidence: Confidence = W,
) -> RelationshipChange:
    return RelationshipChange(
        occurred=pd(when), types=types, status=status, confidence=confidence, entry_id=when
    )


def rel(
    a: str,
    b: str,
    *types: RelationshipTypeRecord,
    met_at: str | None = None,
    status: str | None = "active",
    confidence: Confidence = W,
    history: tuple[RelationshipChange, ...] = (),
) -> RelationshipRecord:
    return RelationshipRecord(
        id=f"{a}-{b}",
        person_a=a,
        person_b=b,
        types=list(types or (t("social", "朋友"),)),
        met_at=None if met_at is None else pd(met_at),
        origin=None,
        introduced_by=None,
        status=status,
        summary=None,
        confidence=confidence,
        sources=(),
        history=history,
    )


def feel(src: str, dst: str, level: str, when: str) -> FeelingRecord:
    return FeelingRecord(
        id=f"{src}>{dst}@{when}",
        from_id=src,
        to_id=dst,
        dimension="closeness",
        level=level,
        confidence=W,
        occurred_at=pd(when),
        source="e",
        created_at=T0,
    )


def works_at(pid: str, org: str, since: str | None = None, until: str | None = None) -> FactRecord:
    return FactRecord(
        id=f"{pid}@{org}",
        subject_id=pid,
        predicate="WORKS_AT",
        object=org,
        object_id=org,
        fact=f"{pid}在{org}工作",
        valid_at=None if since is None else pd(since),
        invalid_at=None if until is None else pd(until),
        confidence=W,
        unverified=False,
        sources=(),
    )


# me — zhang (met 2018) — li (met 2015, roommate of zhang: tense from 2025)
# zhang — daughter (no relationship to me; first mentioned 2026-11)
# me — su (no met_at; first mentioned 2017)
ROOMMATE = rel(
    "zhang",
    "li",
    t("social", "室友"),
    status="tense",
    confidence=H,
    history=(
        change("2019", t("social", "室友")),
        change("2025-05", t("social", "室友"), status="tense", confidence=H),
        change("2026-10", t("social", "室友"), status="tense", confidence=H),
    ),
)
PERSONS = [person("me", me=True), *(person(p) for p in ("zhang", "li", "daughter", "su"))]
RELS = [
    rel("me", "zhang", t("social", "同事"), t("social", "朋友"), met_at="2018-03"),
    rel("me", "li", t("social", "同学"), met_at="2015"),
    ROOMMATE,
    rel("zhang", "daughter", t("kin", "父母")),
    rel("su", "me", t("romantic", "前任"), status="estranged"),
]
FEELINGS = [
    feel("me", "li", "close", "2015"),
    feel("me", "li", "familiar", "2023"),
    feel("li", "me", "intimate", "2016"),
    feel("me", "zhang", "familiar", "2018-03"),
    feel("me", "zhang", "intimate", "2021-06"),
]
MENTIONS = {
    "zhang": [pd("2018-03-12")],
    "li": [pd("2015"), pd("2023-02-20")],
    "daughter": [pd("2026-11-10")],
    "su": [pd("2017-06"), pd("2016")],
}


def view_at(when: str | None, f: PanoramaFilter | None = None, facts: list[FactRecord] = ()):  # type: ignore[assignment]
    return panorama_view(
        PERSONS,
        RELS,
        FEELINGS,
        f or PanoramaFilter(),
        at=None if when is None else pd(when),
        first_mentions=MENTIONS,
        facts=list(facts),
        today=TODAY,
    )


def node_ids(view: object) -> set[str]:
    return {n.id for n in view.nodes}  # type: ignore[attr-defined]


def edge(view: object, a: str, b: str) -> object:
    [found] = [
        e
        for e in view.edges  # type: ignore[attr-defined]
        if {e.source, e.target} == {a, b}
    ]
    return found


# --- who is visible ---------------------------------------------------------------------


def test_without_a_time_point_the_panorama_is_the_current_graph() -> None:
    view = view_at(None)
    assert node_ids(view) == {"me", "zhang", "li", "daughter", "su"}
    assert view.at is None
    assert edge(view, "zhang", "li").status == "tense"  # type: ignore[attr-defined]


def test_at_a_year_only_persons_known_by_then_are_shown() -> None:
    assert node_ids(view_at("2015")) == {"me", "li"}
    # su has no 认识时间: the first Entry mentioning her (2016) stands in for it
    assert node_ids(view_at("2016")) == {"me", "li", "su"}
    assert node_ids(view_at("2018-02")) == {"me", "li", "su"}
    assert node_ids(view_at("2018-03")) == {"me", "li", "su", "zhang"}
    assert node_ids(view_at("2026")) == {"me", "zhang", "li", "daughter", "su"}


def test_edges_appear_only_between_persons_visible_then() -> None:
    view = view_at("2016")
    assert {frozenset((e.source, e.target)) for e in view.edges} == {
        frozenset(("me", "li")),
        frozenset(("su", "me")),
    }


def test_each_node_carries_its_met_date_with_the_first_mention_fallback() -> None:
    met = {n.id: n.met_at for n in view_at(None).nodes}
    assert met == {
        "me": None,
        "zhang": pd("2018-03"),  # the Relationship's 认识时间 wins over the first mention
        "li": pd("2015"),
        "daughter": pd("2026-11-10"),
        "su": pd("2016"),  # earliest mention, whatever order they come in
    }


def test_the_timeline_runs_from_the_earliest_met_date_to_today() -> None:
    view = view_at("2016")
    assert view.timeline is not None
    assert (view.timeline.start, view.timeline.end) == (pd("2015"), TODAY)


# --- closeness then ---------------------------------------------------------------------


def test_closeness_is_the_latest_feeling_at_or_before_the_time_point_in_both_directions() -> None:
    me_li = edge(view_at("2020"), "me", "li")
    assert (me_li.source_closeness, me_li.target_closeness) == ("close", "intimate")  # type: ignore[attr-defined]
    assert edge(view_at("2023"), "me", "li").source_closeness == "familiar"  # type: ignore[attr-defined]
    assert edge(view_at("2015"), "me", "li").target_closeness is None  # type: ignore[attr-defined]
    assert edge(view_at("2019"), "me", "zhang").source_closeness == "familiar"  # type: ignore[attr-defined]
    assert edge(view_at("2021"), "me", "zhang").source_closeness == "intimate"  # type: ignore[attr-defined]


def test_directional_closeness_follows_the_edge_orientation() -> None:
    su = edge(view_at(None), "su", "me")
    assert (su.source, su.target) == ("su", "me")  # type: ignore[attr-defined]
    li = edge(view_at(None), "me", "li")
    assert (li.source_closeness, li.target_closeness) == ("familiar", "intimate")  # type: ignore[attr-defined]


def test_the_closeness_filter_uses_closeness_at_the_time_point() -> None:
    f = PanoramaFilter(min_closeness="close")
    assert node_ids(view_at("2020", f)) == {"me", "li"}
    assert node_ids(view_at("2024", f)) == {"me", "zhang"}


# --- the relationship then --------------------------------------------------------------


def test_status_is_what_was_said_by_then_and_unknown_before_anything_was_said() -> None:
    assert relationship_at(ROOMMATE, date(2020, 1, 1)).status is None
    assert relationship_at(ROOMMATE, date(2024, 12, 31)).status is None
    assert relationship_at(ROOMMATE, date(2025, 5, 1)).status == "tense"
    assert relationship_at(ROOMMATE, date(2026, 11, 16)).status == "tense"
    assert edge(view_at("2024"), "zhang", "li").status is None  # type: ignore[attr-defined]
    assert edge(view_at("2025"), "zhang", "li").status == "tense"  # type: ignore[attr-defined]


def test_types_and_confidence_are_those_known_by_then() -> None:
    later = rel(
        "me",
        "zheng",
        t("interest", "合伙人"),
        t("social", "朋友"),
        confidence=W,
        history=(
            change("2018", t("interest", "合伙人"), confidence=H),
            change("2025-12", t("social", "朋友"), confidence=W),
        ),
    )
    then = relationship_at(later, date(2020, 1, 1))
    assert [x.subtype for x in then.types] == ["合伙人"]
    assert then.confidence is H
    now = relationship_at(later, date(2026, 1, 1))
    assert [x.subtype for x in now.types] == ["合伙人", "朋友"]
    assert now.confidence is W


def test_before_the_first_record_the_earliest_known_types_stand() -> None:
    then = relationship_at(ROOMMATE, date(2016, 1, 1))
    assert [x.subtype for x in then.types] == ["室友"] and then.confidence is W


def test_a_relationship_without_history_is_the_same_at_every_time() -> None:
    plain = rel("me", "x", status="distant", confidence=H)
    assert relationship_at(plain, date(2000, 1, 1)) == plain


# --- anchors ----------------------------------------------------------------------------


def test_a_person_without_a_relationship_to_self_is_anchored_to_the_nearest_connected_person() -> (
    None
):
    anchors = {n.id: n.anchor_id for n in view_at(None).nodes}
    assert anchors == {"me": None, "zhang": None, "li": None, "su": None, "daughter": "zhang"}


def test_the_anchor_prefers_the_neighbour_closest_to_self_then_closeness() -> None:
    persons = [person("me", me=True), *(person(p) for p in ("a", "b", "c", "x", "y"))]
    rels = [
        rel("me", "a"),
        rel("me", "b"),
        rel("a", "c"),
        rel("x", "c"),  # x: neighbours c (2 hops) and b (1 hop) -> b
        rel("x", "b"),
        rel("y", "x"),  # y: only x (2 hops)
    ]
    feelings = [feel("me", "a", "intimate", "2020")]
    view = panorama_view(persons, rels, feelings, PanoramaFilter(), today=TODAY)
    anchors = {n.id: n.anchor_id for n in view.nodes}
    assert anchors["c"] == "a" and anchors["x"] == "b" and anchors["y"] == "x"

    tie = [*rels, rel("c", "b")]  # c: a and b both 1 hop away; I am closer to a
    anchors = {
        n.id: n.anchor_id for n in panorama_view(persons, tie, feelings, PanoramaFilter()).nodes
    }
    assert anchors["c"] == "a"


def test_a_person_connected_to_nobody_has_no_anchor() -> None:
    persons = [person("me", me=True), person("lonely")]
    [_, lonely] = panorama_view(persons, [], [], PanoramaFilter()).nodes
    assert lonely.anchor_id is None


# --- groups -----------------------------------------------------------------------------


def test_groups_are_workplaces_schools_and_families_with_two_or_more_members() -> None:
    facts = [
        works_at("me", "字节跳动", "2018"),
        works_at("zhang", "字节跳动", "2018"),
        works_at("li", "字节跳动", "2023", until="2026-09"),
        works_at("li", "阿里巴巴", "2026-09"),
        works_at("su", "腾讯"),
    ]
    view = view_at(None, facts=facts)
    groups = {(g.kind, g.name): g.member_ids for g in view.groups}
    # Self is never a member; li left 字节跳动; 阿里巴巴 / 腾讯 have one member each.
    # A family is named after its member nearest to me.
    assert groups == {("family", "zhang家"): ["daughter", "zhang"]}

    then = {(g.kind, g.name): g.member_ids for g in view_at("2024", facts=facts).groups}
    # facts invalidated after the time point were still current then
    assert then[("organization", "字节跳动")] == ["li", "zhang"]


def test_family_groups_follow_kin_relationships_and_include_my_own_family() -> None:
    persons = [person("me", me=True), *(person(p) for p in ("dad", "mom", "sis", "wife"))]
    rels = [
        rel("dad", "me", t("kin", "父母")),
        rel("mom", "me", t("kin", "父母")),
        rel("dad", "mom", t("kin", "配偶")),
        rel("sis", "me", t("kin", "兄弟姐妹")),
        rel("wife", "me", t("kin", "配偶")),
    ]
    [family] = panorama_view(persons, rels, [], PanoramaFilter()).groups
    assert (family.kind, family.name, family.member_ids) == (
        "family",
        "我的家人",
        ["dad", "mom", "sis", "wife"],
    )
    assert family.id.startswith("family:")


def test_groups_only_hold_persons_shown() -> None:
    facts = [works_at("zhang", "字节跳动"), works_at("li", "字节跳动")]
    assert [g.member_ids for g in view_at("2024", facts=facts).groups if g.kind != "family"] == [
        ["li", "zhang"]
    ]
    assert [g for g in view_at("2016", facts=facts).groups if g.kind != "family"] == []
