"""Drafts: extraction -> 待确认 -> edit -> confirm / discard / retry, against the real graph.

AC-6, AC-8, AC-10, AC-11, AC-12, AC-13, AC-14, AC-15, AC-16, AC-17, AC-18, AC-19.
"""

from __future__ import annotations

import asyncio
import json
import uuid
from collections.abc import Callable
from typing import Any

import pytest
from sqlalchemy import text as sql

from tests.support import scenarios as sc
from tests.support.graph import (
    Seed,
    count_group_nodes,
    facts_by_predicate,
    persons_of,
    profile_of,
    seed,
)
from tests.support.llm_script import LLMScript
from tests.support.users import new_user
from weft.domain.confidence import Confidence, ConflictAction
from weft.domain.dates import PartialDate
from weft.domain.draft import Draft, DraftStatus, PersonMatch
from weft.domain.graph_write import AliasAdd, EpisodeWrite, GraphWrite
from weft.domain.taxonomy import Category
from weft.domain.tenancy import tenant_scope
from weft.infra import Infra
from weft.repositories.graph import GraphRepository
from weft.services import drafts, entries
from weft.services.results import Err, Ok

pytestmark = pytest.mark.service


def edited(content: Draft | None, change: Callable[[dict[str, Any]], None]) -> Draft:
    assert content is not None
    data = content.model_dump(mode="json", by_alias=True)
    change(data)
    return Draft.model_validate(data)


def by_object(content: Draft | None) -> dict[str, Any]:
    assert content is not None
    return {f.object: f for f in content.facts}


# --- AC-6 / AC-10 ------------------------------------------------------------------------


async def test_extraction_turns_the_draft_pending_with_every_item_rated(
    infra: Infra, llm: LLMScript
) -> None:
    sc.dinner_with_laozhang(llm)
    user = await new_user(infra)
    draft = await sc.extracted(infra, user, sc.DINNER)

    assert draft.status is DraftStatus.PENDING
    assert draft.content is not None
    [laozhang] = draft.content.persons
    assert (laozhang.mention, laozhang.match) == ("老张", PersonMatch.NEW)
    facts = by_object(draft.content)
    assert {o: (f.predicate, f.confidence) for o, f in facts.items()} == {
        "女儿高考": ("EXPERIENCED", Confidence.SELF_TOLD),
        "钓鱼": ("LIKES", Confidence.SELF_TOLD),
        "喝酒": ("DISLIKES", Confidence.SELF_TOLD),
    }
    assert facts["女儿高考"].valid_at == PartialDate(2027)


async def test_nothing_from_a_draft_is_in_the_graph_before_confirmation(
    infra: Infra, llm: LLMScript
) -> None:
    sc.dinner_with_laozhang(llm)
    user = await new_user(infra)
    await sc.extracted(infra, user, sc.DINNER)

    assert [p.name for p in await persons_of(infra, user)] == ["小明"]
    assert await count_group_nodes(infra, user) == 1  # only Self


# --- AC-11 -----------------------------------------------------------------------------


async def test_confirmation_writes_the_edited_items_and_skips_removed_ones(
    infra: Infra, llm: LLMScript
) -> None:
    sc.dinner_with_laozhang(llm)
    user = await new_user(infra)
    draft = await sc.extracted(infra, user, sc.DINNER)

    def change(d: dict[str, Any]) -> None:
        d["facts"] = [f for f in d["facts"] if f["object"] != "女儿高考"]
        for f in d["facts"]:
            if f["object"] == "钓鱼":
                f["confidence"] = "witnessed"

    with tenant_scope(user.tenant):
        updated = await drafts.update_draft(infra, draft.id, edited(draft.content, change))
        assert isinstance(updated, Ok)
    await sc.confirmed(infra, user, draft.id)

    profile = await profile_of(infra, user, "老张")
    likes, dislikes = facts_by_predicate(profile, "LIKES"), facts_by_predicate(profile, "DISLIKES")
    assert [(f.object, f.confidence) for f in likes] == [("钓鱼", Confidence.WITNESSED)]
    assert [(f.object, f.confidence) for f in dislikes] == [("喝酒", Confidence.SELF_TOLD)]
    assert facts_by_predicate(profile, "EXPERIENCED") == []
    assert likes[0].sources == (str(draft.entry_id),)


