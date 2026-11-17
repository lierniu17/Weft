"""Persons: find, direct profile edits (AC-26), cascade deletion (AC-27)."""

from __future__ import annotations

import pytest

from tests.support import scenarios as sc
from tests.support.graph import (
    Seed,
    facts_by_predicate,
    person_named,
    persons_of,
    profile_of,
    seed,
)
from tests.support.llm_script import LLMScript
from tests.support.users import new_user
from weft.domain.confidence import Confidence
from weft.domain.draft import ProfileField
from weft.domain.tenancy import tenant_scope
from weft.infra import Infra
from weft.services import entries, persons
from weft.services.results import Err, Ok

pytestmark = pytest.mark.service


async def test_persons_are_found_by_name_or_alias_with_self_first(infra: Infra) -> None:
    user = await new_user(infra, "小明")
    await seed(infra, user, Seed(persons=["张伟", "李雷"]))
    with tenant_scope(user.tenant):
        everyone = await persons.list_persons(infra)
        found = await persons.list_persons(infra, "张")
    assert everyone[0].name == "小明" and everyone[0].is_self
    assert [p.name for p in found] == ["张伟"]


# --- AC-26 ---------------------------------------------------------------------------


async def test_setting_a_birthday_takes_effect_with_a_manual_edit_entry_as_source(
    infra: Infra,
) -> None:
    user = await new_user(infra)
    ids = await seed(infra, user, Seed(persons=["老张"]))
    with tenant_scope(user.tenant):
        result = await persons.edit_profile(
            infra, ids["老张"], persons.SetIdentity(ProfileField.BIRTHDAY, "03-05")
        )
        assert isinstance(result, Ok)
        listed = await entries.list_entries(infra)
    birthday = result.value.value.identity["birthday"]
    entry = result.value.entry
    assert (birthday.value, birthday.confidence) == ("03-05", Confidence.WITNESSED)
    assert birthday.sources == (str(entry.id),)
    assert entry.kind == "manual_edit" and "生日" in entry.text and "03-05" in entry.text
    assert [(e.id, d) for e, d in listed] == [(entry.id, None)]


async def test_deleting_a_trait_removes_it_and_leaves_a_manual_edit_entry(infra: Infra) -> None:
    user = await new_user(infra)
    ids = await seed(
        infra,
        user,
        Seed(persons=["老张"], facts=[("老张", "HAS_TRAIT", "急性子", Confidence.HEARSAY, None)]),
    )
    [trait] = facts_by_predicate(await profile_of(infra, user, "老张"), "HAS_TRAIT")
    with tenant_scope(user.tenant):
        result = await persons.edit_profile(infra, ids["老张"], persons.DeleteFact(trait.id))
        assert isinstance(result, Ok)
        [(entry, _)] = await entries.list_entries(infra)
    assert facts_by_predicate(await profile_of(infra, user, "老张"), "HAS_TRAIT") == []
    assert entry.kind == "manual_edit" and "急性子" in entry.text


async def test_added_and_corrected_facts_cite_their_manual_edit_entries(infra: Infra) -> None:
    user = await new_user(infra)
    ids = await seed(infra, user, Seed(persons=["老张"]))
    with tenant_scope(user.tenant):
        added = await persons.edit_profile(infra, ids["老张"], persons.AddFact("LIKES", "钓鱼"))
        assert isinstance(added, Ok)
        [fact] = facts_by_predicate(added.value.value, "LIKES")
        fixed = await persons.edit_profile(infra, ids["老张"], persons.UpdateFact(fact.id, "海钓"))
        assert isinstance(fixed, Ok)
        opinion = await persons.edit_profile(infra, ids["老张"], persons.AddFact("OPINION", "靠谱"))
        assert isinstance(opinion, Ok)
    [likes] = facts_by_predicate(fixed.value.value, "LIKES")
    assert (likes.object, likes.confidence, likes.sources) == (
        "海钓",
        Confidence.WITNESSED,
        (str(fixed.value.entry.id),),
    )
    [mine] = [f for f in opinion.value.value.facts if f.kind == "opinion"]
    assert (mine.object, mine.sources) == ("靠谱", (str(opinion.value.entry.id),))


