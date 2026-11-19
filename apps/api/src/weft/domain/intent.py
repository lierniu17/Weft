"""意图 (Intent): what one user message is — a 记录, a 提问, both, or 无关 (ADR 0005).

The model reads the message (``weft.services.intent``) and answers with an
``IntentReading``; ``decide`` turns that into a ``Recognition`` the message service routes on:

* below the confidence threshold every reading becomes 无关, flagged ``uncertain`` — the
  user then picks 「记下来 / 帮我查」 (AC-2, AC-6);
* the occurred date is a ``PartialDate`` with the precision the message gave, never in the
  future (AC-8); anything unusable means "today";
* a 记录 keeps the user's whole text; ``record_ask`` carries the two parts separately (AC-5).

反问 (intent-clarify spec): the same reading may carry a ``clarify`` — one concrete question
and up to 3 options. It is used only below the threshold (AC-1, AC-2); an invalid one falls
back to the fixed ``UNCERTAIN_REPLY`` and 「记下来 / 帮我查」. When the message may be the
answer to a pending 反问 (a ``ClarifyContext``), the reading says whether it is
(``answers_clarification``) and carries the merged ``record_text`` / ``question``; an answer
is never asked back a second time (AC-4, AC-5).

``fast_path`` answers clear single-clause questions without a model call (spec 「意图识别」).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict, field_validator

from weft.domain.dates import FutureDateError, PartialDate

UNCERTAIN_REPLY = "我没确定你是想记下来还是查询"
DEFAULT_REPLY = "嗯嗯，有想记下的事或想查的人随时告诉我。"
MAX_REPLY_LENGTH = 60
FAST_PATH_CONFIDENCE = 0.95
MAX_CLARIFY_OPTIONS = 3
MAX_CLARIFY_QUESTION_LENGTH = 80
MAX_OPTION_LABEL_LENGTH = 30


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
    clarify: Any = None  # checked by ``clarification``: a bad one must not sink the reading
    answers_clarification: bool | None = None  # only asked when a 反问 is pending

    @field_validator("answers_clarification", mode="before")
    @classmethod
    def _flag(cls, value: object) -> bool | None:
        return value if isinstance(value, bool) else None

    @field_validator("confidence", mode="before")
    @classmethod
    def _clamp(cls, value: object) -> float:
        try:
            number = float(value)  # type: ignore[arg-type]
        except (TypeError, ValueError) as exc:
            raise ValueError(f"confidence is not a number: {value!r}") from exc
        return min(max(number, 0.0), 1.0)


OPTION_INTENTS = (Intent.RECORD, Intent.ASK, Intent.RECORD_ASK)


class ClarifySource(StrEnum):
    """Who asked back: 意图识别 (反问, 记下 or 查) or 问答 (指代确认, which person / event)."""

    INTENT = "intent"
    ASK = "ask"


@dataclass(frozen=True, slots=True)
class ClarifyOption:
    """A 候选 under a 反问: what clicking it does (记下 the original text / 查 ``question``).

    Under a 指代确认 (source ask) every option is 查 its ``question``; ``person_id`` is the
    person it means, if it is about a person (conversation-context AC-1)."""

    label: str  # 「记下：…」「查：…」; 指代确认: 「老周（周涛，大学同学）」
    intent: Intent  # record | ask | record_ask
    question: str | None = None  # ask / record_ask: the question to answer
    person_id: str | None = None  # 指代确认 only

    def to_json(self) -> dict[str, Any]:
        out: dict[str, Any] = {"label": self.label, "intent": self.intent.value}
        if self.question is not None:
            out["question"] = self.question
        if self.person_id is not None:
            out["person_id"] = self.person_id
        return out


@dataclass(frozen=True, slots=True)
class Clarification:
    """反问: one concrete question about the message and 1–3 options (AC-1); or, with source
    ask, the 指代确认 问答 asked instead of answering (2–4 options)."""

    question: str
    options: tuple[ClarifyOption, ...]
    source: ClarifySource = ClarifySource.INTENT

    def to_json(self) -> dict[str, Any]:
        return {
            "question": self.question,
            "options": [o.to_json() for o in self.options],
            "source": self.source.value,
        }

    @classmethod
    def from_json(cls, data: dict[str, Any]) -> Clarification:
        return cls(
            question=data["question"],
            options=tuple(
                ClarifyOption(
                    o["label"], Intent(o["intent"]), o.get("question"), o.get("person_id")
                )
                for o in data["options"]
            ),
            source=ClarifySource(data.get("source", ClarifySource.INTENT.value)),  # before 0005
        )


@dataclass(frozen=True, slots=True)
class ClarifyContext:
    """A pending 反问 the next message may be answering (sent along with it, AC-4).

    With source ask it is a 指代确认: ``original`` is the question and ``options`` the
    candidates' (label, question) (conversation-context AC-3)."""

    original: str  # the 拿不准 message; 指代确认: the question
    clarify_question: str  # what was asked back (the fixed reply if there was no 反问)
    source: ClarifySource = ClarifySource.INTENT
    options: tuple[tuple[str, str], ...] = ()  # 指代确认: (label, question) of each candidate


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
    clarify: Clarification | None = None  # 拿不准 only: the 反问 and its options
    answers_clarification: bool = False  # the message answers the pending 反问