async def test_an_edited_relationship_type_must_be_in_the_users_vocabulary(
    infra: Infra, llm: LLMScript
) -> None:
    sc.laowang_types(llm)
    user = await new_user(infra)
    draft = await sc.extracted(infra, user, sc.LAOWANG)

    def bogus(d: dict[str, Any]) -> None:
        d["relationships"][0]["types"] = [
            {"category": "social", "subtype": "球友", "original": "打球"}
        ]

    with tenant_scope(user.tenant):
        refused = await drafts.update_draft(infra, draft.id, edited(draft.content, bogus))
    assert isinstance(refused, Err) and refused.reason == "unknown_relationship_type"


# --- AC-12 / AC-13 ---------------------------------------------------------------------


async def test_the_only_zhangwei_is_matched_directly(infra: Infra, llm: LLMScript) -> None:
    sc.laozhang_promoted(llm, sc.ZHANGWEI_PROMOTED, name="张伟")
    user = await new_user(infra)
    ids = await seed(infra, user, Seed(persons=["张伟"]))
    draft = await sc.extracted(infra, user, sc.ZHANGWEI_PROMOTED)

    assert draft.content is not None
    [person] = draft.content.persons
    assert (person.match, person.person_id, person.name) == (
        PersonMatch.MATCHED,
        ids["张伟"],
        "张伟",
    )


async def test_two_zhangs_make_laozhang_ambiguous_and_block_confirmation(
    infra: Infra, llm: LLMScript
) -> None:
    sc.laozhang_promoted(llm)
    llm.person_match("老张", decision="ambiguous", candidates=[1, 2])
    user = await new_user(infra)
    ids = await seed(
        infra,
        user,
        Seed(
            persons=["张伟", "张强"],
            relationships=[
                ("我", "张伟", Category.SOCIAL, "同事"),
                ("我", "张强", Category.SOCIAL, "邻居"),
            ],
        ),
    )
    draft = await sc.extracted(infra, user, sc.PROMOTED)

    assert draft.content is not None
    [person] = draft.content.persons
    assert person.match is PersonMatch.AMBIGUOUS
    assert {(c.person_id, c.name, c.note) for c in person.candidates or []} == {
        (ids["张伟"], "张伟", "同事"),
        (ids["张强"], "张强", "邻居"),
    }
    with tenant_scope(user.tenant):
        refused = await drafts.confirm_draft(infra, draft.id)
        assert isinstance(refused, Err) and refused.reason == "ambiguous_persons"
        assert refused.detail["mentions"] == ["老张"]
        still = await drafts.get_draft(infra, draft.id)
    assert isinstance(still, Ok) and still.value.status is DraftStatus.PENDING
    assert sorted(p.name for p in await persons_of(infra, user)) == sorted(["小明", "张伟", "张强"])


async def test_when_two_persons_share_the_alias_the_entry_context_decides(
    infra: Infra, llm: LLMScript
) -> None:
    sc.laozhang_promoted(llm)
    llm.person_match("老张", decision="matched", candidates=[2])
    user = await new_user(infra)
    ids = await seed(infra, user, Seed(persons=["张伟", "张强"]))
    with tenant_scope(user.tenant):
        await GraphRepository(infra.neo4j, user.tenant).apply(
            GraphWrite(
                episode=EpisodeWrite(
                    entry_id=str(uuid.uuid4()),
                    content="(aliases)",
                    occurred=PartialDate(2026, 1, 1),
                    kind="manual_edit",
                    created_at=infra.clock(),
                ),
                aliases=[AliasAdd(ids["张伟"], "老张"), AliasAdd(ids["张强"], "老张")],
            )
        )
    draft = await sc.extracted(infra, user, sc.PROMOTED)

    assert draft.content is not None
    [person] = draft.content.persons
    assert (person.match, person.person_id) == (PersonMatch.MATCHED, ids["张强"])


