"""反问 (intent clarify): asking back when unsure, clicking an option, answering by typing,
the single round, changing the subject, and quotas — with replayed model answers.

AC-1 (the 反问 and 1–3 options; the fixed fallback), AC-2 (same recognition call; only below
the threshold), AC-3 (clicking an option), AC-4 (a typed answer is merged with the original),
AC-5 (no second 反问; the fallback acts on 原话 + 回答), AC-6 (a new subject is an ordinary
message), AC-7 (the 反问 is free; used-up quotas leave it open), AC-8 (listing restores it).
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from typing import Any

import pytest
from sqlalchemy import text as sql

from tests import conftest
from tests.support.asks import final
from tests.support.llm_script import LLMScript
from tests.support.users import new_user
from weft.domain.dates import PartialDate
from weft.domain.draft import DraftStatus
from weft.domain.intent import UNCERTAIN_REPLY, Intent
from weft.domain.tenancy import tenant_scope
from weft.infra import Infra
from weft.services import messages, usage
from weft.services.results import Err, Ok

pytestmark = pytest.mark.service


@pytest.fixture
async def me(infra: Infra) -> AsyncIterator[conftest.TestUser]:
    user = await new_user(infra)
    with tenant_scope(user.tenant):
        yield user


async def sent(infra: Infra, text: str) -> messages.Handled:
    result = await messages.send(infra, text)
    assert isinstance(result, Ok), result
    return result.value


async def clicked(infra: Infra, message_id: uuid.UUID, option: int) -> messages.Handled:
    result = await messages.clarify(infra, message_id, option)
    assert isinstance(result, Ok), result
    return result.value


async def used(infra: Infra) -> tuple[int, int]:
    report = await usage.today(infra)
    return report.entry.used, report.ask.used


async def listed(infra: Infra) -> list[messages.MessageView]:
    page = await messages.list_messages(infra)
    assert isinstance(page, Ok)
    return page.value.messages


def intent_calls(llm: LLMScript) -> int:
    return sum(r.used for r in llm.rules if r.name.startswith("intent"))


# 拿不准: 「阿明最近好像挺忙的吧」 — is it news about 阿明, or a question?
VAGUE = "阿明最近好像挺忙的吧"
ASKED = "你是想记下阿明最近很忙，还是想查阿明在忙什么？"
BUSY = "阿明最近在忙什么？"
OPTIONS: list[dict[str, Any]] = [
    {"label": "记下：阿明最近很忙", "intent": "record"},
    {"label": "查：阿明在忙什么", "intent": "ask", "question": BUSY},
]


def vague(llm: LLMScript) -> None:
    llm.intent(VAGUE, "record", confidence=0.5, clarify={"question": ASKED, "options": OPTIONS})


def nothing_known(llm: LLMScript, question: str, name: str = "阿明") -> None:
    llm.ask(question, [("find_person", {"name": name})], final("no_answer"))


# --- AC-1 / AC-2: the 反问 ------------------------------------------------------------------


async def test_an_uncertain_message_asks_back_with_options_from_the_same_call(
    infra: Infra, llm: LLMScript, me: conftest.TestUser
) -> None:
    vague(llm)

    handled = await sent(infra, VAGUE)

    m = handled.view.message
    assert (m.intent, m.uncertain, m.reply) == (Intent.CHITCHAT, True, ASKED)
    assert m.clarify is not None and m.clarify.question == ASKED
    assert [(o.label, o.intent, o.question) for o in m.clarify.options] == [
        ("记下：阿明最近很忙", Intent.RECORD, None),
        ("查：阿明在忙什么", Intent.ASK, BUSY),
    ]
    assert m.clarification_resolved_at is None and m.clarification_of is None
    assert handled.view.entry is None and m.answer is None
    assert intent_calls(llm) == 1  # no extra model call for the 反问
    assert await used(infra) == (0, 0)  # the 反问 is free
    [restored] = await listed(infra)
    assert restored.message.clarify == m.clarify


async def test_at_most_three_options_are_kept(
    infra: Infra, llm: LLMScript, me: conftest.TestUser
) -> None:
    text = "阿明他们组那件事"
    many = [
        {"label": f"查：阿明组里的第{i}件事", "intent": "ask", "question": f"阿明组里第{i}件事？"}
        for i in range(1, 6)
    ]
    llm.intent(text, "ask", confidence=0.3, clarify={"question": "你想查哪件事？", "options": many})

    m = (await sent(infra, text)).view.message

    assert m.clarify is not None and len(m.clarify.options) == 3


async def test_an_invalid_clarification_falls_back_to_the_fixed_reply(
    infra: Infra, llm: LLMScript, me: conftest.TestUser
) -> None:
    text = "阿明那边"
    llm.intent(
        text,
        "ask",
        confidence=0.4,
        clarify={"question": "你想干嘛？", "options": [{"label": "随便", "intent": "chitchat"}]},
    )

    m = (await sent(infra, text)).view.message

    assert (m.uncertain, m.reply, m.clarify) == (True, UNCERTAIN_REPLY, None)


async def test_a_confident_message_never_carries_a_clarification(
    infra: Infra, llm: LLMScript, me: conftest.TestUser
) -> None:
    text = "阿明最近在学吉他"
    llm.intent(text, "record", confidence=0.92, clarify={"question": ASKED, "options": OPTIONS})

    handled = await sent(infra, text)

    m = handled.view.message
    assert (m.intent, m.uncertain, m.clarify) == (Intent.RECORD, False, None)
    assert handled.view.entry is not None and intent_calls(llm) == 1


# --- AC-3: clicking an option -------------------------------------------------------------


async def test_clicking_record_records_the_original_words_and_resolves_the_clarification(
    infra: Infra, llm: LLMScript, me: conftest.TestUser
) -> None:
    vague(llm)
    original = (await sent(infra, VAGUE)).view.message

    handled = await clicked(infra, original.id, 0)

    view = handled.view
    assert (
        view.message.intent is Intent.RECORD and view.message.recognized_intent is Intent.CHITCHAT
    )
    assert view.entry is not None and view.entry.text == VAGUE  # not 「阿明最近很忙」
    assert view.draft is not None and view.draft.status is DraftStatus.EXTRACTING
    assert handled.new_draft_id == view.draft.id
    assert view.message.reply is None and view.message.clarification_resolved_at is not None
    assert view.message.clarify is not None  # kept, shown as resolved
    assert await used(infra) == (1, 0)
    again = await messages.clarify(infra, original.id, 1)
    assert isinstance(again, Err) and again.reason == "already_resolved"
    assert await used(infra) == (1, 0)


async def test_clicking_ask_answers_the_options_question(
    infra: Infra, llm: LLMScript, me: conftest.TestUser
) -> None:
    vague(llm)
    nothing_known(llm, BUSY)
    original = (await sent(infra, VAGUE)).view.message

    handled = await clicked(infra, original.id, 1)

    m = handled.view.message
    assert (m.intent, m.reply) == (Intent.ASK, None)
    assert m.answer is not None and handled.view.entry is None
    assert m.clarification_resolved_at is not None
    assert await used(infra) == (0, 1)
    [restored] = await listed(infra)
    assert restored.message.answer == m.answer and restored.message.clarification_resolved_at


async def test_clicking_record_and_ask_does_both(
    infra: Infra, llm: LLMScript, me: conftest.TestUser
) -> None:
    text = "阿明好像升职了吧"
    question = "阿明现在是什么职位？"
    llm.intent(
        text,
        "record_ask",
        confidence=0.5,
        clarify={
            "question": "你是想记下阿明升职了，顺便查他现在的职位吗？",
            "options": [{"label": "记下并查职位", "intent": "record_ask", "question": question}],
        },
    )
    nothing_known(llm, question)
    original = (await sent(infra, text)).view.message

    view = (await clicked(infra, original.id, 0)).view

    assert view.message.intent is Intent.RECORD_ASK
    assert view.entry is not None and view.entry.text == text and view.message.answer is not None
    assert await used(infra) == (1, 1)


async def test_clicks_that_cannot_be_done(
    infra: Infra, llm: LLMScript, me: conftest.TestUser
) -> None:
    vague(llm)
    llm.intent("谢啦", "chitchat", confidence=0.97, reply="不客气")
    plain = (await sent(infra, "谢啦")).view.message
    original = (await sent(infra, VAGUE)).view.message

    for option in (-1, 2):
        bad = await messages.clarify(infra, original.id, option)
        assert isinstance(bad, Err) and bad.reason == "no_such_option"
    none = await messages.clarify(infra, plain.id, 0)
    assert isinstance(none, Err) and none.reason == "no_clarification"
    missing = await messages.clarify(infra, uuid.uuid4(), 0)
    assert isinstance(missing, Err) and missing.reason == "not_found"
    other = await new_user(infra)
    with tenant_scope(other.tenant):
        theirs = await messages.clarify(infra, original.id, 0)
        assert isinstance(theirs, Err) and theirs.reason == "not_found"
    assert await used(infra) == (0, 0)


# --- AC-4: answering by typing ----------------------------------------------------------------


async def test_a_typed_answer_to_record_records_the_merged_text(
    infra: Infra, llm: LLMScript, me: conftest.TestUser
) -> None:
    vague(llm)
    reply = "记一下，他在准备考研"
    merged = "阿明最近在准备考研，挺忙的"
    llm.intent_after(VAGUE, ASKED, reply, "record", answers=True, record_text=merged)
    original = (await sent(infra, VAGUE)).view.message

    handled = await sent(infra, reply)

    view = handled.view
    assert (view.message.intent, view.message.uncertain) == (Intent.RECORD, False)
    assert view.message.clarification_of == original.id and view.message.clarify is None
    assert view.entry is not None and view.entry.text == merged
    assert handled.new_draft_id is not None
    assert await used(infra) == (1, 0)
    first, answer = await listed(infra)
    assert first.message.id == original.id and first.message.clarification_resolved_at
    assert answer.entry is not None and answer.entry.text == merged  # under the answer


async def test_a_typed_answer_to_ask_asks_the_merged_question(
    infra: Infra, llm: LLMScript, me: conftest.TestUser
) -> None:
    vague(llm)
    reply = "查一下他在忙啥"
    llm.intent_after(VAGUE, ASKED, reply, "ask", answers=True, question=BUSY)
    nothing_known(llm, BUSY)
    original = (await sent(infra, VAGUE)).view.message

    view = (await sent(infra, reply)).view

    assert (view.message.intent, view.message.clarification_of) == (Intent.ASK, original.id)
    assert view.message.answer is not None and view.entry is None
    assert await used(infra) == (0, 1)
    first, _ = await listed(infra)
    assert first.message.clarification_resolved_at is not None


async def test_a_typed_answer_with_more_information_records_it_with_its_date(
    infra: Infra, llm: LLMScript, me: conftest.TestUser
) -> None:
    vague(llm)
    reply = "上个月他换了份工作，天天加班"
    merged = "阿明上个月换了份工作，最近天天加班很忙"
    llm.intent_after(
        VAGUE, ASKED, reply, "record", answers=True, record_text=merged, occurred="2026-10"
    )
    await sent(infra, VAGUE)

    view = (await sent(infra, reply)).view

    assert view.entry is not None and view.entry.text == merged
    assert view.entry.occurred == PartialDate(2026, 10)


async def test_a_message_without_a_clarification_still_takes_a_typed_answer(
    infra: Infra, llm: LLMScript, me: conftest.TestUser
) -> None:
    text = "阿明的那个"
    llm.intent_timeout(text)  # recognition failed: the fixed line, no 反问
    reply = "想查他的生日"
    llm.intent_after(
        text, UNCERTAIN_REPLY, reply, "ask", answers=True, question="阿明的生日是哪天？"
    )
    nothing_known(llm, "阿明的生日是哪天？")
    original = (await sent(infra, text)).view.message
    assert original.clarify is None and original.uncertain

    view = (await sent(infra, reply)).view

    assert view.message.intent is Intent.ASK and view.message.clarification_of == original.id


# --- AC-5: only one round ---------------------------------------------------------------------


async def test_a_still_vague_answer_gets_the_fixed_reply_which_acts_on_the_merged_text(
    infra: Infra, llm: LLMScript, me: conftest.TestUser
) -> None:
    vague(llm)
    reply = "嗯，也说不好"
    llm.intent_after(
        VAGUE,
        ASKED,
        reply,
        "record",
        answers=True,
        confidence=0.4,
        clarify={"question": "那你是想记还是想查？", "options": OPTIONS},  # ignored
    )
    after = "今天有点累"
    llm.intent(after, "chitchat", confidence=0.9, reply="早点休息")
    original = (await sent(infra, VAGUE)).view.message

    answer = (await sent(infra, reply)).view.message

    assert (answer.intent, answer.uncertain, answer.reply, answer.clarify) == (
        Intent.CHITCHAT,
        True,
        UNCERTAIN_REPLY,
        None,
    )
    assert answer.clarification_of == original.id
    recorded = await messages.reroute(infra, answer.id, Intent.RECORD)  # 记下来
    assert isinstance(recorded, Ok)
    entry = recorded.value.view.entry
    assert entry is not None and entry.text == "阿明最近好像挺忙的吧，嗯，也说不好"
    assert await used(infra) == (1, 0)
    # the answer is never asked back: the next message is read on its own (no context rule)
    assert (await sent(infra, after)).view.message.reply == "早点休息"


async def test_help_me_ask_after_a_still_vague_answer_asks_the_merged_text(
    infra: Infra, llm: LLMScript, me: conftest.TestUser
) -> None:
    vague(llm)
    reply = "就那个吧"
    llm.intent_after(VAGUE, ASKED, reply, "ask", answers=True, confidence=0.3)
    nothing_known(llm, "阿明最近好像挺忙的吧，就那个吧")
    await sent(infra, VAGUE)
    answer = (await sent(infra, reply)).view.message

    asked = await messages.reroute(infra, answer.id, Intent.ASK)  # 帮我查

    assert isinstance(asked, Ok) and asked.value.view.message.answer is not None
    assert await used(infra) == (0, 1)


# --- AC-6: a new subject ----------------------------------------------------------------------


async def test_a_new_subject_is_an_ordinary_message_and_the_options_stay_clickable(
    infra: Infra, llm: LLMScript, me: conftest.TestUser
) -> None:
    vague(llm)
    news = "今天和小宋去爬山了"
    llm.intent_after(VAGUE, ASKED, news, "record", answers=False, record_text="合并错了")
    later = "阿明在考研"
    llm.intent(later, "record")
    nothing_known(llm, BUSY)
    original = (await sent(infra, VAGUE)).view.message

    view = (await sent(infra, news)).view

    assert (view.message.intent, view.message.clarification_of) == (Intent.RECORD, None)
    assert view.entry is not None and view.entry.text == news  # nothing merged
    first, _ = await listed(infra)
    assert first.message.clarification_resolved_at is None
    # no longer open to typing (read without the 反问) ...
    assert (await sent(infra, later)).view.message.clarification_of is None
    # ... but its options can still be clicked
    assert (await clicked(infra, original.id, 1)).view.message.answer is not None
    assert await used(infra) == (2, 1)


async def test_after_the_window_the_next_message_is_ordinary(
    infra: Infra, llm: LLMScript, me: conftest.TestUser
) -> None:
    vague(llm)
    later = "阿明下周过生日"
    llm.intent(later, "record")
    original = (await sent(infra, VAGUE)).view.message
    async with infra.sql.begin() as session:  # the 反问 was asked 31 minutes ago
        await session.execute(
            sql("UPDATE messages SET created_at = now() - interval '31 minutes' WHERE id = :id"),
            {"id": original.id},
        )

    view = (await sent(infra, later)).view

    assert view.message.clarification_of is None and view.entry is not None


async def test_the_answer_window_is_a_setting(
    infra: Infra, llm: LLMScript, me: conftest.TestUser
) -> None:
    infra.settings = infra.settings.model_copy(update={"clarify_answer_window_minutes": 0})
    vague(llm)
    later = "阿明换了新手机"
    llm.intent(later, "record")
    await sent(infra, VAGUE)
    assert (await sent(infra, later)).view.message.clarification_of is None


async def test_rerouting_an_uncertain_message_settles_its_clarification(
    infra: Infra, llm: LLMScript, me: conftest.TestUser
) -> None:
    vague(llm)
    later = "阿明请我吃了饭"
    llm.intent(later, "record")
    original = (await sent(infra, VAGUE)).view.message

    rerouted = await messages.reroute(infra, original.id, Intent.RECORD)  # 改为记录

    assert isinstance(rerouted, Ok)
    assert rerouted.value.view.message.clarification_resolved_at is not None
    assert (await sent(infra, later)).view.message.clarification_of is None
    refused = await messages.clarify(infra, original.id, 1)
    assert isinstance(refused, Err) and refused.reason == "already_resolved"


# --- AC-7: quotas -----------------------------------------------------------------------------


async def test_a_click_with_its_quota_used_up_changes_nothing(
    infra: Infra, llm: LLMScript, me: conftest.TestUser
) -> None:
    infra.settings = infra.settings.model_copy(
        update={"daily_entry_limit": 0, "daily_ask_limit": 0}
    )
    vague(llm)
    original = (await sent(infra, VAGUE)).view.message

    for option in (0, 1):
        refused = await messages.clarify(infra, original.id, option)
        assert isinstance(refused, Err) and refused.reason == "quota_exceeded"

    [kept] = await listed(infra)
    assert kept.message.intent is Intent.CHITCHAT and kept.entry is None
    assert kept.message.clarification_resolved_at is None
    assert await used(infra) == (0, 0)


async def test_a_record_and_ask_click_with_one_quota_used_up_does_neither_part(
    infra: Infra, llm: LLMScript, me: conftest.TestUser
) -> None:
    infra.settings = infra.settings.model_copy(update={"daily_ask_limit": 0})
    text = "阿明好像搬家了吧"
    llm.intent(
        text,
        "record_ask",
        confidence=0.5,
        clarify={
            "question": "你是想记下阿明搬家了，再查他搬去哪了吗？",
            "options": [
                {"label": "记下并查新家", "intent": "record_ask", "question": "阿明搬去哪了？"}
            ],
        },
    )
    original = (await sent(infra, text)).view.message

    refused = await messages.clarify(infra, original.id, 0)

    assert isinstance(refused, Err) and refused.reason == "quota_exceeded"
    assert refused.detail["kind"] == "ask"
    assert await used(infra) == (0, 0)


async def test_a_typed_answer_with_its_quota_used_up_keeps_the_clarification_open(
    infra: Infra, llm: LLMScript, me: conftest.TestUser
) -> None:
    infra.settings = infra.settings.model_copy(update={"daily_entry_limit": 0})
    vague(llm)
    reply = "记下吧，他在搞装修"
    llm.intent_after(
        VAGUE, ASKED, reply, "record", answers=True, record_text="阿明最近在搞装修，挺忙的"
    )
    nothing_known(llm, BUSY)
    original = (await sent(infra, VAGUE)).view.message

    answer = (await sent(infra, reply)).view

    assert answer.entry is None and answer.message.clarification_of == original.id
    assert [(p.part, p.error) for p in answer.message.problems] == [("record", "quota_exceeded")]
    first, _ = await listed(infra)
    assert first.message.clarification_resolved_at is None  # its options still work
    assert (await clicked(infra, original.id, 1)).view.message.answer is not None
    assert await used(infra) == (0, 1)
