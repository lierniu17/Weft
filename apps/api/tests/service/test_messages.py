"""消息: recognition, routing, quota, time and re-routing, with replayed model answers.

Intent-routing spec AC-2 (four intents, low-confidence fallback, recognition is free),
AC-3 (record), AC-4 (ask), AC-5 (record + ask, the answer never cites the new Draft),
AC-6 (chitchat), AC-7 (one used-up quota does not block the other), AC-8 (occurred date
from the message, extraction reference time, AC-9 backend: moving it re-times the Draft),
AC-10 (改为记录 / 改为提问).
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import pytest

from tests import conftest
from tests.support import scenarios as sc
from tests.support.asks import PROFILE, final, laozhang_profile
from tests.support.llm_script import LLMScript, Rule
from tests.support.seeded import SeededUser, seeded_user
from tests.support.users import new_user
from weft.domain.answer import AnswerKind
from weft.domain.dates import PartialDate, Precision
from weft.domain.draft import DraftStatus
from weft.domain.intent import UNCERTAIN_REPLY, Intent
from weft.domain.quota import LIMIT_REACHED_MESSAGE
from weft.domain.tenancy import tenant_scope
from weft.infra import Infra
from weft.repositories.graph import GraphRepository
from weft.services import drafts, entries, messages, usage
from weft.services.results import Err, Ok

pytestmark = pytest.mark.service


@pytest.fixture
async def s(infra: Infra) -> AsyncIterator[SeededUser]:
    seeded = await seeded_user(infra)
    with tenant_scope(seeded.user.tenant):
        yield seeded


@pytest.fixture
async def me(infra: Infra) -> AsyncIterator[conftest.TestUser]:
    user = await new_user(infra)
    with tenant_scope(user.tenant):
        yield user


async def sent(infra: Infra, text: str) -> messages.Handled:
    result = await messages.send(infra, text)
    assert isinstance(result, Ok), result
    return result.value


async def used(infra: Infra) -> tuple[int, int]:
    report = await usage.today(infra)
    return report.entry.used, report.ask.used


async def extract(infra: Infra, handled: messages.Handled) -> None:
    assert handled.new_draft_id is not None
    assert isinstance(await drafts.run_extraction(infra, handled.new_draft_id), Ok)


def answer_text(handled: messages.Handled) -> str:
    answer = handled.view.message.answer
    assert answer is not None
    return "".join(seg.text for seg in answer.segments)


ABOUT_LAOZHANG = "帮我看看老张这人怎么样"


def profile_answer(llm: LLMScript, question: str) -> None:
    """The model reads 老张's profile and answers from it (seed graph: E1 急性子, E2 靠谱)."""
    llm.ask(
        question,
        [("read_profile", {"person": "老张"})],
        final("text", ("老张（张伟）是你在字节跳动的同事，是个急性子。", ["E1"]), persons=["P1"]),
    )


# --- AC-3: record -------------------------------------------------------------------------


async def test_a_record_creates_an_entry_and_a_draft_and_counts_one_entry(
    infra: Infra, llm: LLMScript, me: conftest.TestUser
) -> None:
    llm.intent(sc.DINNER, "record")
    sc.dinner_with_laozhang(llm)

    handled = await sent(infra, sc.DINNER)

    view = handled.view
    assert (view.message.intent, view.message.recognized_intent) == (Intent.RECORD, Intent.RECORD)
    assert (view.message.confidence, view.message.uncertain) == (0.93, False)
    assert view.entry is not None and view.entry.text == sc.DINNER
    assert view.entry.occurred == PartialDate(2026, 11, 16)  # no time said: today
    assert view.draft is not None and view.draft.status is DraftStatus.EXTRACTING
    assert handled.new_draft_id == view.draft.id
    assert view.message.answer is None and view.message.reply is None
    assert view.message.problems == ()
    assert await used(infra) == (1, 0)
    await extract(infra, handled)
    [(entry, draft)] = await entries.list_entries(infra)
    assert entry.id == view.entry.id and draft is not None and draft.status is DraftStatus.PENDING


# --- AC-4: ask ----------------------------------------------------------------------------