async def test_choosing_zhangwei_for_laozhang_learns_the_alias_for_next_time(
    infra: Infra, llm: LLMScript
) -> None:
    sc.laozhang_promoted(llm)
    sc.laozhang_bubble_tea(llm)  # no person_match rule: a second LLM judgement would fail
    llm.person_match("老张", decision="ambiguous", candidates=[1, 2])
    user = await new_user(infra)
    ids = await seed(infra, user, Seed(persons=["张伟", "张强"]))
    draft = await sc.extracted(infra, user, sc.PROMOTED)

    assert draft.content is not None
    with tenant_scope(user.tenant):
        chosen = draft.content.choose("老张", person_id=ids["张伟"])
        assert isinstance(await drafts.update_draft(infra, draft.id, chosen), Ok)
    await sc.confirmed(infra, user, draft.id)

    zhangwei = {p.name: p for p in await persons_of(infra, user)}["张伟"]
    assert zhangwei.aliases == ("老张",)
    llm.rules = [r for r in llm.rules if not r.name.startswith("match[")]  # no more judgements

    second = await sc.extracted(infra, user, sc.BUBBLE_TEA)
    assert second.content is not None
    [person] = second.content.persons
    assert (person.match, person.person_id) == (PersonMatch.MATCHED, ids["张伟"])


async def test_marking_an_ambiguous_mention_as_new_creates_a_new_person(
    infra: Infra, llm: LLMScript
) -> None:
    sc.laozhang_promoted(llm)
    llm.person_match("老张", decision="ambiguous", candidates=[1, 2])
    user = await new_user(infra)
    await seed(infra, user, Seed(persons=["张伟", "张强"]))
    draft = await sc.extracted(infra, user, sc.PROMOTED)

    assert draft.content is not None
    with tenant_scope(user.tenant):
        await drafts.update_draft(infra, draft.id, draft.content.choose("老张", person_id=None))
    await sc.confirmed(infra, user, draft.id)
    names = sorted(p.name for p in await persons_of(infra, user))
    assert names == sorted(["小明", "张伟", "张强", "老张"])


# --- AC-14 / AC-15 / AC-16 ----------------------------------------------------------------

BYTEDANCE = Seed(
    persons=["小李"], facts=[("小李", "WORKS_AT", "字节跳动", Confidence.SELF_TOLD, "2023")]
)


async def test_a_not_lower_confidence_conflict_updates_and_keeps_the_old_value_as_history(
    infra: Infra, llm: LLMScript
) -> None:
    sc.xiaoli_joins_alibaba(llm)
    user = await new_user(infra)
    await seed(infra, user, BYTEDANCE)
    draft = await sc.extracted(infra, user, sc.TO_ALIBABA)

    fact = by_object(draft.content)["阿里巴巴"]
    assert fact.conflict is not None
    assert (fact.conflict.old, fact.conflict.action) == ("字节跳动", ConflictAction.UPDATE)

    await sc.confirmed(infra, user, draft.id)
    jobs = {
        f.object: f for f in facts_by_predicate(await profile_of(infra, user, "小李"), "WORKS_AT")
    }
    assert jobs["阿里巴巴"].current and jobs["阿里巴巴"].valid_at == PartialDate(2026, 10)
    assert not jobs["字节跳动"].current  # kept, as history
    assert jobs["字节跳动"].invalid_at == PartialDate(2026, 10)
    assert jobs["字节跳动"].valid_at == PartialDate(2023)


async def test_a_lower_confidence_conflict_is_kept_unverified_without_overwriting(
    infra: Infra, llm: LLMScript
) -> None:
    sc.xiaoli_joins_alibaba(llm)
    sc.xiaoli_joins_tencent(llm)
    user = await new_user(infra)
    await seed(infra, user, BYTEDANCE)
    await sc.confirmed(infra, user, (await sc.extracted(infra, user, sc.TO_ALIBABA)).id)

    draft = await sc.extracted(infra, user, sc.TO_TENCENT)
    fact = by_object(draft.content)["腾讯"]
    assert fact.conflict is not None
    assert (fact.conflict.old, fact.conflict.action) == ("阿里巴巴", ConflictAction.UNVERIFIED)

    await sc.confirmed(infra, user, draft.id)
    jobs = {
        f.object: f for f in facts_by_predicate(await profile_of(infra, user, "小李"), "WORKS_AT")
    }
    assert jobs["阿里巴巴"].current
    assert jobs["腾讯"].unverified and not jobs["腾讯"].current
    assert jobs["腾讯"].confidence is Confidence.HEARSAY