async def test_a_fact_of_another_person_cannot_be_edited_through_this_one(infra: Infra) -> None:
    user = await new_user(infra)
    ids = await seed(
        infra,
        user,
        Seed(
            persons=["老张", "小李"],
            facts=[("小李", "LIKES", "露营", Confidence.WITNESSED, None)],
        ),
    )
    [camping] = facts_by_predicate(await profile_of(infra, user, "小李"), "LIKES")
    with tenant_scope(user.tenant):
        result = await persons.edit_profile(infra, ids["老张"], persons.DeleteFact(camping.id))
    assert isinstance(result, Err) and result.reason == "not_found"


# --- AC-27 ---------------------------------------------------------------------------


async def test_deleting_a_person_cascades_in_the_graph_and_keeps_every_entry(
    infra: Infra, llm: LLMScript
) -> None:
    sc.dinner_with_laozhang(llm)
    sc.laozhang_bubble_tea(llm)
    sc.roommates(llm)
    user = await new_user(infra)
    await seed(
        infra,
        user,
        Seed(persons=["小李"], facts=[("小李", "LIKES", "钓鱼", Confidence.WITNESSED, None)]),
    )
    for text in (sc.DINNER, sc.BUBBLE_TEA, sc.ROOMMATES):
        await sc.confirmed(infra, user, (await sc.extracted(infra, user, text)).id)
    laozhang = await person_named(infra, user, "老张")
    with tenant_scope(user.tenant):
        impact = await persons.deletion_impact(infra, laozhang.id)
        assert isinstance(impact, Ok)
        assert (impact.value.entry_count, impact.value.can_delete) == (3, True)
        assert isinstance(await persons.delete_person(infra, laozhang.id), Ok)
        texts = [e.text for e, _ in await entries.list_entries(infra)]

    assert sorted(texts) == sorted([sc.DINNER, sc.BUBBLE_TEA, sc.ROOMMATES])
    assert "老张" not in [p.name for p in await persons_of(infra, user)]
    async with infra.neo4j.session() as session:
        result = await session.run(
            """
            MATCH (n) WHERE n.group_id = $g AND (n.uuid = $id OR n.person_a = $id
                  OR n.person_b = $id OR n.name IN ['老张', '喝酒', '女儿高考', '请大家喝奶茶']
                  OR '老张' IN coalesce(n.aliases, []))
            RETURN count(n) AS nodes
            """,
            g=user.tenant.group_id,
            id=laozhang.id,
        )
        leftovers = await result.single()
        edges = await session.run(
            "MATCH ()-[r]->() WHERE r.group_id = $g AND r.fact CONTAINS '老张' "
            "RETURN count(r) AS n",
            g=user.tenant.group_id,
        )
        leftover_edges = await edges.single()
        episodes = await session.run(
            "MATCH (e:Episodic {group_id: $g}) RETURN count(e) AS n", g=user.tenant.group_id
        )
        episode_count = await episodes.single()
    assert leftovers is not None and leftovers["nodes"] == 0
    assert leftover_edges is not None and leftover_edges["n"] == 0
    assert episode_count is not None and episode_count["n"] == 4  # 3 entries + the seed

    xiaoli = await profile_of(infra, user, "小李")
    assert [f.object for f in facts_by_predicate(xiaoli, "EXPERIENCED")] == ["升职"]
    assert [f.object for f in facts_by_predicate(xiaoli, "LIKES")] == ["钓鱼"]  # still shared


async def test_self_cannot_be_deleted(infra: Infra) -> None:
    user = await new_user(infra)
    me = await person_named(infra, user, "小明")
    with tenant_scope(user.tenant):
        impact = await persons.deletion_impact(infra, me.id)
        refused = await persons.delete_person(infra, me.id)
    assert isinstance(impact, Ok) and impact.value.can_delete is False
    assert isinstance(refused, Err) and refused.reason == "self_undeletable"
    assert [p.name for p in await persons_of(infra, user)] == ["小明"]
