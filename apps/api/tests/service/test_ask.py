"""问答 over the seed graph with hand-authored DeepSeek tool-calling transcripts.

AC-36: each of the six question kinds calls the right tool and answers from its data.
AC-37: every claim cites the Entries behind it; 转述 is said in the text.
AC-38: nothing in the graph -> 「图谱里没有相关信息」, even if the model makes something up.
AC-39: a tenant argument from the model is refused. AC-40: the daily ask quota.
AC-14 (Q&A part): an outdated fact is still answerable as history. AC-23: 你的评价.
"""

from __future__ import annotations

import re
from collections.abc import AsyncIterator

import pytest

from tests.support import asks
from tests.support.asks import PROFILE, UNKNOWN, final
from tests.support.llm_script import LLMScript
from tests.support.seeded import SeededUser, seeded_user
from weft.domain.answer import Answer, AnswerKind
from weft.domain.answering import NO_ANSWER_TEXT, unknown_subject
from weft.domain.confidence import Confidence
from weft.domain.quota import LIMIT_REACHED_MESSAGE
from weft.domain.tenancy import tenant_scope
from weft.infra import Infra
from weft.services import ask
from weft.services.ask_tools import AskSession
from weft.services.results import Err, Ok

pytestmark = pytest.mark.service


@pytest.fixture
async def s(infra: Infra) -> AsyncIterator[SeededUser]:
    seeded = await seeded_user(infra)
    with tenant_scope(seeded.user.tenant):
        yield seeded


async def asked(infra: Infra, question: str) -> ask.Asked:
    result = await ask.ask(infra, question)
    assert isinstance(result, Ok), result
    return result.value


def text_of(answer: Answer) -> str:
    return "".join(seg.text for seg in answer.segments)


def every_claim_is_cited(answer: Answer) -> bool:
    return all(seg.citations for seg in answer.segments)


# --- the six kinds (AC-36) ---------------------------------------------------------------


async def test_a_profile_question_reads_the_profile_and_cites_every_claim(
    infra: Infra, llm: LLMScript, s: SeededUser
) -> None:
    asks.laozhang_profile(llm)
    result = await asked(infra, PROFILE)
    answer = result.answer
    assert result.tool_calls == ["read_profile"]
    assert answer.kind is AnswerKind.TEXT and every_claim_is_cited(answer)
    assert [p.name for p in answer.persons] == ["张伟"]
    by_index = {c.index: c for c in answer.citations}
    opinion = [by_index[i] for i in answer.segments[1].citations]
    assert [c.is_opinion for c in opinion] == [True]  # AC-23
    assert "急性子" in by_index[answer.segments[0].citations[0]].entry_excerpt
    hearsay = by_index[answer.segments[2].citations[0]]
    assert (hearsay.confidence, str(hearsay.occurred_on)) == (Confidence.HEARSAY, "2026-10-08")
    assert {c.entry_id for c in answer.citations} <= set(s.entries)


INTERNAL_NAME = re.compile(r"[A-Z]+_[A-Z_]+")
RELATIONSHIP = "老张和小李是什么关系？"


async def test_a_pair_question_reads_the_relationship_and_says_it_is_hearsay(
    infra: Infra, llm: LLMScript, s: SeededUser
) -> None:
    llm.ask(
        RELATIONSHIP,
        [("read_relationship", {"person_a": "老张", "person_b": "小李"})],
        final(
            "text",
            ("据小王说，老张和小李以前是大学室友，现在关系紧张。", ["E3"]),
            ("今年九月两人因为借钱闹掰了。", ["E2"]),
            persons=["P1", "P2"],
        ),
    )
    result = await asked(infra, RELATIONSHIP)
    answer = result.answer
    assert result.tool_calls == ["read_relationship"]
    assert "大学室友" in text_of(answer) and every_claim_is_cited(answer)
    assert answer.segments[1].text == "据转述，今年九月两人因为借钱闹掰了。"  # AC-37
    assert {c.confidence for c in answer.citations} == {Confidence.HEARSAY}
    pair = answer.citations[0].pair
    assert pair is not None and [p.name for p in pair] == ["张伟", "李明"]
    assert "借钱" in answer.citations[0].entry_excerpt
    # style refresh AC-9: the event between them is labelled in Chinese for the model, and
    # no internal name (RELATED_EVENT …) is in what the user reads
    assert "两人之间的事" in " ".join(llm.tool_outputs)
    assert not INTERNAL_NAME.search(text_of(answer))