async def test_raising_the_confidence_in_the_draft_makes_the_conflict_an_update(
    infra: Infra, llm: LLMScript
) -> None:
    sc.xiaoli_joins_tencent(llm)
    user = await new_user(infra)
    await seed(infra, user, BYTEDANCE)
    draft = await sc.extracted(infra, user, sc.TO_TENCENT)

    def witnessed(d: dict[str, Any]) -> None:
        d["facts"][0]["confidence"] = "witnessed"

    with tenant_scope(user.tenant):
        await drafts.update_draft(infra, draft.id, edited(draft.content, witnessed))
    await sc.confirmed(infra, user, draft.id)
    jobs = {
        f.object: f for f in facts_by_predicate(await profile_of(infra, user, "小李"), "WORKS_AT")
    }
    assert jobs["腾讯"].current and not jobs["腾讯"].unverified
    assert not jobs["字节跳动"].current
    assert jobs["字节跳动"].invalid_at == PartialDate(2026, 11, 16)  # the Entry's occurred date


# --- AC-8 --------------------------------------------------------------------------------


async def test_relative_times_are_resolved_against_the_occurred_date(
    infra: Infra, llm: LLMScript
) -> None:
    sc.weekend_fishing(llm)
    user = await new_user(infra)
    draft = await sc.extracted(infra, user, sc.FISHING_WEEKEND, occurred="2026-11-16")
    await sc.confirmed(infra, user, draft.id)

    events = {
        f.object: f
        for f in facts_by_predicate(await profile_of(infra, user, "老张"), "EXPERIENCED")
    }
    assert (events["和我去钓鱼"].valid_at, events["和我去钓鱼"].invalid_at) == (
        PartialDate(2026, 11, 14),
        PartialDate(2026, 11, 15),
    )
    assert events["在杭州买房"].valid_at == PartialDate(2025)


async def test_a_year_precision_entry_never_yields_a_month_or_day(
    infra: Infra, llm: LLMScript
) -> None:
    sc.club_2015(llm)
    user = await new_user(infra)
    draft = await sc.extracted(infra, user, sc.CLUB_2015, occurred="2015")

    assert draft.content is not None
    assert draft.content.facts[0].valid_at == PartialDate(2015)
    assert draft.content.relationships[0].met_at == PartialDate(2015)
    await sc.confirmed(infra, user, draft.id)
    [event] = facts_by_predicate(await profile_of(infra, user, "小李"), "EXPERIENCED")
    assert event.valid_at == PartialDate(2015)


# --- AC-17 -------------------------------------------------------------------------------


async def test_discarding_leaves_the_graph_untouched_and_marks_the_entry(
    infra: Infra, llm: LLMScript
) -> None:
    sc.dinner_with_laozhang(llm)
    user = await new_user(infra)
    before = await count_group_nodes(infra, user)
    draft = await sc.extracted(infra, user, sc.DINNER)

    with tenant_scope(user.tenant):
        result = await drafts.discard_draft(infra, draft.id)
        assert isinstance(result, Ok) and result.value.status is DraftStatus.DISCARDED
        [(entry, entry_draft)] = await entries.list_entries(infra)
        refused = await drafts.confirm_draft(infra, draft.id)
    assert entry.text == sc.DINNER
    assert entry_draft is not None and entry_draft.status is DraftStatus.DISCARDED
    assert isinstance(refused, Err) and refused.reason == "not_pending"
    assert await count_group_nodes(infra, user) == before


# --- AC-18 -------------------------------------------------------------------------------


async def test_unparseable_llm_output_fails_the_draft_and_keeps_the_text(
    infra: Infra, llm: LLMScript
) -> None:
    sc.graphiti_only(llm, sc.GARBLED)
    llm.enrichment_raw(sc.GARBLED, "抱歉，我暂时无法处理这条记录。")
    user = await new_user(infra)
    draft = await sc.extracted(infra, user, sc.GARBLED)

    assert draft.status is DraftStatus.FAILED
    assert draft.error is not None and draft.error.startswith(drafts.EXTRACTION_FAILED)
    with tenant_scope(user.tenant):
        [(entry, _)] = await entries.list_entries(infra)
    assert entry.text == sc.GARBLED
    assert await count_group_nodes(infra, user) == 1


