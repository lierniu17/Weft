"""Shared hand-authored 问答 transcripts over the seed graph (service and route tests)."""

from __future__ import annotations

from typing import Any

from tests.support.llm_script import LLMScript

Calls = list[tuple[str, dict[str, Any]]]


def final(kind: str, *segments: tuple[str, list[str]], **rest: Any) -> Calls:
    """The model's ``final_answer`` call: (text, evidence handles) segments plus the body."""
    body = {"kind": kind, "segments": [{"text": t, "evidence": e} for t, e in segments], **rest}
    return [("final_answer", body)]


PROFILE = "老张是个什么样的人？"


def laozhang_profile(llm: LLMScript) -> None:
    llm.ask(
        PROFILE,
        [("read_profile", {"person": "老张"})],
        final(
            "text",
            ("老张（张伟）是你在字节跳动的同组同事，性格是急性子。", ["E1", "E2"]),
            ("你评价他做事很靠谱。", ["E4"]),
            ("据小王说，他和小李因为借钱闹掰了。", ["E3"]),
            persons=["P1"],
            follow_ups=["老张和小李是什么关系？"],
        ),
    )


UNKNOWN = "老王喜欢什么？"


def unknown_person(llm: LLMScript) -> None:
    """老王 is nobody; the model says so, then answers about the near names 老张 and 小王 —
    what DeepSeek really did in the Q&A eval. The answer must still be no_answer."""
    llm.ask(
        UNKNOWN,
        [("find_person", {"name": "老王"})],
        [("find_person", {"name": "老张"}), ("find_person", {"name": "王浩"})],
        [("read_profile", {"person": "P1"}), ("read_profile", {"person": "P2"})],
        final(
            "text",
            ("图谱里没有叫“老王”的人。最接近的是老张（张伟），他是个急性子。", ["E1"]),
            ("如果你问的是小王（王浩）：他特别喜欢露营。", ["E5"]),
            persons=["P1", "P2"],
        ),
    )


# --- 对话上下文 (conversation context): 指代确认 and 连续追问 over the seed ------------------

LIKES = "老周喜欢什么？"
WHICH = "你问的是哪位老周？"
TAO = "周涛喜欢什么？"
JIANGUO = "周建国喜欢什么？"
# find_person sorts by name: P1 is 周建国, P2 周涛
TWO_LAOZHOU = [
    {"label": "老周（周涛，大学同学）", "question": TAO, "person": "P2"},
    {"label": "老周（周建国，老家的老邻居）", "question": JIANGUO, "person": "P1"},
]


def which_laozhou(llm: LLMScript) -> None:
    llm.ask(
        LIKES,
        [("find_person", {"name": "老周"})],
        final("clarify", clarify_question=WHICH, options=TWO_LAOZHOU),
    )


def likes_of(llm: LLMScript, question: str, name: str, liked: str) -> None:
    llm.ask(
        question,
        [("read_profile", {"person": name})],
        final("text", (f"{name}喜欢{liked}。", ["E1"]), subjects=[name], persons=["P1"]),
    )


WORKS = "老张在哪上班？"
WIFE = "那他老婆呢？"


def laozhang_works(llm: LLMScript) -> None:
    llm.ask(
        WORKS,
        [("read_profile", {"person": "老张"})],
        final("text", ("老张在字节跳动上班。", ["E1"]), subjects=["老张"], persons=["P1"]),
        history=[],
    )


def wife_follows(llm: LLMScript, history: list[str]) -> None:
    llm.ask(
        WIFE,
        [("find_person", {"name": "老张"})],
        [("read_relationship", {"person_a": "P1", "person_b": "黄丽"})],
        final(
            "text",
            ("老张的老婆黄丽是中学老师。", ["E1"]),
            subjects=["老张"],
            persons=["P2"],
            used_history=True,
        ),
        history=history,
    )


def wife_alone(llm: LLMScript) -> None:
    llm.ask(WIFE, final("no_answer"), history=[])


# --- 按描述找人 (context-gaps AC-3) ------------------------------------------------------

NEIGHBOUR = "在市一院上班的那个邻居叫什么？"
NEIGHBOUR_NAMED = "在市一院上班的那个邻居（林芳）叫什么？"  # what the model is asked


def hospital_neighbour(llm: LLMScript) -> None:
    """BOT-2: one neighbour works at 市一院; the model is told it is 林芳 and answers."""
    llm.ask(
        NEIGHBOUR_NAMED,
        [("find_person", {"name": "林芳"})],
        [("read_profile", {"person": "P1"})],
        final(
            "text",
            ("在市一院上班的那个邻居是林芳，她在市一院当护士。", ["E2"]),
            subjects=["在市一院上班的那个邻居"],
            persons=["P1"],
        ),
    )


__all__ = [
    "JIANGUO",
    "LIKES",
    "NEIGHBOUR",
    "NEIGHBOUR_NAMED",
    "PROFILE",
    "TAO",
    "TWO_LAOZHOU",
    "UNKNOWN",
    "WHICH",
    "WIFE",
    "WORKS",
    "Calls",
    "final",
    "hospital_neighbour",
    "laozhang_profile",
    "laozhang_works",
    "likes_of",
    "unknown_person",
    "which_laozhou",
    "wife_alone",
    "wife_follows",
]
