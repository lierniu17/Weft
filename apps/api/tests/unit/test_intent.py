"""意图 (Intent): turning the model's reading into a routing decision (AC-2, AC-8).

Pure functions; no model is called here. The fast path for clear questions is also here.
"""

from __future__ import annotations

from datetime import date

import pytest

from weft.domain.dates import PartialDate
from weft.domain.intent import (
    DEFAULT_REPLY,
    FAST_PATH_CONFIDENCE,
    UNCERTAIN_REPLY,
    Intent,
    IntentReading,
    decide,
    fast_path,
    unrecognized,
)

pytestmark = pytest.mark.unit

TODAY = date(2026, 11, 16)
THRESHOLD = 0.7


def reading(**kw: object) -> IntentReading:
    return IntentReading.model_validate({"confidence": 0.9, **kw})


def test_a_confident_record_keeps_the_whole_text_and_its_occurred_date() -> None:
    r = decide(
        reading(intent="record", occurred="2015", record_text="认识了小李"),
        text="2015 年读大学时在社团认识了小李",
        threshold=THRESHOLD,
        today=TODAY,
    )
    assert (r.intent, r.uncertain, r.confidence) == (Intent.RECORD, False, 0.9)
    assert r.record_text == "2015 年读大学时在社团认识了小李"  # the user's own words
    assert r.occurred == PartialDate(2015)
    assert r.question is None and r.reply is None


def test_a_confident_question_asks_the_whole_text() -> None:
    r = decide(reading(intent="ask"), text="老张喜欢什么", threshold=THRESHOLD, today=TODAY)
    assert (r.intent, r.question, r.record_text) == (Intent.ASK, "老张喜欢什么", None)


def test_record_and_ask_splits_the_message() -> None:
    r = decide(
        reading(intent="record_ask", record_text="老张升职了", question="老张现在在哪个部门？"),
        text="老张升职了，他现在在哪个部门？",
        threshold=THRESHOLD,
        today=TODAY,
    )
    assert r.intent is Intent.RECORD_ASK
    assert (r.record_text, r.question) == ("老张升职了", "老张现在在哪个部门？")


def test_record_and_ask_without_a_question_part_is_a_record() -> None:
    r = decide(
        reading(intent="record_ask", record_text="老张升职了", question=" "),
        text="老张升职了",
        threshold=THRESHOLD,
        today=TODAY,
    )
    assert (r.intent, r.record_text, r.question) == (Intent.RECORD, "老张升职了", None)


def test_record_and_ask_without_a_record_part_is_a_question() -> None:
    r = decide(
        reading(intent="record_ask", record_text=None, question="老张在哪个部门？"),
        text="老张在哪个部门？",
        threshold=THRESHOLD,
        today=TODAY,
    )
    assert (r.intent, r.question, r.record_text) == (Intent.ASK, "老张在哪个部门？", None)


def test_chitchat_gets_the_models_short_reply_or_a_default() -> None:
    r = decide(
        reading(intent="chitchat", reply="不客气～"), text="谢谢", threshold=THRESHOLD, today=TODAY
    )
    assert (r.intent, r.uncertain, r.reply) == (Intent.CHITCHAT, False, "不客气～")
    bare = decide(reading(intent="chitchat"), text="嗯", threshold=THRESHOLD, today=TODAY)
    assert bare.reply == DEFAULT_REPLY


@pytest.mark.parametrize("intent", ["record", "ask", "record_ask", "chitchat"])
def test_below_the_threshold_everything_is_uncertain_chitchat(intent: str) -> None:
    r = decide(
        reading(intent=intent, confidence=0.69, occurred="2026-11"),
        text="老张最近好像换工作了吧",
        threshold=THRESHOLD,
        today=TODAY,
    )
    assert (r.intent, r.uncertain, r.confidence) == (Intent.CHITCHAT, True, 0.69)
    assert r.reply == UNCERTAIN_REPLY == "我没确定你是想记下来还是查询"
    assert r.occurred == PartialDate(2026, 11)  # kept for 「记下来」


def test_exactly_the_threshold_is_confident_enough() -> None:
    r = decide(reading(intent="record", confidence=0.7), text="x", threshold=0.7, today=TODAY)
    assert (r.intent, r.uncertain) == (Intent.RECORD, False)


@pytest.mark.parametrize(
    ("given", "expected"),
    [
        ("2015", PartialDate(2015)),
        ("2026-11", PartialDate(2026, 11)),
        ("2026-11-14", PartialDate(2026, 11, 14)),
        ("2026-11-16", PartialDate(2026, 11, 16)),
        (None, None),
        ("", None),
        ("上周末", None),  # not a date: today
        ("2026-02-30", None),
        ("2026-11-17", None),  # the future is never an occurred date: today
        ("2026-12", None),
        ("2027", None),
    ],
)
def test_the_occurred_date_is_validated_with_its_precision(
    given: str | None, expected: PartialDate | None
) -> None:
    r = decide(reading(intent="record", occurred=given), text="x", threshold=0.7, today=TODAY)
    assert r.occurred == expected


@pytest.mark.parametrize(("given", "expected"), [(1.4, 1.0), (-0.2, 0.0), ("0.8", 0.8)])
def test_confidence_is_clamped_to_zero_one(given: object, expected: float) -> None:
    assert IntentReading.model_validate({"intent": "ask", "confidence": given}).confidence == (
        expected
    )


def test_an_unrecognized_message_is_uncertain_chitchat() -> None:
    r = unrecognized()
    assert (r.intent, r.uncertain, r.confidence, r.reply) == (
        Intent.CHITCHAT,
        True,
        0.0,
        UNCERTAIN_REPLY,
    )


# --- fast path for clear questions ----------------------------------------------------


@pytest.mark.parametrize(
    "text",
    [
        "我是怎么认识小王的？",
        "老张的生日是哪天？",
        "谁介绍我认识的阿芳?",
        "哪些朋友在杭州？",
        "小李现在在哪上班？",
        "我和老周认识多少年了？",
        "老张升职了吗？",
    ],
)
def test_a_clear_single_clause_question_takes_the_fast_path(text: str) -> None:
    r = fast_path(text)
    assert r is not None
    assert (r.intent, r.confidence, r.uncertain, r.question) == (
        Intent.ASK,
        FAST_PATH_CONFIDENCE,
        False,
        text,
    )
    assert r.fast_path


@pytest.mark.parametrize(
    "text",
    [
        "老张升职了，他现在在哪个部门？",  # new information before the question
        "老张喜欢什么",  # no question mark: the model decides
        "小李怎么又换工作了？",  # rhetorical
        "难道老周不知道这事？",
        "今天天气怎么样？",  # nobody in it: maybe chitchat
        "你是谁？",  # talking to Weft
        "小李结婚了？",  # no question word: surprise or question, the model decides
        "听说老张下个月要调去上海分公司当负责人了是真的吗你听说过没有？",  # too long
        "",
    ],
)
def test_anything_less_clear_goes_to_the_model(text: str) -> None:
    assert fast_path(text) is None