HIKING = "周末和老周去爬山了"
TEA = "晚上和老周喝了茶"
_FRIEND = {
    "pair": ["我", "老周"],
    "types": [{"category": "social", "subtype": "朋友", "original": "朋友"}],
    "confidence": "witnessed",
}
# profile item without its person, feeling without its confidence
_INVALID_ENRICHMENT = {
    "facts": [],
    "relationships": [_FRIEND],
    "feelings": [{"from": "我", "to": "老周", "dimension": "closeness", "level": "close"}],
    "profile": [{"field": "gender", "value": "男", "confidence": "witnessed"}],
}


async def test_invalid_enrichment_is_sent_back_once_with_its_validation_errors(
    infra: Infra, llm: LLMScript
) -> None:
    sc.graphiti_only(llm, HIKING)
    llm.enrichment_raw(HIKING, json.dumps(_INVALID_ENRICHMENT, ensure_ascii=False))
    fixed = {
        **_INVALID_ENRICHMENT,
        "feelings": [{**_INVALID_ENRICHMENT["feelings"][0], "confidence": "witnessed"}],
        "profile": [{**_INVALID_ENRICHMENT["profile"][0], "person": "老周"}],
    }
    llm.enrichment_retry(HIKING, json.dumps(fixed, ensure_ascii=False), feedback="profile.0.person")
    user = await new_user(infra)
    draft = await sc.extracted(infra, user, HIKING)

    assert draft.status is DraftStatus.PENDING and draft.content is not None
    assert [(f.from_, f.to, f.confidence) for f in draft.content.feelings] == [
        ("我", "老周", Confidence.WITNESSED)
    ]
    assert [(p.person, p.value) for p in draft.content.profile] == [("老周", "男")]


async def test_still_invalid_enrichment_drops_only_the_invalid_items(
    infra: Infra, llm: LLMScript
) -> None:
    sc.graphiti_only(llm, TEA)
    invalid = json.dumps(_INVALID_ENRICHMENT, ensure_ascii=False)
    llm.enrichment_raw(TEA, invalid)
    llm.enrichment_retry(TEA, invalid, feedback="feelings.0.confidence")
    user = await new_user(infra)
    draft = await sc.extracted(infra, user, TEA)

    assert draft.status is DraftStatus.PENDING and draft.content is not None
    assert [r.pair for r in draft.content.relationships] == [("我", "老周")]
    assert draft.content.feelings == [] and draft.content.profile == []
    assert sorted(p.mention for p in draft.content.persons) == ["我", "老周"]


async def test_after_a_timeout_a_retry_reaches_pending(infra: Infra, llm: LLMScript) -> None:
    sc.graphiti_only(llm, sc.FLAKY)
    llm.enrichment_timeout(sc.FLAKY)
    user = await new_user(infra)
    failed = await sc.extracted(infra, user, sc.FLAKY)
    assert failed.status is DraftStatus.FAILED

    sc.flaky_ok(llm)  # the provider recovers
    with tenant_scope(user.tenant):
        retried = await drafts.retry_extraction(infra, failed.id)
        assert isinstance(retried, Ok) and retried.value.status is DraftStatus.EXTRACTING
        done = await drafts.run_extraction(infra, failed.id)
    assert isinstance(done, Ok) and done.value.status is DraftStatus.PENDING
    assert done.value.content is not None and done.value.error is None
    assert [p.mention for p in done.value.content.persons] == ["老周", "我"]


async def test_only_a_failed_draft_can_be_retried(infra: Infra, llm: LLMScript) -> None:
    sc.dinner_with_laozhang(llm)
    user = await new_user(infra)
    draft = await sc.extracted(infra, user, sc.DINNER)
    with tenant_scope(user.tenant):
        refused = await drafts.retry_extraction(infra, draft.id)
    assert isinstance(refused, Err) and refused.reason == "not_failed"


