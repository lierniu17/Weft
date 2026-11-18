"""反问 (intent clarify): checking the model's 反问 and options (AC-1, AC-2), reading a message
sent with a pending 反问 (AC-4..AC-6), the merged text, and when a 反问 still takes a typed
answer. Pure functions; no model is called here.
"""

from __future__ import annotations

import uuid
from dataclasses import replace
from datetime import UTC, date, datetime, timedelta
from typing import Any

import pytest

from weft.domain.dates import PartialDate
from weft.domain.intent import (
    DEFAULT_REPLY,
    MAX_CLARIFY_OPTIONS,
    MAX_OPTION_LABEL_LENGTH,
    UNCERTAIN_REPLY,
    Clarification,
    ClarifyContext,
    ClarifyOption,
    Intent,
    IntentReading,
    clarification,
    decide,
    merge_text,
)
from weft.domain.message import awaits_answer
from weft.repositories.records import MessageRecord

pytestmark = pytest.mark.unit

TODAY = date(2026, 11, 16)
THRESHOLD = 0.7
VAGUE = "阿明最近好像挺忙的吧"
ASKED = "你是想记下阿明最近很忙，还是想查阿明在忙什么？"
RECORD = {"label": "记下：阿明最近很忙", "intent": "record"}
ASK = {"label": "查：阿明在忙什么", "intent": "ask", "question": "阿明最近在忙什么？"}
CTX = ClarifyContext(original=VAGUE, clarify_question=ASKED)


def reading(**kw: object) -> IntentReading:
    return IntentReading.model_validate({"intent": "record", "confidence": 0.9, **kw})


def asked(*options: Any, question: Any = ASKED) -> dict[str, Any]:
    return {"question": question, "options": list(options)}


# --- the 反问 and its options (AC-1) ---------------------------------------------------------


def test_a_valid_clarification_keeps_the_question_and_its_options() -> None:
    c = clarification(asked(RECORD, ASK))
    assert c == Clarification(
        ASKED,
        (
            ClarifyOption("记下：阿明最近很忙", Intent.RECORD),
            ClarifyOption("查：阿明在忙什么", Intent.ASK, "阿明最近在忙什么？"),
        ),
    )
    assert c is not None and Clarification.from_json(c.to_json()) == c


def test_at_most_three_options_and_labels_are_cut_short() -> None:
    many = [
        {"label": f"查：阿明的第{i}件事", "intent": "ask", "question": f"问题{i}"} for i in range(5)
    ]
    long = {"label": "记下：" + "很" * 50, "intent": "record"}
    c = clarification(asked(long, *many))
    assert c is not None and len(c.options) == MAX_CLARIFY_OPTIONS
    assert len(c.options[0].label) == MAX_OPTION_LABEL_LENGTH
    assert [o.label for o in c.options[1:]] == ["查：阿明的第0件事", "查：阿明的第1件事"]


@pytest.mark.parametrize(
    "bad",
    [
        {"label": "聊聊别的", "intent": "chitchat"},  # not a kind an option can be
        {"label": "做点什么", "intent": "delete"},
        {"label": "查：阿明", "intent": "ask"},  # a 查 option must say what it asks
        {"label": "  ", "intent": "record"},
        {"intent": "record"},
        "记下：阿明最近很忙",
        None,
    ],
)
def test_invalid_options_are_dropped(bad: Any) -> None:
    c = clarification(asked(bad, RECORD))
    assert c is not None and [o.intent for o in c.options] == [Intent.RECORD]


def test_a_record_option_never_carries_a_question_and_repeated_labels_count_once() -> None:
    c = clarification(asked({**RECORD, "question": "多余"}, RECORD, ASK))
    assert c is not None
    assert [(o.intent, o.question) for o in c.options] == [
        (Intent.RECORD, None),
        (Intent.ASK, "阿明最近在忙什么？"),
    ]


