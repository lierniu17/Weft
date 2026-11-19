"""对话上下文 rules (conversation-context spec): choosing the 上文 a question is read with
(AC-9), and when 问答's 指代确认 still takes a typed answer (AC-3)."""

from __future__ import annotations

import uuid
from dataclasses import replace
from datetime import UTC, datetime, timedelta

import pytest

from weft.domain.answer import Answer, AnswerKind, AnswerSegment, PersonRef
from weft.domain.answering import no_answer
from weft.domain.conversation import HistoryTurn, select_history, turn_of
from weft.domain.intent import Clarification, ClarifyOption, ClarifySource, Intent
from weft.domain.message import awaits_answer
from weft.repositories.records import MessageRecord

pytestmark = pytest.mark.unit

NOW = datetime(2026, 11, 16, 4, 0, tzinfo=UTC)
WINDOW = timedelta(minutes=30)
ZHANG = PersonRef(person_id="id-zhang", name="张伟")
ME = PersonRef(person_id="id-me", name="小明", is_self=True)


def answer(text: str = "老张在字节跳动上班。") -> Answer:
    return Answer(
        kind=AnswerKind.TEXT,
        segments=[AnswerSegment(text=text)],
        citations=[],
        persons=[ZHANG],
        follow_ups=[],
    )


def asked(minutes_ago: float, question: str = "老张在哪上班？") -> HistoryTurn:
    return HistoryTurn.of(uuid.uuid4(), question, answer(), NOW - timedelta(minutes=minutes_ago))


# --- 上文 (AC-9) ----------------------------------------------------------------------------


def test_the_latest_three_answered_questions_oldest_first() -> None:
    turns = [asked(m, f"问题{m}") for m in (1, 9, 4, 20, 12)]
    chosen = select_history(turns, now=NOW, window=WINDOW)
    assert [t.question for t in chosen] == ["问题9", "问题4", "问题1"]


def test_only_within_the_window() -> None:
    turns = [asked(31), asked(30, "刚好 30 分钟"), asked(45)]
    assert [t.question for t in select_history(turns, now=NOW, window=WINDOW)] == ["刚好 30 分钟"]
    assert select_history([asked(31), asked(90)], now=NOW, window=WINDOW) == []


def test_a_turn_says_the_question_the_answer_and_who_it_was_about() -> None:
    turn = asked(2)
    assert turn.to_json() == {
        "question": "老张在哪上班？",
        "answer_text": "老张在字节跳动上班。",
        "persons": ["张伟"],
    }


def message(**kw: object) -> MessageRecord:
    base: dict[str, object] = {
        "id": uuid.uuid4(),
        "text": "老张在哪上班？",
        "intent": Intent.ASK,
        "recognized_intent": Intent.ASK,
        "confidence": 0.95,
        "uncertain": False,
        "occurred": None,
        "record_text": None,
        "question": None,
        "entry_id": None,
        "answer": answer(),
        "reply": None,
        "problems": (),
        "created_at": NOW - timedelta(minutes=3),
    }
    return MessageRecord(**{**base, **kw})  # type: ignore[arg-type]


def test_only_answered_questions_are_turns() -> None:
    assert turn_of(message()) is not None
    assert turn_of(message(question="老马的老婆是哪里人？", intent=Intent.RECORD_ASK)) is not None
    assert turn_of(message(intent=Intent.RECORD, answer=None)) is None  # a 记录
    assert turn_of(message(intent=Intent.CHITCHAT, answer=None, reply="早")) is None
    assert turn_of(message(answer=None)) is None  # still waiting on its 指代确认
    unknown = turn_of(message(answer=no_answer()))
    assert unknown is not None and unknown.answer_text == "图谱里没有相关信息。"


def test_a_turn_uses_the_question_that_was_answered() -> None:
    turn = turn_of(message(text="老马搬家了，他老婆哪里人？", question="老马的老婆是哪里人？"))
    assert turn is not None and turn.question == "老马的老婆是哪里人？"


def test_self_is_never_a_turn_person() -> None:
    a = answer().model_copy(update={"persons": [ZHANG], "path": [ME, ZHANG], "kind": "path"})
    assert HistoryTurn.of(uuid.uuid4(), "我怎么认识老张的？", a, NOW).persons == ("张伟",)


# --- 指代确认 waits for a typed answer (AC-3) ---------------------------------------------

CONFIRM = Clarification(
    "你问的是哪位老周？",
    (
        ClarifyOption("老周（周涛，大学同学）", Intent.ASK, "周涛喜欢什么？", "id-tao"),
        ClarifyOption("老周（周建国，邻居）", Intent.ASK, "周建国喜欢什么？", "id-jg"),
    ),
    ClarifySource.ASK,
)
PENDING = message(text="老周喜欢什么？", answer=None, clarify=CONFIRM)


def test_an_open_confirmation_takes_a_typed_answer_within_the_window() -> None:
    assert awaits_answer(PENDING, now=NOW, window=WINDOW)


@pytest.mark.parametrize(
    "latest",
    [
        replace(PENDING, created_at=NOW - WINDOW - timedelta(seconds=1)),  # too old
        replace(PENDING, clarification_resolved_at=NOW),  # a candidate was clicked
        replace(PENDING, clarification_of=uuid.uuid4()),  # itself an answer: one round only
        replace(PENDING, answer=answer()),  # answered after all (不接上文 etc.)
        replace(PENDING, clarify=replace(CONFIRM, source=ClarifySource.INTENT)),  # confident 反问?
    ],
)
def test_otherwise_the_next_message_after_a_question_is_ordinary(latest: MessageRecord) -> None:
    assert not awaits_answer(latest, now=NOW, window=WINDOW)


def test_the_confirmation_round_trips_through_json() -> None:
    assert Clarification.from_json(CONFIRM.to_json()) == CONFIRM
    old = {"question": "你是想记下还是查？", "options": [{"label": "记下：x", "intent": "record"}]}
    assert Clarification.from_json(old).source is ClarifySource.INTENT  # rows before 0005