async def test_a_question_is_answered_with_citations_and_counts_one_ask(
    infra: Infra, llm: LLMScript, s: SeededUser
) -> None:
    llm.intent(ABOUT_LAOZHANG, "ask")
    profile_answer(llm, ABOUT_LAOZHANG)

    handled = await sent(infra, ABOUT_LAOZHANG)

    m = handled.view.message
    assert (m.intent, m.confidence) == (Intent.ASK, 0.93)
    assert m.answer is not None and m.answer.kind is AnswerKind.TEXT
    assert {c.entry_id for c in m.answer.citations} <= set(s.entries)
    assert "急性子" in answer_text(handled)
    assert handled.view.entry is None and handled.new_draft_id is None
    assert await used(infra) == (0, 1)
    assert len(await entries.list_entries(infra)) == len(s.entries)  # only the seed's


async def test_a_clear_question_skips_the_recognition_call(
    infra: Infra, llm: LLMScript, s: SeededUser
) -> None:
    laozhang_profile(llm)  # 「老张是个什么样的人？」; no intent rule: a call would fail
    handled = await sent(infra, PROFILE)
    assert handled.view.message.intent is Intent.ASK
    assert handled.view.message.answer is not None
    assert await used(infra) == (0, 1)


async def test_an_answer_the_graph_does_not_have_is_still_an_answer(
    infra: Infra, llm: LLMScript, me: conftest.TestUser
) -> None:
    question = "帮我查下老马孩子叫啥"
    llm.intent(question, "ask")
    llm.ask(question, [("find_person", {"name": "老马"})], final("no_answer"))
    handled = await sent(infra, question)
    answer = handled.view.message.answer
    assert answer is not None and answer.kind is AnswerKind.NO_ANSWER
    assert list(answer.citations) == []


# --- AC-5: record + ask -------------------------------------------------------------------

MIXED = "老张今天升职了，他是个啥样的人来着"


async def test_record_and_ask_does_both_and_the_answer_never_cites_the_new_draft(
    infra: Infra, llm: LLMScript, s: SeededUser
) -> None:
    llm.intent(MIXED, "record_ask", record_text=sc.PROMOTED, question=PROFILE)
    sc.laozhang_promoted(llm)
    laozhang_profile(llm)

    handled = await sent(infra, MIXED)

    view = handled.view
    m = view.message
    assert (m.intent, m.record_text, m.question) == (Intent.RECORD_ASK, sc.PROMOTED, PROFILE)
    assert view.entry is not None and view.entry.text == sc.PROMOTED  # only the new information
    assert m.text == MIXED
    assert m.answer is not None
    cited = {c.entry_id for c in m.answer.citations}
    assert cited and cited <= set(s.entries)
    assert str(view.entry.id) not in cited
    assert "升职" not in answer_text(handled)
    assert await used(infra) == (1, 1)

    await extract(infra, handled)  # the Draft is pending; the graph still knows nothing of it
    g = GraphRepository(infra.neo4j, s.user.tenant)
    persons, facts = await g.produced_by(str(view.entry.id))
    assert (persons, facts) == ([], [])


# --- AC-6 / AC-2: chitchat and the low-confidence fallback ------------------------------------


async def test_chitchat_gets_a_short_reply_and_nothing_else(
    infra: Infra, llm: LLMScript, me: conftest.TestUser
) -> None:
    llm.intent("谢谢", "chitchat", confidence=0.98, reply="不客气")

    handled = await sent(infra, "谢谢")

    m = handled.view.message
    assert (m.intent, m.uncertain, m.reply) == (Intent.CHITCHAT, False, "不客气")
    assert m.answer is None and handled.view.entry is None and handled.new_draft_id is None
    assert await used(infra) == (0, 0)  # recognition is free
    assert await entries.list_entries(infra) == []


@pytest.mark.parametrize("read_as", ["record", "ask", "record_ask"])
async def test_below_the_threshold_nothing_is_recorded_or_asked(
    infra: Infra, llm: LLMScript, me: conftest.TestUser, read_as: str
) -> None:
    text = {
        "record": "老张最近好像换工作了吧",
        "ask": "小王是不是搬家了来着",
        "record_ask": "老李好像结婚了吧",
    }[read_as]
    llm.intent(text, read_as, confidence=0.55, record_text=text, question="老张换工作了吗？")

    handled = await sent(infra, text)

    m = handled.view.message
    assert (m.intent, m.recognized_intent, m.uncertain) == (Intent.CHITCHAT, Intent.CHITCHAT, True)
    assert (m.confidence, m.reply) == (0.55, UNCERTAIN_REPLY)
    assert m.answer is None and handled.view.entry is None
    assert await used(infra) == (0, 0)