@pytest.mark.parametrize(
    "raw",
    [
        None,
        "你想记还是想查？",
        asked(question=""),
        asked(RECORD, question=None),
        asked(RECORD, question=UNCERTAIN_REPLY),  # the fixed line is no 反问
        asked(),  # no options
        asked({"label": "闲聊", "intent": "chitchat"}),  # nothing valid left
        {"question": ASKED, "options": "记下"},
    ],
)
def test_an_unusable_clarification_is_none(raw: Any) -> None:
    assert clarification(raw) is None


def test_below_the_threshold_the_reply_is_the_clarification() -> None:
    r = decide(
        reading(confidence=0.5, clarify=asked(RECORD, ASK)),
        text=VAGUE,
        threshold=THRESHOLD,
        today=TODAY,
    )
    assert (r.intent, r.uncertain, r.reply) == (Intent.CHITCHAT, True, ASKED)
    assert r.clarify is not None and len(r.clarify.options) == 2


def test_an_invalid_clarification_falls_back_to_the_fixed_reply() -> None:
    r = decide(
        reading(confidence=0.5, clarify={"question": ASKED, "options": []}),
        text=VAGUE,
        threshold=THRESHOLD,
        today=TODAY,
    )
    assert (r.uncertain, r.reply, r.clarify) == (True, UNCERTAIN_REPLY, None)


def test_a_confident_reading_never_carries_a_clarification() -> None:
    r = decide(
        reading(confidence=0.9, clarify=asked(RECORD, ASK)),
        text=VAGUE,
        threshold=THRESHOLD,
        today=TODAY,
    )
    assert (r.intent, r.uncertain, r.clarify) == (Intent.RECORD, False, None)


def test_a_malformed_clarify_or_flag_does_not_sink_the_reading() -> None:
    r = IntentReading.model_validate(
        {"intent": "ask", "confidence": 0.3, "clarify": [1, 2], "answers_clarification": "yes"}
    )
    assert r.answers_clarification is None
    assert decide(r, text=VAGUE, threshold=THRESHOLD, today=TODAY).clarify is None


# --- a message sent with a pending 反问 (AC-4..AC-6) -----------------------------------------


def test_an_answer_to_record_is_handled_by_the_merged_text() -> None:
    r = decide(
        reading(
            answers_clarification=True,
            record_text="阿明最近在准备考研，挺忙的",
            occurred="2026-10",
            clarify=asked(RECORD),
        ),
        text="记一下，他在准备考研",
        threshold=THRESHOLD,
        today=TODAY,
        context=CTX,
    )
    assert (r.intent, r.answers_clarification, r.uncertain) == (Intent.RECORD, True, False)
    assert r.record_text == "阿明最近在准备考研，挺忙的"
    assert r.occurred == PartialDate(2026, 10)
    assert r.clarify is None


def test_an_answer_to_ask_asks_the_merged_question() -> None:
    r = decide(
        reading(intent="ask", answers_clarification=True, question="阿明最近在忙什么？"),
        text="查查他在忙啥",
        threshold=THRESHOLD,
        today=TODAY,
        context=CTX,
    )
    assert (r.intent, r.question) == (Intent.ASK, "阿明最近在忙什么？")


def test_missing_merged_texts_fall_back_to_the_concatenation() -> None:
    r = decide(
        reading(answers_clarification=True),
        text="他在准备考研",
        threshold=THRESHOLD,
        today=TODAY,
        context=CTX,
    )
    assert r.record_text == r.question == "阿明最近好像挺忙的吧，他在准备考研"


def test_record_and_ask_without_a_question_is_a_record() -> None:
    r = decide(
        reading(intent="record_ask", answers_clarification=True, record_text="阿明在考研"),
        text="他在考研",
        threshold=THRESHOLD,
        today=TODAY,
        context=CTX,
    )
    assert (r.intent, r.record_text) == (Intent.RECORD, "阿明在考研")