def _clean(value: object) -> str | None:
    text = (value if isinstance(value, str) else "").strip()
    return text or None


def _option(raw: object) -> ClarifyOption | None:
    if not isinstance(raw, dict):
        return None
    label = _clean(raw.get("label"))
    try:
        intent = Intent(str(raw.get("intent")))
    except ValueError:
        return None
    if label is None or intent not in OPTION_INTENTS:
        return None
    question = _clean(raw.get("question"))
    if intent is Intent.RECORD:
        question = None
    elif question is None:
        return None  # a 查 option must say what it asks
    return ClarifyOption(label[:MAX_OPTION_LABEL_LENGTH], intent, question)


def clarification(raw: object) -> Clarification | None:
    """The model's ``clarify``, checked: a question and its valid options (at most 3, labels
    cut short, unknown kinds and repeated labels dropped); None if nothing usable is left."""
    if not isinstance(raw, dict):
        return None
    question = _clean(raw.get("question"))
    if question is None or question == UNCERTAIN_REPLY:
        return None
    options: list[ClarifyOption] = []
    raw_options = raw.get("options")
    for item in raw_options if isinstance(raw_options, list) else []:
        option = _option(item)
        if option is not None and all(option.label != o.label for o in options):
            options.append(option)
        if len(options) == MAX_CLARIFY_OPTIONS:
            break
    if not options:
        return None
    return Clarification(question[:MAX_CLARIFY_QUESTION_LENGTH], tuple(options))


_JOINED = frozenset("。！？!?…；;，,、～~ ")


def merge_text(original: str, answer: str) -> str:
    """原话 + 回答 as one text (what 「记下来 / 帮我查」 act on after a second 拿不准, AC-5)."""
    first, second = original.strip(), answer.strip()
    if not first or not second:
        return first or second
    return f"{first}{'' if first[-1] in _JOINED else '，'}{second}"


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


def decide(
    reading: IntentReading,
    *,
    text: str,
    threshold: float,
    today: date,
    context: ClarifyContext | None = None,
) -> Recognition:
    """Turn the model's reading of ``text`` into the routing decision.

    ``context``: a 反问 is pending and ``text`` may answer it. If the model says it does, the
    message is handled by the merged meaning and never asked back again; otherwise ``text``
    is an ordinary message (AC-4..AC-6).
    """
    occurred = occurred_date(reading.occurred, today=today)
    if context is not None and reading.answers_clarification:
        return _decide_answer(reading, text, threshold, occurred, context)
    if reading.confidence < threshold:
        asked = clarification(reading.clarify)  # the reply is the 反问 itself, if usable
        return Recognition(
            Intent.CHITCHAT,
            reading.confidence,
            True,
            occurred=occurred,
            reply=UNCERTAIN_REPLY if asked is None else asked.question,
            clarify=asked,
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


def _decide_answer(
    reading: IntentReading,
    text: str,
    threshold: float,
    occurred: PartialDate | None,
    ctx: ClarifyContext,
) -> Recognition:
    """``text`` answers the pending 反问: handle 原话 + 回答 together, without a second 反问.

    The merged ``record_text`` / ``question`` come from the model; the plain concatenation
    stands in for a missing one (and is what 「记下来 / 帮我查」 act on if still 拿不准).
    """
    merged = merge_text(ctx.original, text)
    record_text = _clean(reading.record_text) or merged
    question = _clean(reading.question) or merged
    confidence = reading.confidence
    if confidence < threshold:
        return Recognition(
            Intent.CHITCHAT,
            confidence,
            True,
            occurred,
            record_text=record_text,
            question=question,
            reply=UNCERTAIN_REPLY,
            answers_clarification=True,
        )
    intent = reading.intent
    if intent is Intent.RECORD_ASK and _clean(reading.question) is None:
        intent = Intent.RECORD
    if intent is Intent.CHITCHAT:  # 「算了」: nothing to do any more
        reply = (_clean(reading.reply) or DEFAULT_REPLY)[:MAX_REPLY_LENGTH]
        return Recognition(
            Intent.CHITCHAT, confidence, False, occurred, reply=reply, answers_clarification=True
        )
    return Recognition(
        intent,
        confidence,
        False,
        occurred,
        record_text=record_text,
        question=question,
        answers_clarification=True,
    )


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
    "MAX_CLARIFY_OPTIONS",
    "MAX_CLARIFY_QUESTION_LENGTH",
    "MAX_OPTION_LABEL_LENGTH",
    "UNCERTAIN_REPLY",
    "Clarification",
    "ClarifyContext",
    "ClarifyOption",
    "ClarifySource",
    "Intent",
    "IntentReading",
    "Recognition",
    "clarification",
    "decide",
    "fast_path",
    "merge_text",
    "occurred_date",
    "unrecognized",
]