async def test_the_threshold_is_a_setting(
    infra: Infra, llm: LLMScript, me: conftest.TestUser
) -> None:
    infra.settings = infra.settings.model_copy(update={"intent_confidence_threshold": 0.5})
    text = "老周好像换工作了吧"
    llm.intent(text, "record", confidence=0.55)
    assert (await sent(infra, text)).view.message.intent is Intent.RECORD


async def test_a_recognition_failure_lets_the_user_choose(
    infra: Infra, llm: LLMScript, me: conftest.TestUser
) -> None:
    llm.intent_timeout("老张那事")
    m = (await sent(infra, "老张那事")).view.message
    assert (m.intent, m.uncertain, m.confidence, m.reply) == (
        Intent.CHITCHAT,
        True,
        0.0,
        UNCERTAIN_REPLY,
    )
    assert await used(infra) == (0, 0)


@pytest.mark.parametrize("text", ["", "   ", "字" * 5001])
async def test_blank_or_overlong_messages_are_refused_without_recognition(
    infra: Infra, me: conftest.TestUser, text: str
) -> None:
    result = await messages.send(infra, text)
    assert isinstance(result, Err) and result.reason in {"blank_text", "text_too_long"}
    page = await messages.list_messages(infra)
    assert isinstance(page, Ok) and page.value.messages == []


# --- AC-7: quotas ---------------------------------------------------------------------------


async def test_a_used_up_entry_quota_still_answers_questions(
    infra: Infra, llm: LLMScript, s: SeededUser
) -> None:
    infra.settings = infra.settings.model_copy(update={"daily_entry_limit": 0})
    llm.intent(sc.PROMOTED, "record")
    llm.intent(ABOUT_LAOZHANG, "ask")
    profile_answer(llm, ABOUT_LAOZHANG)

    refused = (await sent(infra, sc.PROMOTED)).view
    asked = (await sent(infra, ABOUT_LAOZHANG)).view

    assert refused.entry is None and refused.message.intent is Intent.RECORD
    [problem] = refused.message.problems
    assert (problem.part, problem.error, problem.message) == (
        "record",
        "quota_exceeded",
        LIMIT_REACHED_MESSAGE,
    )
    assert problem.resets_at is not None and problem.resets_at.isoformat() == (
        "2026-11-17T00:00:00+08:00"
    )
    assert asked.message.answer is not None and asked.message.problems == ()
    assert await used(infra) == (0, 1)


async def test_a_used_up_ask_quota_still_records(
    infra: Infra, llm: LLMScript, me: conftest.TestUser
) -> None:
    infra.settings = infra.settings.model_copy(update={"daily_ask_limit": 0})
    llm.intent(ABOUT_LAOZHANG, "ask")
    llm.intent(sc.PROMOTED, "record")

    refused = (await sent(infra, ABOUT_LAOZHANG)).view
    recorded = await sent(infra, sc.PROMOTED)

    assert refused.message.answer is None
    assert [(p.part, p.error) for p in refused.message.problems] == [("ask", "quota_exceeded")]
    assert recorded.view.entry is not None and recorded.new_draft_id is not None
    assert await used(infra) == (1, 0)


async def test_record_and_ask_with_one_quota_used_up_does_the_other_part(
    infra: Infra, llm: LLMScript, s: SeededUser
) -> None:
    llm.intent(MIXED, "record_ask", record_text=sc.PROMOTED, question=PROFILE)
    laozhang_profile(llm)

    infra.settings = infra.settings.model_copy(update={"daily_entry_limit": 0})
    no_record = (await sent(infra, MIXED)).view
    assert no_record.entry is None and no_record.message.answer is not None
    assert [(p.part, p.error) for p in no_record.message.problems] == [("record", "quota_exceeded")]

    infra.settings = infra.settings.model_copy(
        update={"daily_entry_limit": 50, "daily_ask_limit": 1}  # the first message used it
    )
    no_answer = (await sent(infra, MIXED)).view
    assert no_answer.entry is not None and no_answer.message.answer is None
    assert [(p.part, p.error) for p in no_answer.message.problems] == [("ask", "quota_exceeded")]
    assert await used(infra) == (1, 1)