HOW_MET = "我是怎么认识小王的？"


async def test_a_how_did_i_meet_question_answers_with_the_chain_of_persons(
    infra: Infra, llm: LLMScript, s: SeededUser
) -> None:
    llm.ask(
        HOW_MET,
        [("find_path", {"from_person": "我", "to_person": "小王"})],
        final(
            "path",
            (
                "你是通过老张认识小王的：老张是你的同组同事，也是小王的老朋友，2024 年 5 月他介绍你们认识。",
                ["E1", "E2", "E3"],
            ),
            path=["P1", "P2", "P3"],
        ),
    )
    result = await asked(infra, HOW_MET)
    assert result.tool_calls == ["find_path"]
    assert result.answer.kind is AnswerKind.PATH
    assert [p.name for p in result.answer.path or []] == ["小明", "张伟", "王浩"]
    assert result.answer.path is not None and result.answer.path[0].is_self


CAMPERS = "谁喜欢露营？"


async def test_a_filter_question_lists_every_matching_person_with_citations(
    infra: Infra, llm: LLMScript, s: SeededUser
) -> None:
    llm.ask(
        CAMPERS,
        [("filter_persons", {"predicate": "LIKES", "object_keywords": ["露营"]})],
        final(
            "list",
            ("图谱里有 5 个人喜欢露营：", ["E1", "E3", "E5", "E7", "E9"]),
            items=[
                {"person": "P1", "subtitle": "据小王说喜欢露营", "evidence": ["E1"]},
                {"person": "P2", "subtitle": "露营认识的朋友", "evidence": ["E3"]},
                {"person": "P4", "subtitle": "邻居", "evidence": ["E5"]},
                {"person": "P5", "subtitle": "老张介绍认识", "evidence": ["E7"]},
                {"person": "P7", "subtitle": "大学同学", "evidence": ["E9"]},
            ],
        ),
    )
    result = await asked(infra, CAMPERS)
    answer = result.answer
    assert result.tool_calls == ["filter_persons"]
    assert answer.kind is AnswerKind.LIST
    assert sorted(i.name for i in answer.items or []) == ["刘洋", "孙悦", "林芳", "王浩", "陈静"]
    assert all(i.citations for i in answer.items or [])


MET_RECENTLY = "最近半年我认识了谁？"


async def test_a_time_question_lists_who_i_met_in_the_period(
    infra: Infra, llm: LLMScript, s: SeededUser
) -> None:
    llm.ask(
        MET_RECENTLY,
        [("time_query", {"kind": "met", "start": "2026-05-16", "end": "2026-11-16"})],
        final(
            "list",
            ("最近半年你新认识了 3 个人：", ["E1", "E2", "E3"]),
            items=[
                {"person": "P1", "subtitle": "2026 年 9 月 · 新客户", "evidence": ["E1"]},
                {"person": "P3", "subtitle": "2026 年 7 月 · 露营认识", "evidence": ["E2"]},
                {"person": "P4", "subtitle": "2026 年 10 月 · 邻居", "evidence": ["E3"]},
            ],
        ),
    )
    result = await asked(infra, MET_RECENTLY)
    assert result.tool_calls == ["time_query"]
    assert sorted(i.name for i in result.answer.items or []) == ["何伟", "孙悦", "林芳"]


FELL_OUT = "老张和小李什么时候闹僵的？"


