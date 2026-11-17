"""综合描述 and relationship summaries: regenerated after every change (AC-24, AC-28)."""

from __future__ import annotations

import pytest

from tests.conftest import FakeClock
from tests.support import scenarios as sc
from tests.support.graph import pair_of, person_named, profile_of
from tests.support.llm_script import LLMScript
from tests.support.users import new_user
from weft.domain.tenancy import tenant_scope
from weft.infra import Infra
from weft.services import persons, summaries
from weft.services.results import Ok

pytestmark = pytest.mark.service

LAOZHANG_SUMMARY = "老张最近迷上了钓鱼，不喝酒。"


async def test_confirming_a_draft_regenerates_the_summary_with_its_time(
    infra: Infra, llm: LLMScript, clock: FakeClock
) -> None:
    sc.dinner_with_laozhang(llm)
    llm.person_summary("老张", LAOZHANG_SUMMARY)
    user = await new_user(infra)
    await sc.dinner_confirmed_as_in_bot2(infra, user)
    clock.advance(minutes=1)

    with tenant_scope(user.tenant):
        refreshed = await summaries.refresh_stale(infra)
        again = await summaries.refresh_stale(infra)  # nothing stale: no LLM call
    profile = await profile_of(infra, user, "老张")
    assert refreshed == summaries.Refreshed(persons=1, relationships=0, failed=0)
    assert again == summaries.Refreshed(persons=0, relationships=0, failed=0)
    assert (profile.summary, profile.summary_generated_at) == (LAOZHANG_SUMMARY, clock.now)


async def test_a_manual_edit_makes_the_summary_stale_again(
    infra: Infra, llm: LLMScript, clock: FakeClock
) -> None:
    sc.dinner_with_laozhang(llm)
    llm.person_summary("老张", LAOZHANG_SUMMARY)
    user = await new_user(infra)
    await sc.dinner_confirmed_as_in_bot2(infra, user)
    with tenant_scope(user.tenant):
        await summaries.refresh_stale(infra)
        laozhang = await person_named(infra, user, "老张")
        edited = await persons.edit_profile(
            infra, laozhang.id, persons.AddFact("HAS_TRAIT", "急性子")
        )
        assert isinstance(edited, Ok)
        llm.person_summary("老张", "老张是个急性子，迷上了钓鱼，不喝酒。", has="急性子")
        clock.advance(hours=1)
        assert (await summaries.refresh_stale(infra)).persons == 1
    profile = await profile_of(infra, user, "老张")
    assert profile.summary == "老张是个急性子，迷上了钓鱼，不喝酒。"
    assert profile.summary_generated_at == clock.now


async def test_a_relationship_summary_is_regenerated_after_the_pair_changes(
    infra: Infra, llm: LLMScript
) -> None:
    sc.roommates(llm)
    llm.person_summary("小李", "听说小李最近升职了。")
    llm.relationship_summary("老张", "小李", "据说两人是大学室友。")
    user = await new_user(infra)
    await sc.confirmed(infra, user, (await sc.extracted(infra, user, sc.ROOMMATES)).id)

    with tenant_scope(user.tenant):
        refreshed = await summaries.refresh_stale(infra)
    pair = await pair_of(infra, user, "老张", "小李")
    assert refreshed == summaries.Refreshed(persons=1, relationships=1, failed=0)
    assert pair.relationship is not None
    assert pair.relationship.summary == "据说两人是大学室友。"
    assert pair.relationship.summary_generated_at is not None
    # 老张 has nothing in his profile yet: no description, nothing invented
    assert (await profile_of(infra, user, "老张")).summary is None


async def test_a_summary_the_user_wrote_is_not_overwritten(infra: Infra, llm: LLMScript) -> None:
    sc.roommates(llm)
    llm.person_summary("小李", "听说小李最近升职了。")
    llm.relationship_summary("老张", "小李", "据说两人是大学室友。")
    user = await new_user(infra)
    await sc.confirmed(infra, user, (await sc.extracted(infra, user, sc.ROOMMATES)).id)
    a, b = await person_named(infra, user, "老张"), await person_named(infra, user, "小李")
    with tenant_scope(user.tenant):
        await persons.edit_relationship(
            infra, a.id, b.id, persons.RelationshipEdit(summary="我写的总结")
        )
        refreshed = await summaries.refresh_stale(infra)
    pair = await pair_of(infra, user, "老张", "小李")
    assert refreshed.relationships == 0
    assert pair.relationship is not None
    assert (pair.relationship.summary, pair.relationship.summary_generated_at) == (
        "我写的总结",
        None,
    )


async def test_a_failed_generation_stays_stale_for_the_next_refresh(
    infra: Infra, llm: LLMScript
) -> None:
    sc.dinner_with_laozhang(llm)
    llm.person_summary_timeout("老张")
    user = await new_user(infra)
    await sc.dinner_confirmed_as_in_bot2(infra, user)
    with tenant_scope(user.tenant):
        failed = await summaries.refresh_stale(infra)
        llm.person_summary("老张", LAOZHANG_SUMMARY)
        retried = await summaries.refresh_stale(infra)
    assert failed == summaries.Refreshed(persons=0, relationships=0, failed=1)
    assert retried.persons == 1