async def test_a_failed_answer_is_reported_and_the_record_part_stays(
    infra: Infra, llm: LLMScript, s: SeededUser
) -> None:
    llm.intent(MIXED, "record_ask", record_text=sc.PROMOTED, question=PROFILE)
    llm.rules.append(
        Rule(
            "ask-timeout",
            lambda b: any(t["function"]["name"] == "final_answer" for t in b.get("tools") or []),
            None,
        )
    )
    view = (await sent(infra, MIXED)).view
    assert view.entry is not None and view.message.answer is None
    assert [(p.part, p.error) for p in view.message.problems] == [("ask", "ask_failed")]


# --- AC-8: the occurred date comes from the message -------------------------------------------

DATED = "2015 年读大学时在社团认识了小李"


def met_xiaoli_in_2015(llm: LLMScript) -> None:
    llm.graphiti_entities(DATED, [("小李", "Person")])
    llm.graphiti_facts(DATED, [])
    llm.enrichment(
        DATED,
        {
            "persons": ["小李"],
            "facts": [],
            "relationships": [
                {
                    "pair": ["我", "小李"],
                    "types": [{"category": "social", "subtype": "同学", "original": "社团认识"}],
                    "met_at": "2015",
                    "origin": "大学社团",
                    "confidence": "witnessed",
                }
            ],
            "feelings": [],
            "profile": [],
        },
        written_on="2026-11-16",  # 「2015 年」 is the occurred date; today is the day of writing
    )


async def test_an_explicit_year_dates_the_entry_with_year_precision(
    infra: Infra, llm: LLMScript, me: conftest.TestUser
) -> None:
    llm.intent(DATED, "record", occurred="2015")
    met_xiaoli_in_2015(llm)

    handled = await sent(infra, DATED)

    entry = handled.view.entry
    assert entry is not None
    assert (entry.occurred, entry.occurred.precision) == (PartialDate(2015), Precision.YEAR)
    assert handled.view.message.occurred == PartialDate(2015)
    await extract(infra, handled)  # sent with occurred 2015 and written_on today
    result = await drafts.get_draft(infra, handled.new_draft_id or uuid.uuid4())
    assert isinstance(result, Ok) and result.value.content is not None
    assert result.value.content.relationships[0].met_at == PartialDate(2015)


WEEKEND = "上周末和老张去钓鱼了"


async def test_a_relative_day_dates_the_entry_and_relative_times_use_the_day_of_writing(
    infra: Infra, llm: LLMScript, me: conftest.TestUser
) -> None:
    llm.intent(WEEKEND, "record", occurred="2026-11-14")  # today is Monday 2026-11-16
    llm.graphiti_entities(WEEKEND, [("老张", "Person"), ("钓鱼", "LifeEvent")])
    llm.graphiti_facts(WEEKEND, [sc._fact("老张", "EXPERIENCED", "钓鱼", "上周末我和老张去钓鱼")])
    llm.enrichment(
        WEEKEND,
        sc._enriched(
            facts=[
                {
                    "index": 0,
                    "subject": "老张",
                    "predicate": "EXPERIENCED",
                    "object": "和我去钓鱼",
                    "confidence": "witnessed",
                    "valid_at": "2026-11-14",
                    "valid_to": "2026-11-15",
                }
            ]
        ),
        written_on="2026-11-16",
    )

    handled = await sent(infra, WEEKEND)

    entry = handled.view.entry
    assert entry is not None and entry.occurred == PartialDate(2026, 11, 14)
    assert entry.written_on is not None and entry.written_on.isoformat() == "2026-11-16"
    await extract(infra, handled)


async def test_a_future_date_from_the_model_falls_back_to_today(
    infra: Infra, llm: LLMScript, me: conftest.TestUser
) -> None:
    text = "老张下周要去上海出差"
    llm.intent(text, "record", occurred="2026-11-23")
    entry = (await sent(infra, text)).view.entry
    assert entry is not None and entry.occurred == PartialDate(2026, 11, 16)


# --- AC-9 (backend): moving the occurred date re-times the Draft ----------------------------


async def pending_dated_draft(infra: Infra, llm: LLMScript) -> messages.Handled:
    llm.intent(DATED, "record", occurred="2015")
    met_xiaoli_in_2015(llm)
    handled = await sent(infra, DATED)
    await extract(infra, handled)
    return handled