async def test_a_when_question_reads_the_pair_timeline(
    infra: Infra, llm: LLMScript, s: SeededUser
) -> None:
    llm.ask(
        FELL_OUT,
        [("time_query", {"kind": "pair_events", "person_a": "老张", "person_b": "小李"})],
        final("text", ("据小王说，老张和小李是在 2026 年 9 月因为借钱闹掰的。", ["E1"])),
    )
    result = await asked(infra, FELL_OUT)
    assert result.tool_calls == ["time_query"]
    assert "2026 年 9 月" in text_of(result.answer) and every_claim_is_cited(result.answer)


AT_BYTEDANCE = "我认识的人里有几个在字节跳动上班？"


async def test_a_count_question_answers_a_number_and_who_it_counts(
    infra: Infra, llm: LLMScript, s: SeededUser
) -> None:
    llm.ask(
        AT_BYTEDANCE,
        [("count_persons", {"predicate": "WORKS_AT", "object_keywords": ["字节跳动"]})],
        final(
            "stat",
            ("有 4 个人现在在字节跳动工作：吴昊、张伟、郭佳、钱多多。", ["E2", "E4", "E6", "E8"]),
            stat_persons=["P1", "P3", "P4", "P5"],
        ),
    )
    result = await asked(infra, AT_BYTEDANCE)
    stat = result.answer.stat
    assert result.tool_calls == ["count_persons"]
    assert stat is not None and stat.count == 4
    assert sorted(p.name for p in stat.persons) == ["吴昊", "张伟", "郭佳", "钱多多"]


OUTDOORS = "谁喜欢户外活动？"


async def test_an_open_question_uses_semantic_search(
    infra: Infra, llm: LLMScript, s: SeededUser
) -> None:
    llm.ask(
        OUTDOORS,
        [("semantic_search", {"query": "户外露营"})],
        final(
            "list",
            ("喜欢露营的有这些人：", ["E1", "E3", "E6", "E7", "E11"]),
            items=[
                {"person": p, "evidence": [e]}
                for p, e in [("P1", "E1"), ("P2", "E3"), ("P5", "E6"), ("P6", "E7"), ("P9", "E11")]
            ],
        ),
    )
    result = await asked(infra, OUTDOORS)
    assert result.tool_calls == ["semantic_search"]
    assert sorted(i.name for i in result.answer.items or []) == [
        "刘洋",
        "孙悦",
        "林芳",
        "王浩",
        "陈静",
    ]


FORMER_JOB = "小李以前在哪工作？"


async def test_an_outdated_fact_is_answered_as_history(
    infra: Infra, llm: LLMScript, s: SeededUser
) -> None:
    llm.ask(
        FORMER_JOB,
        [("read_profile", {"person": "小李"})],
        final(
            "text",
            ("小李 2023 年 2 月到 2026 年 9 月在字节跳动工作，现在在阿里巴巴。", ["E2", "E3"]),
        ),
    )
    answer = (await asked(infra, FORMER_JOB)).answer
    excerpts = [c.entry_excerpt for c in answer.citations]
    assert "小李跟我说他去字节跳动上班了。" in excerpts  # AC-14: history is answerable


# --- no answer (AC-38) ---------------------------------------------------------------------


async def test_an_unknown_person_gets_no_answer(
    infra: Infra, llm: LLMScript, s: SeededUser
) -> None:
    asks.unknown_person(llm)  # the model goes on to describe 老张 and 小王 instead
    result = await asked(infra, UNKNOWN)
    answer = result.answer
    assert result.tool_calls[0] == "find_person" and "read_profile" in result.tool_calls
    assert answer.kind is AnswerKind.NO_ANSWER
    assert text_of(answer) == NO_ANSWER_TEXT and answer.citations == []
    assert answer.persons == []


NOBODY = "小赵喜欢什么？"


