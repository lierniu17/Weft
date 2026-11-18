"""The panorama at a point in time on the seed graph (graph-viz AC-1, AC-4, AC-14).

Real Neo4j: who was known then, Self's closeness then (both directions), each
Relationship's status as of then, anchors of persons not related to Self, groups and the
timeline's range; and that every write keeps what its Entry said as the Relationship's
history.
"""

from __future__ import annotations

from datetime import date

import pytest

from tests.support import scenarios as sc
from tests.support.graph import Seed, pair_of, seed
from tests.support.llm_script import LLMScript
from tests.support.seeded import SeededUser, seeded_user
from tests.support.users import new_user
from weft.domain.confidence import Confidence
from weft.domain.dates import PartialDate
from weft.domain.graph_view import GraphView, PanoramaFilter, relationship_at
from weft.domain.taxonomy import Category
from weft.domain.tenancy import tenant_scope
from weft.infra import Infra
from weft.services import graph_views, persons
from weft.services.results import Ok

pytestmark = pytest.mark.service


async def panorama(infra: Infra, s: SeededUser, at: str | None = None) -> GraphView:
    with tenant_scope(s.user.tenant):
        return await graph_views.panorama(
            infra, PanoramaFilter(), at=None if at is None else PartialDate.parse(at)
        )


def names(view: GraphView) -> set[str]:
    return {n.name for n in view.nodes}


def edge_between(view: GraphView, s: SeededUser, a: str, b: str):  # type: ignore[no-untyped-def]
    ids = {s.ids[a], s.ids[b]}
    [found] = [e for e in view.edges if {e.source, e.target} == ids]
    return found


async def test_at_2013_only_persons_met_by_then_are_shown(infra: Infra) -> None:
    s = await seeded_user(infra)
    view = await panorama(infra, s, "2013")
    assert names(view) == {"小明", "唐亮"}  # 老张 (2018) is not there yet
    assert view.at == PartialDate(2013)
    assert "张伟" in names(await panorama(infra, s, "2018-03"))
    assert "张伟" not in names(await panorama(infra, s, "2018-02"))
    assert len((await panorama(infra, s)).nodes) == 31


async def test_met_date_falls_back_to_the_first_entry_mentioning_the_person(
    infra: Infra,
) -> None:
    s = await seeded_user(infra)
    met = {n.name: n.met_at for n in (await panorama(infra, s)).nodes}
    assert met["张伟"] == PartialDate(2018, 3)  # the Relationship's 认识时间
    assert met["赵磊"] == PartialDate(2021, 4, 10)  # no Relationship with me: first mention
    assert met["陈建国"] == PartialDate(2020, 1, 25)  # no 认识时间 recorded
    assert met["小明"] is None
    assert "赵磊" not in names(await panorama(infra, s, "2021-03"))
    assert "赵磊" in names(await panorama(infra, s, "2021-04"))


async def test_closeness_at_a_time_point_is_the_latest_feeling_by_then(infra: Infra) -> None:
    s = await seeded_user(infra)
    me_zhang = {
        at: edge_between(await panorama(infra, s, at), s, "我", "老张")
        for at in ("2019", "2021-06", None)
    }
    me_first = {at: e.source == s.ids["我"] for at, e in me_zhang.items()}
    mine = {
        at: (e.source_closeness if me_first[at] else e.target_closeness)
        for at, e in me_zhang.items()
    }
    theirs = {
        at: (e.target_closeness if me_first[at] else e.source_closeness)
        for at, e in me_zhang.items()
    }
    assert mine == {"2019": "close", "2021-06": "intimate", None: "intimate"}
    assert theirs == {"2019": None, "2021-06": "close", None: "close"}  # 老张 → 我

    tao = edge_between(await panorama(infra, s, "2018"), s, "我", "周涛")
    later = edge_between(await panorama(infra, s, "2020"), s, "我", "周涛")
    assert (tao.closeness, later.closeness) == ("familiar", "casual")  # drifted apart in 2019


