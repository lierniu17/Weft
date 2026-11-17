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


__all__ = ["PROFILE", "UNKNOWN", "Calls", "final", "laozhang_profile", "unknown_person"]