async def test_a_declared_subject_nobody_answers_to_gets_no_answer(
    infra: Infra, llm: LLMScript, s: SeededUser
) -> None:
    llm.ask(
        NOBODY,
        [("semantic_search", {"query": "小赵 喜好"})],
        final("text", ("小赵喜欢露营。", ["E1"]), subjects=["小赵"]),
    )
    answer = (await asked(infra, NOBODY)).answer
    assert answer.kind is AnswerKind.NO_ANSWER and answer.citations == []


LAOZHANG_LIKES = "老张有什么爱好？"


async def test_a_question_about_a_near_name_that_exists_is_still_answered(
    infra: Infra, llm: LLMScript, s: SeededUser
) -> None:
    llm.ask(
        LAOZHANG_LIKES,
        [("find_person", {"name": "老张"})],
        [("read_profile", {"person": "P1"})],
        final(
            "text",
            ("图谱里没有记录老张的喜好；他是个急性子，在字节跳动工作。", ["E1", "E2"]),
            subjects=["老张"],
            persons=["P1"],
        ),
    )
    answer = (await asked(infra, LAOZHANG_LIKES)).answer
    assert answer.kind is AnswerKind.TEXT and every_claim_is_cited(answer)
    assert [p.name for p in answer.persons] == ["张伟"]
    assert {c.entry_id for c in answer.citations} <= set(s.entries)


LAOZHANG_HOBBY = "老张平时爱干什么？"


async def test_an_answer_about_someone_other_than_the_subject_gets_no_answer(
    infra: Infra, llm: LLMScript, s: SeededUser
) -> None:
    llm.ask(
        LAOZHANG_HOBBY,
        [("find_person", {"name": "老张"}), ("find_person", {"name": "王浩"})],
        [("read_profile", {"person": "P2"})],
        final("text", ("小王特别喜欢露营。", ["E1"]), subjects=["老张"], persons=["P2"]),
        final("text", ("小王特别喜欢露营。", ["E1"]), subjects=["老张"], persons=["P2"]),
    )
    answer = (await asked(infra, LAOZHANG_HOBBY)).answer
    assert answer.kind is AnswerKind.NO_ANSWER and answer.persons == []
    assert "不是关于老张的" in llm.tool_outputs[-1]  # told once; the same answer stays out


WIFE_JOB = "老张的老婆是做什么的？"


async def test_an_answer_told_it_is_off_its_subject_can_cite_the_missing_link(
    infra: Infra, llm: LLMScript, s: SeededUser
) -> None:
    """黄丽's own fact does not say she is 老张's wife; with the relationship cited it does."""
    llm.ask(
        WIFE_JOB,
        [("find_person", {"name": "黄丽"})],
        [("read_profile", {"person": "P1"})],
        final(
            "text", ("据老张说，他老婆黄丽是中学老师。", ["E1"]), subjects=["老张"], persons=["P1"]
        ),
        [("read_relationship", {"person_a": "老张", "person_b": "P1"})],
        final(
            "text",
            ("据老张说，他老婆黄丽是中学老师。", ["E1", "E2"]),
            subjects=["老张"],
            persons=["P1"],
        ),
    )
    answer = (await asked(infra, WIFE_JOB)).answer
    assert answer.kind is AnswerKind.TEXT and "中学" in text_of(answer)
    assert {p.name for p in answer.persons} == {"黄丽"}


# --- relation phrases as subjects ----------------------------------------------------------


@pytest.mark.parametrize(
    ("declared", "meant"),
    [
        ("我老婆", {"刘婷"}),
        ("老张的老婆", {"黄丽"}),
        ("黄丽的老公", {"张伟"}),  # no relationship says 老公: 配偶 does
        ("我老婆的闺蜜", {"杜鹃"}),
        ("刘婷的闺蜜", {"杜鹃"}),
        ("老张的女儿", {"老张的女儿"}),  # a person's own name comes first
        ("我爸爸", {"陈建国"}),
        ("小王的同事", {"刘洋"}),
    ],
)
async def test_a_relation_phrase_resolves_through_the_relationships(
    infra: Infra, s: SeededUser, declared: str, meant: set[str]
) -> None:
    subjects = await AskSession(infra).subjects(f"{declared}是谁？", [declared])
    assert {r.name for r in subjects[declared]} == meant