async def test_relationship_status_is_as_of_the_time_point(infra: Infra) -> None:
    s = await seeded_user(infra)
    statuses = {
        at: edge_between(await panorama(infra, s, at), s, "老张", "小李").status
        for at in ("2020", "2024", "2025", "2026", None)
    }
    # 2025 年前老张与小李的线不是红色
    assert statuses == {"2020": None, "2024": None, "2025": "tense", "2026": "tense", None: "tense"}
    now = edge_between(await panorama(infra, s), s, "老张", "小李")
    assert now.confidence == Confidence.HEARSAY.value


async def test_types_are_as_of_the_time_point(infra: Infra) -> None:
    s = await seeded_user(infra)
    then = edge_between(await panorama(infra, s, "2025-11"), s, "我", "郑凯")
    now = edge_between(await panorama(infra, s), s, "我", "郑凯")
    assert [t.subtype for t in then.types] == ["合伙人"]
    assert [t.subtype for t in now.types] == ["合伙人", "朋友"]  # types[0] stays first


async def test_persons_without_a_relationship_to_self_hang_off_their_anchor(
    infra: Infra,
) -> None:
    s = await seeded_user(infra)
    view = await panorama(infra, s)
    anchors = {n.name: n.anchor_id for n in view.nodes if n.anchor_id}
    assert anchors == {
        "老张的女儿": s.ids["老张"],
        "黄丽": s.ids["老张"],
        "赵磊": s.ids["周涛"],
        "刘洋": s.ids["小王"],
        "宋佳": s.ids["小李"],
    }


async def test_groups_and_timeline(infra: Infra) -> None:
    s = await seeded_user(infra)
    view = await panorama(infra, s)
    name = {n.id: n.name for n in view.nodes}
    groups = {(g.kind, g.name): {name[m] for m in g.member_ids} for g in view.groups}
    assert groups[("organization", "字节跳动")] == {"张伟", "吴昊", "郭佳", "钱多多"}
    assert groups[("organization", "阿里巴巴")] == {"李明", "陈静", "宋佳"}
    assert groups[("school", "浙江大学")] == {"李明", "陈静", "周涛"}
    assert groups[("family", "我的家人")] == {"陈建国", "王秀英", "陈晓", "刘婷"}
    assert groups[("family", "张伟家")] == {"张伟", "黄丽", "老张的女儿"}
    # 小李 had not left 字节跳动 yet in 2025: the invalidated fact was current then
    then = {(g.kind, g.name): g.member_ids for g in (await panorama(infra, s, "2025")).groups}
    assert s.ids["小李"] in then[("organization", "字节跳动")]
    assert view.timeline is not None
    assert (view.timeline.start, view.timeline.end) == (PartialDate(2012), date(2026, 11, 16))


async def test_each_write_keeps_what_its_entry_said_as_the_relationship_history(
    infra: Infra, llm: LLMScript
) -> None:
    sc.laowang_types(llm)
    user = await new_user(infra)
    draft = await sc.extracted(infra, user, sc.LAOWANG)
    await sc.confirmed(infra, user, draft.id)
    pair = await pair_of(infra, user, "小明", "老王")
    assert pair.relationship is not None
    [said] = pair.relationship.history
    assert [t.subtype for t in said.types] == ["朋友", "合伙人", "其他"]
    assert said.entry_id == str(draft.entry_id)

    ids = await seed(
        infra,
        user,
        Seed(persons=["老张", "小李"], relationships=[("老张", "小李", Category.SOCIAL, "室友")]),
    )
    with tenant_scope(user.tenant):
        edited = await persons.edit_relationship(
            infra, ids["老张"], ids["小李"], persons.RelationshipEdit(status="tense")
        )
    assert isinstance(edited, Ok)
    pair = await pair_of(infra, user, "老张", "小李")
    assert pair.relationship is not None
    assert [(c.occurred, c.status) for c in pair.relationship.history] == [
        (PartialDate(2026, 1, 1), None),
        (PartialDate(2026, 11, 16), "tense"),  # the 手动编辑记录's date
    ]
    assert relationship_at(pair.relationship, date(2026, 6, 30)).status is None
    assert relationship_at(pair.relationship, date(2026, 11, 16)).status == "tense"
