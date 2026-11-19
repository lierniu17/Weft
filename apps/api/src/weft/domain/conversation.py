"""上文 (conversation-context spec, 连续追问 AC-9): the recent Q&A a new question is read with.

A question is sent to 问答 and to 意图识别 together with at most ``MAX_HISTORY_TURNS`` of
the user's latest answered questions, newest last, asked at most the window (a setting,
30 minutes) before now. Only time and the number of answered questions count: a 记录 or a
chitchat in between changes nothing, and a question still waiting on its 指代确认 has no
answer yet, so it is not a turn.

Each turn carries the question, the answer's text and the persons it named (``to_json``
is what the models see). The message ids let a message say which turns it was read with
(``history_used_of``), so 「接着：…」 can be shown and 「不接上文」 offered (AC-10).
"""

from __future__ import annotations

import uuid
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import TYPE_CHECKING, Any

from weft.domain.answer import Answer, AnswerKind
from weft.domain.intent import Intent

if TYPE_CHECKING:
    from weft.repositories.records import MessageRecord

MAX_HISTORY_TURNS = 3
MAX_ANSWER_TEXT = 300
MAX_TURN_PERSONS = 6
ASKING = (Intent.ASK, Intent.RECORD_ASK)


@dataclass(frozen=True, slots=True)
class HistoryTurn:
    """One answered question of the 上文."""

    message_id: uuid.UUID
    question: str
    answer_text: str
    persons: tuple[str, ...]  # names the answer is about (never 我)
    asked_at: datetime

    def to_json(self) -> dict[str, Any]:
        return {
            "question": self.question,
            "answer_text": self.answer_text,
            "persons": list(self.persons),
        }

    @classmethod
    def of(
        cls, message_id: uuid.UUID, question: str, answer: Answer, asked_at: datetime
    ) -> HistoryTurn:
        names = [p.name for p in answer.persons if not p.is_self]
        names += [p.name for p in answer.path or [] if not p.is_self]
        names += [i.name for i in answer.items or [] if not i.is_self]
        text = "".join(s.text for s in answer.segments).strip()
        return cls(
            message_id=message_id,
            question=question.strip(),
            answer_text=text[:MAX_ANSWER_TEXT],
            persons=tuple(dict.fromkeys(names))[:MAX_TURN_PERSONS],
            asked_at=asked_at,
        )


def turn_of(message: MessageRecord) -> HistoryTurn | None:
    """The message as a turn of the 上文, if it is an answered question."""
    answer = message.answer
    if message.intent not in ASKING or answer is None or answer.kind is AnswerKind.CLARIFY:
        return None
    return HistoryTurn.of(message.id, message.question or message.text, answer, message.created_at)


def select_history(
    turns: Iterable[HistoryTurn],
    *,
    now: datetime,
    window: timedelta,
    limit: int = MAX_HISTORY_TURNS,
) -> list[HistoryTurn]:
    """The latest ``limit`` turns asked within ``window`` before ``now``, oldest first."""
    recent = [t for t in turns if timedelta(0) <= now - t.asked_at <= window]
    recent.sort(key=lambda t: t.asked_at, reverse=True)
    return list(reversed(recent[: max(limit, 0)]))


__all__ = [
    "MAX_HISTORY_TURNS",
    "HistoryTurn",
    "select_history",
    "turn_of",
]