@pytest.mark.parametrize(
    "declared",
    [
        "陈静的老公",  # 陈静 is someone, with no 老公 in the graph
        "马云的老婆",  # 马云 is nobody
        "王老师",  # a name: 「王」 is nobody exactly
        "老王",
    ],
)
async def test_a_relation_the_graph_lacks_is_still_an_unknown_subject(
    infra: Infra, s: SeededUser, declared: str
) -> None:
    subjects = await AskSession(infra).subjects(f"{declared}是做什么的？", [declared])
    assert unknown_subject(subjects)


@pytest.mark.parametrize("declared", ["他老婆", "那个闺蜜"])
async def test_a_relation_phrase_with_no_named_anchor_is_no_unknown_name(
    infra: Infra, s: SeededUser, declared: str
) -> None:
    """「他老婆」 (whose?) and 「那个闺蜜」 (我 has no 闺蜜 worded so, but 杜鹃 is a friend:
    so it resolves); neither is an unknown name."""
    subjects = await AskSession(infra).subjects(f"{declared}是做什么的？", [declared])
    assert not unknown_subject(subjects)


MY_WIFE = "我老婆是谁？"


async def test_a_question_about_my_wife_is_answered_not_taken_for_an_unknown_name(
    infra: Infra, llm: LLMScript, s: SeededUser
) -> None:
    llm.ask(
        MY_WIFE,
        [("find_person", {"name": "我老婆"})],
        [("read_relationship", {"person_a": "我", "person_b": "老婆"})],
        final(
            "text",
            ("你老婆是刘婷，你们 2019 年在朋友聚会上认识。", ["E1", "E2", "E3", "E4"]),
            subjects=["我老婆"],
            persons=["P2"],
        ),
    )
    answer = (await asked(infra, MY_WIFE)).answer
    assert answer.kind is AnswerKind.TEXT and "刘婷" in text_of(answer)
    assert [p.name for p in answer.persons] == ["刘婷"] and answer.citations


CHENJING_HUSBAND = "陈静的老公是做什么的？"


async def test_a_relation_the_graph_lacks_still_gets_no_answer(
    infra: Infra, llm: LLMScript, s: SeededUser
) -> None:
    """陈静 has no 老公 in the graph: an answer from her own facts is made up."""
    llm.ask(
        CHENJING_HUSBAND,
        [("read_profile", {"person": "陈静"})],
        final(
            "text",
            ("陈静的老公在阿里巴巴工作。", ["E1"]),
            subjects=["陈静的老公"],
            persons=["P1"],
        ),
    )
    answer = (await asked(infra, CHENJING_HUSBAND)).answer
    assert answer.kind is AnswerKind.NO_ANSWER and answer.citations == []


WIFE_WORKPLACE = "老张老婆在哪上班？"


async def test_an_answer_sent_back_on_the_last_round_still_gets_a_lookup(
    infra: Infra, llm: LLMScript, s: SeededUser
) -> None:
    looking = [[("find_person", {"name": "黄丽"})]] * (ask.MAX_TOOL_ROUNDS - 1)
    llm.ask(
        WIFE_WORKPLACE,
        *looking,
        [("read_profile", {"person": "P1"})],
        final(
            "text", ("据老张说，他老婆黄丽是中学老师。", ["E1"]), subjects=["老张"], persons=["P1"]
        ),
        [("read_relationship", {"person_a": "老张", "person_b": "P1"})],
        final(
            "text",
            ("据老张说，他老婆黄丽是中学老师。", ["E1", "E2"]),
            subjects=["老张"],
            persons=["P1"],
        ),
    )
    answer = (await asked(infra, WIFE_WORKPLACE)).answer
    assert answer.kind is AnswerKind.TEXT and "中学" in text_of(answer)