async def test_moving_the_occurred_date_re_times_the_draft_without_re_extracting(
    infra: Infra, llm: LLMScript, me: conftest.TestUser
) -> None:
    handled = await pending_dated_draft(infra, llm)
    draft_id = handled.new_draft_id
    assert draft_id is not None
    current = await drafts.get_draft(infra, draft_id)
    assert isinstance(current, Ok) and current.value.content is not None
    calls = sum(rule.used for rule in llm.rules)

    moved = await drafts.update_draft(infra, draft_id, current.value.content, PartialDate(2016))

    assert isinstance(moved, Ok) and moved.value.content is not None
    assert moved.value.content.relationships[0].met_at == PartialDate(2016)
    assert moved.value.status is DraftStatus.PENDING
    assert sum(rule.used for rule in llm.rules) == calls  # no model call
    [(entry, _)] = await entries.list_entries(infra)
    assert (entry.occurred, entry.occurred.precision) == (PartialDate(2016), Precision.YEAR)


async def test_the_occurred_date_cannot_move_into_the_future_or_after_confirmation(
    infra: Infra, llm: LLMScript, me: conftest.TestUser
) -> None:
    handled = await pending_dated_draft(infra, llm)
    draft_id = handled.new_draft_id
    assert draft_id is not None
    current = await drafts.get_draft(infra, draft_id)
    assert isinstance(current, Ok) and current.value.content is not None
    content = current.value.content

    future = await drafts.update_draft(infra, draft_id, content, PartialDate(2026, 11, 17))
    assert isinstance(future, Err) and future.reason == "future_date"
    assert isinstance(await drafts.confirm_draft(infra, draft_id), Ok)
    late = await drafts.update_draft(infra, draft_id, content, PartialDate(2016))
    assert isinstance(late, Err) and late.reason == "not_pending"
    [(entry, _)] = await entries.list_entries(infra)
    assert entry.occurred == PartialDate(2015)


# --- AC-10: 改为提问 / 改为记录 -------------------------------------------------------------


async def test_record_rerouted_to_ask_discards_the_pending_draft_and_answers(
    infra: Infra, llm: LLMScript, s: SeededUser
) -> None:
    text = "老张平时喜欢什么"
    llm.intent(text, "record")
    sc.laozhang_promoted(llm, text)  # whatever the model extracts from it
    profile_answer(llm, text)
    handled = await sent(infra, text)
    await extract(infra, handled)

    rerouted = await messages.reroute(infra, handled.view.message.id, Intent.ASK)

    assert isinstance(rerouted, Ok), rerouted
    view = rerouted.value.view
    assert (view.message.intent, view.message.recognized_intent) == (Intent.ASK, Intent.RECORD)
    assert view.message.answer is not None
    assert view.draft is not None and view.draft.status is DraftStatus.DISCARDED
    assert await used(infra) == (1, 1)  # the entry is not given back


async def test_a_confirmed_record_cannot_become_a_question(
    infra: Infra, llm: LLMScript, me: conftest.TestUser
) -> None:
    llm.intent(sc.PROMOTED, "record")
    sc.laozhang_promoted(llm)
    handled = await sent(infra, sc.PROMOTED)
    await extract(infra, handled)
    assert handled.new_draft_id is not None
    assert isinstance(await drafts.confirm_draft(infra, handled.new_draft_id), Ok)

    refused = await messages.reroute(infra, handled.view.message.id, Intent.ASK)

    assert isinstance(refused, Err) and refused.reason == "already_confirmed"
    assert await used(infra) == (1, 0)


async def test_a_question_rerouted_to_record_makes_a_draft_and_counts_an_entry(
    infra: Infra, llm: LLMScript, me: conftest.TestUser
) -> None:
    text = "老张最近是不是换工作了"
    llm.intent(text, "ask", confidence=0.9, occurred="2026-11")
    llm.ask(text, [("find_person", {"name": "老张"})], final("no_answer"))
    handled = await sent(infra, text)

    rerouted = await messages.reroute(infra, handled.view.message.id, Intent.RECORD)

    assert isinstance(rerouted, Ok), rerouted
    view = rerouted.value.view
    assert view.message.intent is Intent.RECORD and view.message.answer is None
    assert view.entry is not None and view.entry.text == text
    assert view.entry.occurred == PartialDate(2026, 11)  # the recognized date is kept
    assert view.draft is not None and rerouted.value.new_draft_id == view.draft.id
    assert await used(infra) == (1, 1)


