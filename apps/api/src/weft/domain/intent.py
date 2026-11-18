"""意图 (Intent): what one user message is — a 记录, a 提问, both, or 无关 (ADR 0005).

The model reads the message (``weft.services.intent``) and answers with an
``IntentReading``; ``decide`` turns that into a ``Recognition`` the message service routes on:

* below the confidence threshold every reading becomes 无关, flagged ``uncertain`` — the
  user then picks 「记下来 / 帮我查」 (AC-2, AC-6);
* the occurred date is a ``PartialDate`` with the precision the message gave, never in the
  future (AC-8); anything unusable means "today";
* a 记录 keeps the user's whole text; ``record_ask`` carries the two parts separately (AC-5).

``fast_path`` answers clear single-clause questions without a model call (spec 「意图识别」).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, field_validator

from weft.domain.dates import FutureDateError, PartialDate

UNCERTAIN_REPLY = "我没确定你是想记下来还是查询"
DEFAULT_REPLY = "嗯嗯，有想记下的事或想查的人随时告诉我。"
MAX_REPLY_LENGTH = 60
FAST_PATH_CONFIDENCE = 0.95


class Intent(StrEnum):
    RECORD = "record"  # 记录
    ASK = "ask"  # 提问
    RECORD_ASK = "record_ask"  # 既有新信息又有问题
    CHITCHAT = "chitchat"  # 无关


class IntentReading(BaseModel):
    """The model's JSON answer, validated (unknown keys ignored)."""

    model_config = ConfigDict(extra="ignore")

    intent: Intent
    confidence: float
    occurred: str | None = None
    record_text: str | None = None
    question: str | None = None
    reply: str | None = None

    @field_validator("confidence", mode="before")
    @classmethod
    def _clamp(cls, value: object) -> float:
        try:
            number = float(value)  # type: ignore[arg-type]
        except (TypeError, ValueError) as exc:
            raise ValueError(f"confidence is not a number: {value!r}") from exc
        return min(max(number, 0.0), 1.0)


@dataclass(frozen=True, slots=True)
class Recognition:
    intent: Intent
    confidence: float
    uncertain: bool
    occurred: PartialDate | None = None  # None: today
    record_text: str | None = None  # what becomes the Entry (record / record_ask)
    question: str | None = None  # what is asked (ask / record_ask)
    reply: str | None = None  # the short answer to 无关
    fast_path: bool = False


def _clean(value: str | None) -> str | None:
    value = (value or "").strip()
    return value or None


def occurred_date(value: str | None, *, today: date) -> PartialDate | None:
    """The model's occurred date if it is a real date not after ``today``; else None."""
    text = _clean(value)
    if text is None:
        return None
    try:
        parsed = PartialDate.parse(text)
        parsed.ensure_not_future(today=today)
    except (ValueError, FutureDateError):
        return None
    return parsed


def decide(reading: IntentReading, *, text: str, threshold: float, today: date) -> Recognition:
    """Turn the model's reading of ``text`` into the routing decision."""
    occurred = occurred_date(reading.occurred, today=today)
    if reading.confidence < threshold:
        return Recognition(
            Intent.CHITCHAT, reading.confidence, True, occurred=occurred, reply=UNCERTAIN_REPLY
        )
    body = text.strip()
    intent = reading.intent
    if intent is Intent.RECORD_ASK:
        record_text, question = _clean(reading.record_text), _clean(reading.question)
        if question is None:
            intent = Intent.RECORD
        elif record_text is None:
            return Recognition(Intent.ASK, reading.confidence, False, occurred, question=question)
        else:
            return Recognition(
                Intent.RECORD_ASK,
                reading.confidence,
                False,
                occurred,
                record_text=record_text,
                question=question,
            )
    if intent is Intent.RECORD:
        return Recognition(Intent.RECORD, reading.confidence, False, occurred, record_text=body)
    if intent is Intent.ASK:
        return Recognition(Intent.ASK, reading.confidence, False, occurred, question=body)
    reply = (_clean(reading.reply) or DEFAULT_REPLY)[:MAX_REPLY_LENGTH]
    return Recognition(Intent.CHITCHAT, reading.confidence, False, occurred, reply=reply)


def unrecognized() -> Recognition:
    """The model could not be reached or answered nonsense: let the user choose."""
    return Recognition(Intent.CHITCHAT, 0.0, True, reply=UNCERTAIN_REPLY)


# --- fast path -----------------------------------------------------------------------

FAST_PATH_MAX_LENGTH = 30
_QUESTION_MARKS = ("？", "?")
_CLAUSE_BREAKS = frozenset("，,。.；;！!…、\n：:")
_QUESTION_WORDS = (
    "谁",
    "什么",
    "啥",
    "哪",
    "怎么",
    "怎样",
    "如何",
    "为什么",
    "为啥",
    "几",
    "多少",
    "多久",
    "多大",
    "是不是",
    "有没有",
    "是否",
)
_QUESTION_ENDINGS = ("吗", "呢")
_RHETORICAL = (
    "难道",
    "怎么又",
    "怎么还",
    "怎么能",
    "怎么可能",
    "居然",
    "竟然",
    "凭什么",
    "何必",
    "岂不",
    "不就是",
    "谁知道",
    "谁让",
    "哪有",
    "哪里有",
    "能不",
)
_ABOUT_PEOPLE = (
    "我",
    "谁",
    "老",
    "小",
    "阿",
    "哥",
    "姐",
    "弟",
    "妹",
    "叔",
    "姨",
    "爸",
    "妈",
    "他",
    "她",
    "人",
    "朋友",
    "同事",
    "同学",
    "领导",
    "老板",
)


def fast_path(text: str) -> Recognition | None:
    """A clear question about people, with no new information in it: 提问 without a model call.

    Only a short single clause ending in a question mark, with a question word, about someone
    (not addressed to Weft), and not rhetorical. Everything else goes to the model.
    """
    body = text.strip()
    if not body or len(body) > FAST_PATH_MAX_LENGTH or not body.endswith(_QUESTION_MARKS):
        return None
    clause = body.rstrip("？? ")
    if any(c in _CLAUSE_BREAKS for c in clause) or "你" in clause:
        return None
    if any(marker in clause for marker in _RHETORICAL):
        return None
    asks = any(w in clause for w in _QUESTION_WORDS) or clause.endswith(_QUESTION_ENDINGS)
    if not asks or not any(p in clause for p in _ABOUT_PEOPLE):
        return None
    return Recognition(Intent.ASK, FAST_PATH_CONFIDENCE, False, question=body, fast_path=True)


__all__ = [
    "DEFAULT_REPLY",
    "FAST_PATH_CONFIDENCE",
    "UNCERTAIN_REPLY",
    "Intent",
    "IntentReading",
    "Recognition",
    "decide",
    "fast_path",
    "occurred_date",
    "unrecognized",
]