# --- AC-19 -------------------------------------------------------------------------------


async def _laozhang_counts(infra: Infra, group_id: str) -> tuple[int, int, int]:
    async with infra.neo4j.session() as session:
        result = await session.run(
            """
            MATCH (p:Person {group_id: $g, name: '老张'})
            OPTIONAL MATCH (p)-[r:RELATES_TO]->()
            WITH count(DISTINCT p) AS persons, count(DISTINCT r) AS facts
            MATCH (e:Episodic {group_id: $g})
            RETURN persons, facts, count(e) AS episodes
            """,
            g=group_id,
        )
        record = await result.single()
    assert record is not None
    return record["persons"], record["facts"], record["episodes"]


async def test_confirming_the_same_draft_twice_writes_once(infra: Infra, llm: LLMScript) -> None:
    sc.dinner_with_laozhang(llm)
    user = await new_user(infra)
    draft = await sc.extracted(infra, user, sc.DINNER)
    first = await sc.confirmed(infra, user, draft.id)
    again = await sc.confirmed(infra, user, draft.id)
    assert first.status is again.status is DraftStatus.CONFIRMED
    assert await _laozhang_counts(infra, user.tenant.group_id) == (1, 3, 1)


async def test_concurrent_confirmations_write_once(infra: Infra, llm: LLMScript) -> None:
    sc.dinner_with_laozhang(llm)
    user = await new_user(infra)
    draft = await sc.extracted(infra, user, sc.DINNER)

    async def confirm() -> Ok | Err:  # type: ignore[type-arg]
        with tenant_scope(user.tenant):
            return await drafts.confirm_draft(infra, draft.id)

    results = await asyncio.gather(*(confirm() for _ in range(4)))
    assert all(isinstance(r, Ok) for r in results)
    assert await _laozhang_counts(infra, user.tenant.group_id) == (1, 3, 1)


async def test_a_graph_write_failing_half_way_keeps_the_draft_pending_and_retryable(
    infra: Infra, llm: LLMScript
) -> None:
    sc.dinner_with_laozhang(llm)
    user = await new_user(infra)
    draft = await sc.extracted(infra, user, sc.DINNER)

    def fail_at_facts(step: str) -> None:
        if step == "facts":
            raise ConnectionError("neo4j went away")

    infra.graph_fault_hook = fail_at_facts
    with tenant_scope(user.tenant):
        failed = await drafts.confirm_draft(infra, draft.id)
        assert isinstance(failed, Err) and failed.reason == "graph_write_failed"
        still = await drafts.get_draft(infra, draft.id)
    assert isinstance(still, Ok) and still.value.status is DraftStatus.PENDING
    assert await count_group_nodes(infra, user) == 1  # rolled back: only Self

    infra.graph_fault_hook = None
    await sc.confirmed(infra, user, draft.id)
    assert await _laozhang_counts(infra, user.tenant.group_id) == (1, 3, 1)


async def test_graph_written_but_draft_left_pending_reconfirms_without_duplicates(
    infra: Infra, llm: LLMScript
) -> None:
    """The cross-store gap (spec 「风险」): Neo4j committed, the Postgres update was lost."""
    sc.dinner_with_laozhang(llm)
    user = await new_user(infra)
    draft = await sc.extracted(infra, user, sc.DINNER)
    await sc.confirmed(infra, user, draft.id)
    async with infra.sql.begin() as session:  # simulate the lost status update
        await session.execute(
            sql("UPDATE drafts SET status = 'pending' WHERE id = :id"), {"id": draft.id}
        )

    again = await sc.confirmed(infra, user, draft.id)
    assert again.status is DraftStatus.CONFIRMED
    assert await _laozhang_counts(infra, user.tenant.group_id) == (1, 3, 1)


async def test_unknown_draft_is_not_found(infra: Infra) -> None:
    user = await new_user(infra)
    with tenant_scope(user.tenant):
        for call in (drafts.get_draft, drafts.confirm_draft, drafts.discard_draft):
            result = await call(infra, uuid.uuid4())
            assert isinstance(result, Err) and result.reason == "not_found"