BIRTHDAY = "小李的生日是哪天？"


async def test_a_made_up_answer_without_real_evidence_becomes_no_answer(
    infra: Infra, llm: LLMScript, s: SeededUser
) -> None:
    llm.ask(
        BIRTHDAY,
        [("read_profile", {"person": "小李"})],
        final("text", ("小李的生日是 3 月 5 日。", ["E9"])),  # E9 was never shown
    )
    answer = (await asked(infra, BIRTHDAY)).answer
    assert answer.kind is AnswerKind.NO_ANSWER and "3 月 5 日" not in text_of(answer)


WEATHER = "今天天气怎么样？"


async def test_a_model_that_never_uses_the_tools_gets_no_answer(
    infra: Infra, llm: LLMScript, s: SeededUser
) -> None:
    llm.ask_says(WEATHER, 0, "今天北京晴，气温 12 度。")
    llm.ask_says(WEATHER, 1, "今天北京晴。")
    result = await asked(infra, WEATHER)
    assert result.tool_calls == [] and result.answer.kind is AnswerKind.NO_ANSWER


async def test_used_up_rounds_still_answer_from_what_the_tools_returned(
    infra: Infra, llm: LLMScript, s: SeededUser
) -> None:
    """A model still looking things up when the rounds run out is asked once more, with
    only final_answer offered: what it found is answered, not dropped."""
    question = "老张性格怎么样？"
    looking = [[("read_profile", {"person": "老张"})]] * ask.MAX_TOOL_ROUNDS
    turns = [*looking, [("semantic_search", {"query": "老张 性格"})]]
    llm.ask(
        question,
        *turns,
        final("text", ("老张是个急性子。", ["E1"]), subjects=["老张"], persons=["P1"]),
    )

    result = await asked(infra, question)

    assert result.answer.kind is AnswerKind.TEXT and "急性子" in text_of(result.answer)
    assert result.answer.citations


# --- tenant arguments (AC-39) --------------------------------------------------------------

SMUGGLER = "老张做什么工作？"
FOREIGN_GROUP = "u_ffffffffffffffffffffffffffffffff"


async def test_a_tenant_argument_from_the_model_is_refused(
    infra: Infra, llm: LLMScript, s: SeededUser
) -> None:
    llm.ask(
        SMUGGLER,
        [("read_profile", {"person": "老张", "group_id": FOREIGN_GROUP})],
        [("read_profile", {"person": "老张"})],
        final("text", ("老张在字节跳动工作。", ["E2"])),
    )
    result = await asked(infra, SMUGGLER)
    assert result.tool_calls == ["read_profile", "read_profile"]
    refusal, profile = llm.tool_outputs
    assert "租户" in refusal and "group_id" in refusal and "字节跳动" not in refusal
    assert "字节跳动" in profile
    assert {c.entry_id for c in result.answer.citations} <= set(s.entries)


# --- quota (AC-40) -------------------------------------------------------------------------


async def test_asking_counts_against_a_daily_quota(
    infra: Infra, llm: LLMScript, s: SeededUser
) -> None:
    infra.settings = infra.settings.model_copy(update={"daily_ask_limit": 1})
    asks.unknown_person(llm)
    assert isinstance(await ask.ask(infra, UNKNOWN), Ok)
    refused = await ask.ask(infra, UNKNOWN)
    assert isinstance(refused, Err) and refused.reason == "quota_exceeded"
    assert refused.message == LIMIT_REACHED_MESSAGE
    assert refused.detail["resets_at"] == "2026-11-17T00:00:00+08:00"


@pytest.mark.parametrize("question", ["", "   ", "问" * 501])
async def test_blank_or_overlong_questions_are_refused_without_counting(
    infra: Infra, s: SeededUser, question: str
) -> None:
    result = await ask.ask(infra, question)
    assert isinstance(result, Err) and result.reason in {"blank_question", "question_too_long"}
