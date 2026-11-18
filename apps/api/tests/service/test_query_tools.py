"""Q&A query tools over the seed graph (AC-36 tool data, AC-14, AC-23, AC-25, AC-39).

Every tool reads only the session's tenant; none takes a tenant argument.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass

import pytest

from tests import conftest
from tests.support.users import new_user
from weft.domain.confidence import Confidence
from weft.domain.dates import PartialDate
from weft.domain.taxonomy import Category
from weft.domain.tenancy import tenant_scope
from weft.infra import Infra
from weft.services import query_tools as qt
from weft.services import seed
from weft.services.results import Err, Ok

pytestmark = pytest.mark.service


@dataclass
class Seeded:
    user: conftest.TestUser
    ids: dict[str, str]  # name / alias -> person id


async def seeded_user(infra: Infra, name: str = "小明") -> Seeded:
    user = await new_user(infra, name)
    with tenant_scope(user.tenant):
        result = await seed.seed_graph(infra)
    assert isinstance(result, Ok), result
    return Seeded(user, result.value.persons)


@pytest.fixture
async def s(infra: Infra) -> AsyncIterator[Seeded]:
    seeded = await seeded_user(infra)
    with tenant_scope(seeded.user.tenant):
        yield seeded


def names(persons: object) -> list[str]:
    return sorted(p.name for p in persons)  # type: ignore[attr-defined]


# --- the seed itself ------------------------------------------------------------------


async def test_the_seed_has_thirty_persons_of_every_category_and_refuses_a_second_run(
    infra: Infra, s: Seeded
) -> None:
    everyone = await qt.find_person(infra, "")
    assert len(everyone) == 30
    relationships = await qt.all_relationships(infra)
    assert {t.category for r in relationships for t in r.types} == {c.value for c in Category}
    again = await seed.seed_graph(infra)
    assert isinstance(again, Err) and again.reason == "graph_not_empty"


# --- find person / profile ---------------------------------------------------------------


async def test_find_person_matches_names_aliases_and_self(infra: Infra, s: Seeded) -> None:
    assert names(await qt.find_person(infra, "老张")) == ["张伟"]
    assert names(await qt.find_person(infra, "张伟")) == ["张伟"]
    assert [p.is_self for p in await qt.find_person(infra, "我")] == [True]
    assert await qt.find_person(infra, "诸葛亮") == []


async def test_profile_keeps_history_flags_opinions_and_cites_entries(
    infra: Infra, s: Seeded
) -> None:
    xiaoli = await qt.read_profile(infra, s.ids["小李"])
    assert xiaoli is not None
    jobs = {(f.object, f.current) for f in xiaoli.facts if f.predicate == "WORKS_AT"}
    assert jobs == {("字节跳动", False), ("阿里巴巴", True)}  # AC-14: the old job is history
    [old] = [f for f in xiaoli.facts if f.object == "字节跳动"]
    assert old.invalid_at == PartialDate(2026, 9)
    assert xiaoli.episodes[old.sources[0]].content == "小李跟我说他去字节跳动上班了。"

    laozhang = await qt.read_profile(infra, s.ids["老张"])
    assert laozhang is not None
    [opinion] = [f for f in laozhang.facts if f.kind == "opinion"]
    assert (opinion.object, opinion.predicate) == ("靠谱", "OPINION")  # AC-23
    assert all(f.sources and f.sources[0] in laozhang.episodes for f in laozhang.facts)


# --- relationship -----------------------------------------------------------------------


async def test_pair_relationship_has_types_status_timeline_and_both_feeling_directions(
    infra: Infra, s: Seeded
) -> None:
    pair = await qt.read_relationship(infra, s.ids["老张"], s.ids["小李"])
    assert pair is not None and pair.relationship is not None
    r = pair.relationship
    assert [(t.subtype, t.original) for t in r.types] == [("室友", "大学室友")]
    assert (r.status, r.confidence) == ("tense", Confidence.HEARSAY)
    [fell_out] = pair.facts
    assert (fell_out.fact, fell_out.valid_at) == ("老张和小李因为借钱闹掰了", PartialDate(2026, 9))
    assert [(f.from_id, f.dimension, f.level) for f in pair.feelings] == [
        (s.ids["小李"], "trust", "low")
    ]
    assert "借钱" in pair.episodes[fell_out.sources[0]].content


# --- path -------------------------------------------------------------------------------


async def test_how_i_met_xiaowang_is_the_introduction_chain(infra: Infra, s: Seeded) -> None:
    path = await qt.find_path(infra, s.ids["我"], s.ids["小王"])
    assert path is not None
    assert [p.name for p in path.persons] == ["小明", "张伟", "王浩"]
    assert path.introduced_by is not None and path.introduced_by.name == "张伟"


async def test_the_shortest_chain_to_someone_i_do_not_know(infra: Infra, s: Seeded) -> None:
    to_zhaolei = await qt.find_path(infra, s.ids["我"], s.ids["赵磊"])
    assert to_zhaolei is not None
    assert [p.name for p in to_zhaolei.persons] == ["小明", "周涛", "赵磊"]
    assert len(to_zhaolei.relationships) == 2 and to_zhaolei.introduced_by is None
    to_liuyang = await qt.find_path(infra, s.ids["老张"], s.ids["刘洋"])
    assert to_liuyang is not None
    assert [p.name for p in to_liuyang.persons] == ["张伟", "王浩", "刘洋"]


async def test_no_path_beyond_four_hops_or_between_strangers(infra: Infra, s: Seeded) -> None:
    assert await qt.find_path(infra, s.ids["我"], s.ids["我"]) is None
    assert await qt.find_path(infra, s.ids["赵磊"], s.ids["宋佳"], max_hops=3) is None
    long = await qt.find_path(infra, s.ids["赵磊"], s.ids["宋佳"])
    assert long is not None and len(long.persons) == 5  # 赵磊 周涛 我 小李 宋佳


# --- filter / count ------------------------------------------------------------------------


async def test_filter_by_relationship_type(infra: Infra, s: Seeded) -> None:
    classmates = await qt.filter_persons(infra, qt.PersonFilter(relationship_subtype="同学"))
    assert names(m.person for m in classmates) == ["周涛", "李明", "陈静"]
    assert all(m.relationship is not None for m in classmates)


async def test_filter_by_interest_lists_every_camper_with_the_backing_fact(
    infra: Infra, s: Seeded
) -> None:
    campers = await qt.filter_persons(
        infra, qt.PersonFilter(predicate="LIKES", object_keywords=("露营",))
    )
    assert names(m.person for m in campers) == ["刘洋", "孙悦", "林芳", "王浩", "陈静"]
    [liuyang] = [m for m in campers if m.person.name == "刘洋"]
    assert [f.confidence for f in liuyang.facts] == [Confidence.HEARSAY]


async def test_filter_by_category_and_closeness(infra: Infra, s: Seeded) -> None:
    close = await qt.filter_persons(
        infra,
        qt.PersonFilter(relationship_category=Category.SOCIAL, min_closeness="close"),
    )
    # 老张 became 至交 in 2021; 郑凯 is also a friend (社会) since 2025-12
    assert names(m.person for m in close) == ["张伟", "李明", "郑凯"]
    assert {m.closeness.level for m in close if m.closeness} == {"intimate", "close"}


async def test_count_uses_current_facts_unless_history_is_asked_for(
    infra: Infra, s: Seeded
) -> None:
    at_bytedance = qt.PersonFilter(predicate="WORKS_AT", object_keywords=("字节跳动",))
    now = await qt.count_persons(infra, at_bytedance)
    ever = await qt.count_persons(
        infra, qt.PersonFilter(**{**vars(at_bytedance), "include_history": True})
    )
    assert (now.count, names(m.person for m in now.matches)) == (
        4,
        ["吴昊", "张伟", "郭佳", "钱多多"],
    )
    assert ever.count == 5 and "李明" in names(m.person for m in ever.matches)


async def test_a_filter_needs_at_least_one_condition(infra: Infra, s: Seeded) -> None:
    with pytest.raises(ValueError, match="条件"):
        await qt.filter_persons(infra, qt.PersonFilter())


# --- time --------------------------------------------------------------------------------


async def test_who_i_met_in_the_last_half_year(infra: Infra, s: Seeded) -> None:
    result = await qt.time_query(
        infra,
        qt.TimeQuery(kind="met", start=PartialDate(2026, 5, 16), end=PartialDate(2026, 11, 16)),
    )
    assert names(m.person for m in result.met) == ["何伟", "孙悦", "林芳"]


async def test_when_the_two_fell_out(infra: Infra, s: Seeded) -> None:
    result = await qt.time_query(
        infra, qt.TimeQuery(kind="pair_events", person_a=s.ids["老张"], person_b=s.ids["小李"])
    )
    fell_out = [e for e in result.events if "借钱" in e.text]
    assert [(e.date, e.confidence) for e in fell_out] == [
        (PartialDate(2026, 9), Confidence.HEARSAY)
    ]
    assert all(e.sources for e in result.events)


async def test_facts_that_happened_in_a_period(infra: Infra, s: Seeded) -> None:
    result = await qt.time_query(
        infra, qt.TimeQuery(kind="facts", start=PartialDate(2026, 6), end=PartialDate(2026, 7))
    )
    happened = sorted((p.name, f.object) for p, f in result.facts if f.predicate == "EXPERIENCED")
    assert happened == [("罗建华", "退休"), ("郭佳", "升职")]


# --- semantic search -----------------------------------------------------------------------


async def test_semantic_search_finds_facts_and_persons_through_graphiti(
    infra: Infra, s: Seeded
) -> None:
    hits = await qt.semantic_search(infra, "喜欢露营")
    camper_ids = {f.subject_id for f in hits.facts if f.object == "露营"}
    assert {s.ids["小王"], s.ids["孙悦"]} <= camper_ids
    assert all(f.sources for f in hits.facts)


# --- isolation (AC-4, AC-39) -----------------------------------------------------------------


async def test_every_tool_only_sees_its_own_tenant(infra: Infra) -> None:
    a = await seeded_user(infra, "甲")
    b = await seeded_user(infra, "乙")
    a_ids = set(a.ids.values())
    with tenant_scope(b.user.tenant):
        found = await qt.find_person(infra, "老张")
        assert [p.id for p in found] == [b.ids["老张"]]
        assert await qt.read_profile(infra, a.ids["老张"]) is None
        assert await qt.read_relationship(infra, a.ids["老张"], a.ids["小李"]) is None
        assert await qt.find_path(infra, b.ids["我"], a.ids["小王"]) is None
        campers = await qt.filter_persons(
            infra, qt.PersonFilter(predicate="LIKES", object_keywords=("露营",))
        )
        counted = await qt.count_persons(infra, qt.PersonFilter(relationship_subtype="同学"))
        met = await qt.time_query(infra, qt.TimeQuery(kind="met", start=PartialDate(2000)))
        hits = await qt.semantic_search(infra, "露营")
    seen = {m.person.id for m in campers} | {m.person.id for m in counted.matches}
    seen |= {m.person.id for m in met.met} | {f.subject_id for f in hits.facts}
    seen |= {p.id for p in hits.persons}
    assert seen and not seen & a_ids


@pytest.mark.parametrize("smuggled", ["group_id", "group_ids", "tenant", "user_id"])
async def test_tools_refuse_tenant_arguments(infra: Infra, s: Seeded, smuggled: str) -> None:
    calls = [
        lambda: qt.find_person(infra, "老张", **{smuggled: "u_x"}),
        lambda: qt.read_profile(infra, s.ids["老张"], **{smuggled: "u_x"}),
        lambda: qt.semantic_search(infra, "露营", **{smuggled: "u_x"}),
        lambda: qt.count_persons(
            infra, qt.PersonFilter(relationship_subtype="同学"), **{smuggled: "u_x"}
        ),
    ]
    for call in calls:
        with pytest.raises(TypeError):
            await call()