def test_a_still_vague_answer_is_never_asked_back() -> None:
    r = decide(
        reading(answers_clarification=True, confidence=0.4, clarify=asked(RECORD, ASK)),
        text="嗯……",
        threshold=THRESHOLD,
        today=TODAY,
        context=CTX,
    )
    assert (r.intent, r.uncertain, r.reply, r.clarify) == (
        Intent.CHITCHAT,
        True,
        UNCERTAIN_REPLY,
        None,
    )
    assert r.answers_clarification
    assert r.record_text == r.question == "阿明最近好像挺忙的吧，嗯……"


def test_never_mind_is_a_chitchat_answer() -> None:
    r = decide(
        reading(intent="chitchat", answers_clarification=True, reply="好的"),
        text="算了",
        threshold=THRESHOLD,
        today=TODAY,
        context=CTX,
    )
    assert (r.intent, r.uncertain, r.reply, r.answers_clarification) == (
        Intent.CHITCHAT,
        False,
        "好的",
        True,
    )
    blank = decide(
        reading(intent="chitchat", answers_clarification=True),
        text="不用了",
        threshold=THRESHOLD,
        today=TODAY,
        context=CTX,
    )
    assert blank.reply == DEFAULT_REPLY


@pytest.mark.parametrize("flag", [False, None])
def test_a_message_that_does_not_answer_is_read_on_its_own(flag: bool | None) -> None:
    r = decide(
        reading(answers_clarification=flag, record_text="合并的内容"),
        text="今天和小宋打球了",
        threshold=THRESHOLD,
        today=TODAY,
        context=CTX,
    )
    assert (r.intent, r.record_text, r.answers_clarification) == (
        Intent.RECORD,
        "今天和小宋打球了",
        False,
    )


def test_answers_without_a_context_are_ignored() -> None:
    r = decide(
        reading(answers_clarification=True, record_text="别的"),
        text="小宋换了新车",
        threshold=THRESHOLD,
        today=TODAY,
    )
    assert (r.record_text, r.answers_clarification) == ("小宋换了新车", False)


@pytest.mark.parametrize(
    ("original", "answer", "merged"),
    [
        ("阿明最近好像挺忙的吧", "他在考研", "阿明最近好像挺忙的吧，他在考研"),
        ("阿明那事。", "他辞职了", "阿明那事。他辞职了"),
        ("阿明怎么样？", " 想记一下 ", "阿明怎么样？想记一下"),
        ("阿明", "", "阿明"),
    ],
)
def test_merge_text(original: str, answer: str, merged: str) -> None:
    assert merge_text(original, answer) == merged


# --- does the latest message still take a typed answer? -------------------------------------

NOW = datetime(2026, 11, 16, 4, 0, tzinfo=UTC)
WINDOW = timedelta(minutes=30)
OPEN = MessageRecord(
    id=uuid.uuid4(),
    text=VAGUE,
    intent=Intent.CHITCHAT,
    recognized_intent=Intent.CHITCHAT,
    confidence=0.5,
    uncertain=True,
    occurred=None,
    record_text=None,
    question=None,
    entry_id=None,
    answer=None,
    reply=ASKED,
    problems=(),
    created_at=NOW - timedelta(minutes=5),
)


def test_an_open_clarification_takes_a_typed_answer_within_the_window() -> None:
    assert awaits_answer(OPEN, now=NOW, window=WINDOW)
    assert awaits_answer(replace(OPEN, created_at=NOW - WINDOW), now=NOW, window=WINDOW)


@pytest.mark.parametrize(
    "latest",
    [
        None,
        replace(OPEN, created_at=NOW - WINDOW - timedelta(seconds=1)),  # too old
        replace(OPEN, uncertain=False),  # a confident message
        replace(OPEN, clarification_resolved_at=NOW),  # settled
        replace(OPEN, clarification_of=uuid.uuid4()),  # itself an answer: only one round
        replace(OPEN, intent=Intent.RECORD),  # 记下来 was clicked
    ],
)
def test_otherwise_the_next_message_is_ordinary(latest: MessageRecord | None) -> None:
    assert not awaits_answer(latest, now=NOW, window=WINDOW)