async def test_uncertain_chitchat_can_be_recorded_or_asked(
    infra: Infra, llm: LLMScript, s: SeededUser
) -> None:
    text = "老张这人到底咋样"
    llm.intent(text, "ask", confidence=0.4)
    profile_answer(llm, text)
    handled = await sent(infra, text)
    assert handled.view.message.uncertain

    rerouted = await messages.reroute(infra, handled.view.message.id, Intent.ASK)  # 帮我查

    assert isinstance(rerouted, Ok)
    m = rerouted.value.view.message
    assert (m.intent, m.reply) == (Intent.ASK, None) and m.answer is not None
    assert await used(infra) == (0, 1)


async def test_rerouting_to_ask_with_the_ask_quota_used_up_changes_nothing(
    infra: Infra, llm: LLMScript, me: conftest.TestUser
) -> None:
    infra.settings = infra.settings.model_copy(update={"daily_ask_limit": 0})
    llm.intent(sc.PROMOTED, "record")
    sc.laozhang_promoted(llm)
    handled = await sent(infra, sc.PROMOTED)
    await extract(infra, handled)

    refused = await messages.reroute(infra, handled.view.message.id, Intent.ASK)

    assert isinstance(refused, Err) and refused.reason == "quota_exceeded"
    assert handled.new_draft_id is not None
    draft = await drafts.get_draft(infra, handled.new_draft_id)
    assert isinstance(draft, Ok) and draft.value.status is DraftStatus.PENDING
    page = await messages.list_messages(infra)
    assert isinstance(page, Ok) and page.value.messages[0].message.intent is Intent.RECORD


async def test_record_and_ask_cannot_be_rerouted(
    infra: Infra, llm: LLMScript, s: SeededUser
) -> None:
    llm.intent(MIXED, "record_ask", record_text=sc.PROMOTED, question=PROFILE)
    laozhang_profile(llm)
    handled = await sent(infra, MIXED)
    for target in (Intent.ASK, Intent.RECORD):
        refused = await messages.reroute(infra, handled.view.message.id, target)
        assert isinstance(refused, Err) and refused.reason == "not_reroutable"


async def test_another_users_message_is_not_found(
    infra: Infra, llm: LLMScript, me: conftest.TestUser
) -> None:
    llm.intent("谢谢", "chitchat", confidence=0.98, reply="不客气")
    mine = (await sent(infra, "谢谢")).view.message.id
    other = await new_user(infra)
    with tenant_scope(other.tenant):
        for target in (Intent.RECORD, Intent.ASK):
            result = await messages.reroute(infra, mine, target)
            assert isinstance(result, Err) and result.reason == "not_found"
        page = await messages.list_messages(infra)
        assert isinstance(page, Ok) and page.value.messages == []
        assert isinstance(await messages.list_messages(infra, before=mine), Err)


# --- the chat history ------------------------------------------------------------------------


async def test_messages_are_listed_newest_last_in_pages(
    infra: Infra, llm: LLMScript, me: conftest.TestUser
) -> None:
    texts = [f"第{i}句" for i in range(5)]
    for t in texts:
        llm.intent(t, "chitchat", reply="嗯")
    for t in texts:
        await sent(infra, t)

    first = await messages.list_messages(infra, limit=2)
    assert isinstance(first, Ok)
    assert [v.message.text for v in first.value.messages] == ["第3句", "第4句"]
    assert first.value.has_more
    older = await messages.list_messages(infra, before=first.value.messages[0].message.id, limit=10)
    assert isinstance(older, Ok)
    assert [v.message.text for v in older.value.messages] == ["第0句", "第1句", "第2句"]
    assert not older.value.has_more


async def test_old_entries_endpoint_still_records_without_a_message(
    infra: Infra, me: conftest.TestUser
) -> None:
    submitted = await entries.submit_entry(infra, text="老张请客", occurred=None)
    assert isinstance(submitted, Ok)
    page = await messages.list_messages(infra)
    assert isinstance(page, Ok) and page.value.messages == []
