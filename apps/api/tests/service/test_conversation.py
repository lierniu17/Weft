"""对话上下文 (conversation-context spec), Q&A part, with replayed model answers over the seed.

指代确认: AC-1 (several persons or events: a question and candidates instead of an answer;
one match: answered), AC-2 (clicking a candidate answers it; one ask in all), AC-3 (a typed
answer is merged with the question; 换话题 is an ordinary message; still unsure: answered
by the existing rules, never confirmed twice).

连续追问: AC-9 (the latest answered questions within the window go with a new question, to
问答 and to 意图识别), AC-10 (which 上文 an answer used; 「不接上文」 answers again without
it, counting one ask), AC-11 (listing restores the 指代确认 and 「接着：…」).
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import pytest
from sqlalchemy import text as sql

from tests.support.asks import (
    JIANGUO,
    LIKES,
    TAO,
    TWO_LAOZHOU,
    WHICH,
    WIFE,
    WORKS,
    final,
    laozhang_works,
    likes_of,
    which_laozhou,
    wife_alone,
    wife_follows,
)
from tests.support.llm_script import LLMScript
from tests.support.seeded import SeededUser, seeded_user
from weft.domain.answer import Answer, AnswerKind
from weft.domain.intent import ClarifySource, Intent
from weft.domain.tenancy import tenant_scope
from weft.infra import Infra
from weft.services import messages, usage
from weft.services.results import Err, Ok

pytestmark = pytest.mark.service


@pytest.fixture
async def s(infra: Infra) -> AsyncIterator[SeededUser]:
    seeded = await seeded_user(infra)
    with tenant_scope(seeded.user.tenant):
        yield seeded


async def sent(infra: Infra, text: str) -> messages.Handled:
    result = await messages.send(infra, text)
    assert isinstance(result, Ok), result
    return result.value


async def clicked(infra: Infra, message_id: uuid.UUID, option: int) -> messages.Handled:
    result = await messages.clarify(infra, message_id, option)
    assert isinstance(result, Ok), result
    return result.value


async def asks_used(infra: Infra) -> int:
    return (await usage.today(infra)).ask.used


async def listed(infra: Infra) -> list[messages.MessageView]:
    page = await messages.list_messages(infra)
    assert isinstance(page, Ok)
    return page.value.messages


def text_of_answer(answer: Answer) -> str:
    return "".join(seg.text for seg in answer.segments)


def text_of(view: messages.MessageView) -> str:
    assert view.message.answer is not None
    return "".join(seg.text for seg in view.message.answer.segments)


async def age(infra: Infra, message_id: uuid.UUID, minutes: int) -> None:
    async with infra.sql.begin() as session:
        await session.execute(
            sql(
                "UPDATE messages SET created_at = created_at - make_interval(mins => :m) "
                "WHERE id = :id"
            ),
            {"m": minutes, "id": message_id},
        )


# --- 指代确认: two persons called 老周 (AC-1, AC-2, AC-3) --------------------------------


async def test_two_persons_of_that_name_get_a_confirmation_instead_of_an_answer(
    infra: Infra, llm: LLMScript, s: SeededUser
) -> None:
    which_laozhou(llm)

    handled = await sent(infra, LIKES)

    m = handled.view.message
    assert (m.intent, m.answer, m.uncertain) == (Intent.ASK, None, False)
    assert m.clarify is not None and m.clarify.source is ClarifySource.ASK
    assert m.clarify.question == WHICH
    assert [(o.label, o.intent, o.question, o.person_id) for o in m.clarify.options] == [
        ("老周（周涛，大学同学）", Intent.ASK, TAO, s.ids["周涛"]),
        ("老周（周建国，老家的老邻居）", Intent.ASK, JIANGUO, s.ids["周建国"]),
    ]
    assert m.clarification_resolved_at is None
    assert await asks_used(infra) == 1
    [restored] = await listed(infra)  # AC-11
    assert restored.message.clarify == m.clarify and restored.message.answer is None


async def test_clicking_a_candidate_answers_its_question_without_another_ask(
    infra: Infra, llm: LLMScript, s: SeededUser
) -> None:
    which_laozhou(llm)
    likes_of(llm, TAO, "周涛", "钓鱼")
    asked = await sent(infra, LIKES)

    done = await clicked(infra, asked.view.message.id, 0)

    m = done.view.message
    assert m.answer is not None and m.answer.kind is AnswerKind.TEXT
    assert m.answer.citations and "钓鱼" in text_of(done.view)
    assert m.question == TAO
    assert m.clarification_resolved_at is not None
    assert await asks_used(infra) == 1  # the question's ask covers the confirmation
    again = await messages.clarify(infra, m.id, 1)
    assert isinstance(again, Err) and again.reason == "already_resolved"


async def test_a_typed_answer_says_which_one_and_is_answered_for_free(
    infra: Infra, llm: LLMScript, s: SeededUser
) -> None:
    which_laozhou(llm)
    llm.intent_confirm(LIKES, WHICH, "邻居那个", "ask", answers=True, question=JIANGUO)
    likes_of(llm, JIANGUO, "周建国", "下象棋")
    asked = await sent(infra, LIKES)

    reply = await sent(infra, "邻居那个")

    m = reply.view.message
    assert (m.intent, m.question, m.clarification_of) == (
        Intent.ASK,
        JIANGUO,
        asked.view.message.id,
    )
    assert "下象棋" in text_of(reply.view) and m.clarify is None
    assert await asks_used(infra) == 1  # AC-3: no extra ask
    original, answer = await listed(infra)
    assert original.message.clarification_resolved_at is not None
    assert answer.message.id == m.id


async def test_changing_the_subject_is_an_ordinary_message(
    infra: Infra, llm: LLMScript, s: SeededUser
) -> None:
    which_laozhou(llm)
    llm.intent_confirm(LIKES, WHICH, "早上好呀", "chitchat", answers=False, reply="早上好！")
    asked = await sent(infra, LIKES)

    reply = await sent(infra, "早上好呀")

    assert (reply.view.message.intent, reply.view.message.reply) == (Intent.CHITCHAT, "早上好！")
    assert reply.view.message.clarification_of is None
    original, _ = await listed(infra)
    assert original.message.clarification_resolved_at is None  # still takes a click
    assert await asks_used(infra) == 1
    assert asked.view.message.id == original.message.id


UNSURE_AGAIN = "不记得了"
MERGED = LIKES + UNSURE_AGAIN  # 原问题 + 回答 (merge_text)


async def test_still_unsure_is_answered_by_the_rules_and_never_confirmed_twice(
    infra: Infra, llm: LLMScript, s: SeededUser
) -> None:
    which_laozhou(llm)
    llm.intent_confirm(LIKES, WHICH, UNSURE_AGAIN, "ask", answers=True, confidence=0.4)
    llm.ask(
        MERGED,
        [("find_person", {"name": "老周"})],
        final("clarify", clarify_question=WHICH, options=TWO_LAOZHOU),  # not this time
        final("no_answer", subjects=["老周"]),
    )
    asked = await sent(infra, LIKES)

    reply = await sent(infra, UNSURE_AGAIN)

    m = reply.view.message
    assert (m.intent, m.uncertain, m.question) == (Intent.ASK, False, MERGED)
    assert m.answer is not None and m.answer.kind is AnswerKind.NO_ANSWER
    assert m.clarify is None and m.clarification_of == asked.view.message.id
    assert await asks_used(infra) == 1


async def test_an_unusable_confirmation_goes_back_once_then_there_is_no_answer(
    infra: Infra, llm: LLMScript, s: SeededUser
) -> None:
    question = "老周住在哪？"
    lonely = [{"label": "老周（周涛）", "question": "周涛住在哪？", "person": "P2"}]
    stranger = [*lonely, {"label": "老周（某人）", "question": "某人住在哪？", "person": "P9"}]
    llm.ask(
        question,
        [("find_person", {"name": "老周"})],
        final("clarify", clarify_question=WHICH, options=lonely),
        final("clarify", clarify_question=WHICH, options=stranger),
    )

    handled = await sent(infra, question)

    m = handled.view.message
    assert m.clarify is None and m.answer is not None and m.answer.kind is AnswerKind.NO_ANSWER
    assert "只有一个可能" in llm.tool_outputs[-1]  # the model was told why, once
    assert await asks_used(infra) == 1


async def test_a_confirmation_fixed_after_being_sent_back_is_kept(
    infra: Infra, llm: LLMScript, s: SeededUser
) -> None:
    question = "老周现在在哪？"
    llm.ask(
        question,
        [("find_person", {"name": "老周"})],
        final("clarify", clarify_question=WHICH, options=TWO_LAOZHOU[:1]),
        final("clarify", clarify_question=WHICH, options=TWO_LAOZHOU),
    )

    m = (await sent(infra, question)).view.message

    assert m.clarify is not None and len(m.clarify.options) == 2


# --- 指代确认: one person, several events (AC-1) ---------------------------------------

THAT_THING = "郭佳那事怎么样了？"
WHICH_THING = "你问的是郭佳的哪件事？"
EVENTS = [
    {"label": "升职（2026 年 6 月）", "question": "郭佳升职的事怎么样了？"},
    {"label": "买房（2026 年 10 月）", "question": "郭佳买房的事怎么样了？"},
]


async def test_several_events_get_a_confirmation_naming_no_person(
    infra: Infra, llm: LLMScript, s: SeededUser
) -> None:
    llm.intent(THAT_THING, "ask")
    llm.ask(
        THAT_THING,
        [("read_profile", {"person": "郭佳"})],
        final("clarify", clarify_question=WHICH_THING, options=EVENTS),
    )

    m = (await sent(infra, THAT_THING)).view.message

    assert m.clarify is not None and m.clarify.source is ClarifySource.ASK
    assert [(o.label, o.person_id) for o in m.clarify.options] == [
        ("升职（2026 年 6 月）", None),
        ("买房（2026 年 10 月）", None),
    ]


async def test_one_match_is_answered_directly(infra: Infra, llm: LLMScript, s: SeededUser) -> None:
    llm.intent("周建国喜欢干什么？", "ask")
    likes_of(llm, "周建国喜欢干什么？", "周建国", "下象棋")

    m = (await sent(infra, "周建国喜欢干什么？")).view.message

    assert m.clarify is None and m.answer is not None and m.answer.kind is AnswerKind.TEXT


CLASSMATE = "我的大学同学老周现在在哪工作？"
TAO_WORKS = "周涛现在在哪工作？"


async def test_a_confirmation_the_question_settles_is_answered_as_that_candidate(
    infra: Infra, llm: LLMScript, s: SeededUser
) -> None:
    """「我的大学同学老周」: of the two 老周 only 周涛 is a 大学同学 — no choice to offer."""
    llm.intent(CLASSMATE, "ask")
    llm.ask(
        CLASSMATE,
        [("find_person", {"name": "老周"})],
        final(
            "clarify",
            clarify_question=WHICH,
            options=[
                {"label": "老周（周涛，大学同学）", "question": TAO_WORKS, "person": "P2"},
                {
                    "label": "老周（周建国，老家邻居）",
                    "question": "周建国现在在哪工作？",
                    "person": "P1",
                },
            ],
        ),
    )
    llm.ask(
        TAO_WORKS,
        [("read_profile", {"person": "周涛"})],
        final("text", ("周涛在华为工作。", ["E1", "E2", "E3"]), subjects=["周涛"], persons=["P1"]),
    )

    m = (await sent(infra, CLASSMATE)).view.message

    assert m.clarify is None and m.answer is not None and m.answer.kind is AnswerKind.TEXT
    assert "华为" in text_of_answer(m.answer) and m.answer.citations
    assert await asks_used(infra) == 1


JIANGUO_THING = "周建国那件事后来怎么样了？"
JIANGUO_EVENTS = [
    {"label": "退休（2019 年）", "question": "周建国退休以后怎么样了？"},
    {"label": "摔跤住院（2026 年 9 月）", "question": "周建国摔跤住院后来怎么样了？"},
]


async def test_picking_one_of_several_events_goes_back_to_the_model_once(
    infra: Infra, llm: LLMScript, s: SeededUser
) -> None:
    """周建国 has two events (退休, 摔跤住院): answering 「那件事」 with one is a guess."""
    llm.intent(JIANGUO_THING, "ask")
    llm.ask(
        JIANGUO_THING,
        [("read_profile", {"person": "周建国"})],
        final(
            "text",
            ("据你妈说，周建国 2026 年 9 月摔了一跤，住了半个月院。", ["E3"]),
            subjects=["周建国"],
            persons=["P1"],
        ),
        final("clarify", clarify_question="你问的是周建国的哪件事？", options=JIANGUO_EVENTS),
    )

    m = (await sent(infra, JIANGUO_THING)).view.message

    assert m.clarify is not None and m.answer is None
    assert [o.label for o in m.clarify.options] == ["退休（2019 年）", "摔跤住院（2026 年 9 月）"]
    told = llm.tool_outputs[-1]
    assert "退休" in told and "摔跤住院" in told  # the events the tools had shown
    assert await asks_used(infra) == 1


HOMETOWN_ZHOU_THING = "老家邻居老周那件事后来怎么样了？"


async def test_a_name_two_persons_share_is_narrowed_before_its_events_are_counted(
    infra: Infra, llm: LLMScript, s: SeededUser
) -> None:
    """老周 is 周涛 and 周建国; 「老家」「邻居」 say 周建国, who has two events: answering
    with his latest one is a guess."""
    llm.intent(HOMETOWN_ZHOU_THING, "ask")
    llm.ask(
        HOMETOWN_ZHOU_THING,
        [("find_person", {"name": "老周"})],
        [("read_profile", {"person": "周建国"})],
        final(
            "text",
            ("据你妈说，周建国 2026 年 9 月摔了一跤，住了半个月院。", ["E3"]),
            subjects=["老周"],
            persons=["P1"],
        ),
        final("clarify", clarify_question="你问的是周建国的哪件事？", options=JIANGUO_EVENTS),
    )

    m = (await sent(infra, HOMETOWN_ZHOU_THING)).view.message

    assert m.clarify is not None and m.answer is None
    assert [o.label for o in m.clarify.options] == ["退休（2019 年）", "摔跤住院（2026 年 9 月）"]
    told = llm.tool_outputs[-1]
    assert "退休" in told and "摔跤住院" in told
    assert await asks_used(infra) == 1


async def test_the_one_event_between_two_persons_is_answered_directly(
    infra: Infra, llm: LLMScript, s: SeededUser
) -> None:
    """「老张和小李那事」: 小李 has other events, but only one involves both."""
    question = "老张和小李那事后来怎么样了？"
    llm.intent(question, "ask")
    llm.ask(
        question,
        [("read_relationship", {"person_a": "老张", "person_b": "小李"})],
        final(
            "text",
            ("据小王说，老张和小李今年九月因为借钱闹掰了。", ["E1", "E2", "E3"]),
            subjects=["老张", "小李"],
            persons=["P1", "P2"],
        ),
    )

    m = (await sent(infra, question)).view.message

    assert m.clarify is None and m.answer is not None and m.answer.kind is AnswerKind.TEXT
    assert "闹掰" in text_of_answer(m.answer)


# --- 连续追问 (AC-9, AC-10, AC-11) ----------------------------------------------------------


async def test_a_follow_up_is_read_with_the_previous_question(
    infra: Infra, llm: LLMScript, s: SeededUser
) -> None:
    laozhang_works(llm)
    wife_follows(llm, [WORKS])
    first = await sent(infra, WORKS)

    second = await sent(infra, WIFE)

    m = second.view.message
    assert "黄丽" in text_of(second.view)
    assert m.history_used_of == (first.view.message.id,)
    assert second.view.follows == ((first.view.message.id, WORKS),)
    assert await asks_used(infra) == 2  # every follow-up is an ask
    assert first.view.message.history_used_of == ()
    _, restored = await listed(infra)  # AC-11: 「接着：…」 comes back
    assert restored.follows == ((first.view.message.id, WORKS),)


async def test_a_question_that_does_not_need_the_previous_one_says_so(
    infra: Infra, llm: LLMScript, s: SeededUser
) -> None:
    laozhang_works(llm)
    llm.intent("陈静住在哪里？", "ask", history=[WORKS])
    llm.ask(
        "陈静住在哪里？",
        [("read_profile", {"person": "陈静"})],
        final("text", ("陈静住在杭州。", ["E1"]), subjects=["陈静"], used_history=False),
        history=[WORKS],
    )
    await sent(infra, WORKS)

    m = (await sent(infra, "陈静住在哪里？")).view.message

    assert m.history_used_of == ()


async def test_questions_older_than_the_window_are_not_carried(
    infra: Infra, llm: LLMScript, s: SeededUser
) -> None:
    laozhang_works(llm)
    wife_alone(llm)
    first = await sent(infra, WORKS)
    await age(infra, first.view.message.id, 31)

    m = (await sent(infra, WIFE)).view.message

    assert m.answer is not None and m.answer.kind is AnswerKind.NO_ANSWER
    assert m.history_used_of == ()


async def test_at_most_the_three_latest_answered_questions_are_carried(
    infra: Infra, llm: LLMScript, s: SeededUser
) -> None:
    questions = ["老张现在做什么？", "小李现在做什么？", "小王现在做什么？", "老马现在做什么？"]
    for i, q in enumerate(questions):
        llm.ask(q, final("no_answer"), history=questions[max(0, i - 3) : i])
    llm.ask(WIFE, final("no_answer"), history=questions[1:])
    for q in questions:
        await sent(infra, q)

    await sent(infra, WIFE)  # the scripts only answer the expected 上文


async def test_recognition_reads_a_follow_up_without_a_question_mark_with_the_history(
    infra: Infra, llm: LLMScript, s: SeededUser
) -> None:
    follow = "那他老婆是做什么的"
    laozhang_works(llm)
    llm.intent(follow, "ask", history=[WORKS])
    llm.ask(
        follow,
        [("find_person", {"name": "老张"})],
        final("no_answer", subjects=["老张"], used_history=True),
        history=[WORKS],
    )
    await sent(infra, WORKS)

    m = (await sent(infra, follow)).view.message

    assert m.intent is Intent.ASK
    assert len(m.history_used_of) == 1


async def test_reanswer_drops_the_history_replaces_the_answer_and_counts_an_ask(
    infra: Infra, llm: LLMScript, s: SeededUser
) -> None:
    laozhang_works(llm)
    wife_follows(llm, [WORKS])
    wife_alone(llm)
    await sent(infra, WORKS)
    second = await sent(infra, WIFE)

    result = await messages.reanswer(infra, second.view.message.id)

    assert isinstance(result, Ok), result
    m = result.value.view.message
    assert m.answer is not None and m.answer.kind is AnswerKind.NO_ANSWER
    assert m.history_used_of == () and result.value.view.follows == ()
    assert await asks_used(infra) == 3
    again = await messages.reanswer(infra, m.id)
    assert isinstance(again, Err) and again.reason == "no_history"


async def test_reanswer_needs_an_answer_that_followed_on(
    infra: Infra, llm: LLMScript, s: SeededUser
) -> None:
    laozhang_works(llm)
    first = await sent(infra, WORKS)

    refused = await messages.reanswer(infra, first.view.message.id)

    assert isinstance(refused, Err) and refused.reason == "no_history"
    assert await asks_used(infra) == 1
    missing = await messages.reanswer(infra, uuid.uuid4())
    assert isinstance(missing, Err) and missing.reason == "not_found"


async def test_a_confirmation_the_previous_question_settles_goes_back_to_the_model(
    infra: Infra, llm: LLMScript, s: SeededUser
) -> None:
    """周涛 was just asked about: 「老周喜欢什么？」 then means 周涛, not a 指代确认."""
    works = "周涛在哪工作？"
    llm.intent(works, "ask")
    llm.ask(
        works,
        [("read_profile", {"person": "周涛"})],
        final("text", ("周涛在华为工作。", ["E1"]), subjects=["周涛"], persons=["P1"]),
        history=[],
    )
    llm.ask(
        LIKES,
        [("find_person", {"name": "老周"})],
        final("clarify", clarify_question=WHICH, options=TWO_LAOZHOU),
        [("read_profile", {"person": "P2"})],
        final(
            "text",
            ("周涛最近迷上了钓鱼。", ["E1"]),
            subjects=["周涛"],
            persons=["P2"],
            used_history=True,
        ),
        history=[works],
    )
    first = await sent(infra, works)

    m = (await sent(infra, LIKES)).view.message

    assert m.clarify is None and m.answer is not None and "钓鱼" in text_of_answer(m.answer)
    assert "上文刚问过周涛" in llm.tool_outputs[-2]
    assert m.history_used_of == (first.view.message.id,)
