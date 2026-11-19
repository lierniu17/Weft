"""Eval runners' plumbing with scripted LLM answers (the real runs need API keys).

``weft.eval.extraction`` runs the real extraction pipeline over a sample (its graph context
seeded into a throwaway tenant) and scores it with ``eval/extraction/score.py``;
``weft.eval.qa`` seeds a throwaway account, asks the questions and grades the answers.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import httpx
import pytest

from tests.support import asks
from tests.support import scenarios as sc
from tests.support.llm_script import LLMScript, ScriptGate
from weft.domain.draft import Draft
from weft.eval import clarify as clarify_eval
from weft.eval import extraction as extraction_eval
from weft.eval import intent as intent_eval
from weft.eval import qa as qa_eval
from weft.eval.__main__ import main as eval_main
from weft.eval.qa_score import Question
from weft.infra import Infra, build_infra
from weft.settings import Settings

pytestmark = pytest.mark.service


def sample(sample_id: str) -> dict[str, object]:
    for line in extraction_eval.SAMPLES_PATH.read_text(encoding="utf-8").splitlines():
        row = json.loads(line)
        if row["id"] == sample_id:
            return dict(row)
    raise LookupError(sample_id)


async def test_the_extraction_eval_predicts_a_draft_per_sample_and_scores_it(
    infra: Infra, llm: LLMScript, tmp_path: Path
) -> None:
    oral = sample("oral-01")
    assert oral["text"] == sc.DINNER
    sc.dinner_with_laozhang(llm)

    predictions, report = await extraction_eval.run(infra, [oral])

    [row] = predictions
    draft = Draft.model_validate(row["draft"])
    assert row["id"] == "oral-01"
    assert [(p.mention, p.match.value) for p in draft.persons] == [
        ("老张", "new"),
        ("老张的女儿", "new"),
    ]
    assert report["samples"] == 1 and report["missing_predictions"] == []
    # the script finds 老张 and the descriptor person 老张的女儿, as the gold has
    assert (report["person_precision"], report["person_recall"]) == (1.0, 1.0)
    assert set(report["splits"]) == {"dev"}  # oral-01 is a dev sample
    assert 0 < report["confidence_coverage"] <= 1


async def test_a_sample_whose_extraction_fails_is_reported_missing(
    infra: Infra, llm: LLMScript
) -> None:
    oral = sample("oral-01")
    sc.dinner_with_laozhang(llm)  # then the enrichment call times out
    llm.enrichment_timeout(sc.DINNER)
    predictions, report = await extraction_eval.run(infra, [oral])
    assert predictions == []
    assert report["missing_predictions"] == ["oral-01"]
    assert "oral-01" in report["errors"]


async def test_the_extraction_eval_matches_against_the_samples_graph_context(
    infra: Infra, llm: LLMScript
) -> None:
    # conflict-01's graph context (小李 already 在字节跳动, 本人说) under the scripted text
    conflict = {**sample("conflict-01"), "text": sc.TO_ALIBABA}
    sc.xiaoli_joins_alibaba(llm)
    predictions, _ = await extraction_eval.run(infra, [conflict])
    [row] = predictions
    draft = Draft.model_validate(row["draft"])
    [xiaoli] = [p for p in draft.persons if p.mention == "小李"]
    assert (xiaoli.match.value, xiaoli.person_id) == ("matched", "p-li")
    [job] = [f for f in draft.facts if f.predicate == "WORKS_AT"]
    assert job.conflict is not None and job.conflict.old == "字节跳动"


async def test_the_questions_eval_scores_the_questions_the_drafts_ask(
    infra: Infra, llm: LLMScript
) -> None:
    rows = [
        json.loads(line)
        for line in extraction_eval.QUESTIONS_PATH.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    # the same text twice: 小李 unknown (asked about), and 小李 known as a colleague (not)
    unknown, known = [r for r in rows if r["id"] in ("ask-01", "none-08")]
    assert unknown["text"] == known["text"] == sc.XIAOLI_DINNER
    sc.dinner_with_xiaoli(llm)

    predictions, report = await extraction_eval.run_questions(infra, [unknown, known])

    assert [len(p["draft"]["questions"]) for p in predictions] == [1, 0]
    assert (report["question_hits"], report["gold_questions"]) == (1, 1)
    assert (report["false_questions"], report["complete_records"]) == (0, 1)
    assert report["passed"] and report["errors"] == {}
    assert set(report["splits"]) == {"heldout"}


async def test_the_qa_eval_asks_over_a_seeded_account_and_reports_per_kind(
    infra: Infra, llm: LLMScript
) -> None:
    asks.laozhang_profile(llm)
    asks.unknown_person(llm)
    questions = [
        Question.model_validate(
            {
                "id": "profile-01",
                "kind": "profile",
                "question": asks.PROFILE,
                "gold": {"persons": ["张伟"], "text": ["急性子", "靠谱"]},
            }
        ),
        Question.model_validate(
            {
                "id": "none-01",
                "kind": "no_answer",
                "question": asks.UNKNOWN,
                "gold": {"no_answer": True},
            }
        ),
    ]
    report = await qa_eval.run(infra, questions)
    assert report["per_kind"]["profile"]["accuracy"] == 1.0
    assert report["per_kind"]["no_answer"]["accuracy"] == 1.0
    assert report["fabrication_rate"] == 0.0 and report["errors"] == {}
    assert [d["answer"] for d in report["details"]][1] == "图谱里没有相关信息。"
    # the throwaway account is gone afterwards
    async with infra.sql() as session:
        from sqlalchemy import text

        users = (await session.execute(text("SELECT username FROM users"))).scalars().all()
    assert not [u for u in users if u.startswith("eval_")]


@pytest.mark.parametrize("which", ["extraction", "questions", "qa"])
def test_the_evals_refuse_to_run_without_api_keys(
    which: str, capsys: pytest.CaptureFixture[str]
) -> None:
    keyless = Settings(_env_file=None)
    assert eval_main([which], settings=keyless) == 2
    err = capsys.readouterr().err
    assert "DEEPSEEK_API_KEY" in err and "DASHSCOPE_API_KEY" in err
    assert f"python -m weft.eval {which}" in err


def test_the_intent_eval_needs_only_the_deepseek_key(capsys: pytest.CaptureFixture[str]) -> None:
    keyless = Settings(_env_file=None)
    assert eval_main(["intent"], settings=keyless) == 2
    err = capsys.readouterr().err
    assert "DEEPSEEK_API_KEY" in err and "missing: DEEPSEEK_API_KEY\n" in err


def intent_sample(sample_id: str) -> dict[str, object]:
    for line in intent_eval.SAMPLES_PATH.read_text(encoding="utf-8").splitlines():
        row = json.loads(line)
        if row["id"] == sample_id:
            return dict(row)
    raise LookupError(sample_id)


async def test_the_intent_eval_recognizes_each_sample_on_the_eval_day_and_scores_it(
    settings: Settings, llm: LLMScript
) -> None:
    backfill = intent_sample("backfill-03")  # 昨天晚上和小钱撸串 -> 2026-11-15
    vague = intent_sample("ambig-02")  # 小钱好像要结婚了吧 -> 拿不准
    clear = intent_sample("ask-01")  # 小钱现在在哪家公司？ -> the fast path, no model call
    llm.intent(str(backfill["text"]), "record", confidence=0.95, occurred="2026-11-15")
    llm.intent(str(vague["text"]), "record", confidence=0.5)

    http = httpx.AsyncClient(transport=ScriptGate(llm))
    infra = build_infra(settings, http=http, clock=intent_eval.eval_clock)
    try:
        predictions, report = await intent_eval.run(infra, [backfill, vague, clear])
    finally:
        await infra.aclose()

    by_id = {p["id"]: p for p in predictions}
    assert by_id["backfill-03"]["intent"] == "record"
    assert by_id["backfill-03"]["occurred"] == "2026-11-15"
    assert by_id["ambig-02"]["intent"] == "chitchat" and by_id["ambig-02"]["uncertain"]
    assert by_id["ambig-02"]["raw"]["intent"] == "record"  # what the model said, for diagnosis
    assert by_id["ask-01"]["fast_path"] and by_id["ask-01"]["raw"] is None
    assert report["accuracy"] == 1.0 and report["time_accuracy"] == 1.0
    assert report["errors"] == {} and report["missing_predictions"] == []
    assert set(report["splits"]) <= {"dev", "heldout"}


def clarify_group(group_id: str) -> dict[str, Any]:
    for line in clarify_eval.GROUPS_PATH.read_text(encoding="utf-8").splitlines():
        row = json.loads(line)
        if row["id"] == group_id:
            return dict(row)
    raise LookupError(group_id)


def test_the_clarify_eval_needs_only_the_deepseek_key(capsys: pytest.CaptureFixture[str]) -> None:
    keyless = Settings(_env_file=None)
    assert eval_main(["clarify"], settings=keyless) == 2
    assert "missing: DEEPSEEK_API_KEY\n" in capsys.readouterr().err


async def test_the_clarify_eval_runs_both_rounds_of_each_group_and_scores_them(
    settings: Settings, llm: LLMScript
) -> None:
    more = clarify_group("more-04")  # 蓉蓉好像出事了 / 昨天骑车摔了，腿骨折了
    never = clarify_group("never-01")  # 小田好像回老家了吧 / 算了，不用了
    vague = {**intent_sample("ambig-09"), "split": "dev"}  # 林可
    asked = {
        "question": "你是想记下蓉蓉出了什么事，还是想查蓉蓉的近况？",
        "options": [
            {"label": "查：蓉蓉最近怎么样", "intent": "ask", "question": "蓉蓉最近怎么样？"}
        ],
    }
    llm.intent(more["original"], "record", confidence=0.4, clarify=asked)
    llm.intent_after(
        more["original"],
        more["clarify_question"],
        more["reply"],
        "record",
        answers=True,
        record_text="蓉蓉昨天骑车摔了，腿骨折了",
        occurred="2026-11-15",
    )
    llm.intent(never["original"], "record", confidence=0.5)  # no 反问: not a valid one
    llm.intent_after(
        never["original"],
        never["clarify_question"],
        never["reply"],
        "chitchat",
        answers=True,
        reply="好的",
    )
    llm.intent(
        str(vague["text"]),
        "chitchat",
        confidence=0.3,
        clarify={
            "question": "你想查林可的什么？",
            "options": [{"label": "查：林可是谁", "intent": "ask", "question": "林可是谁？"}],
        },
    )

    http = httpx.AsyncClient(transport=ScriptGate(llm))
    infra = build_infra(settings, http=http, clock=clarify_eval.eval_clock)
    try:
        predictions, report = await clarify_eval.run(infra, [more, never], [vague])
    finally:
        await infra.aclose()

    by_id = {p["id"]: p for p in predictions}
    assert (by_id["more-04"]["answers"], by_id["more-04"]["intent"]) == (True, "record")
    assert by_id["more-04"]["record_text"] == "蓉蓉昨天骑车摔了，腿骨折了"
    assert by_id["more-04"]["occurred"] == "2026-11-15"  # the eval day is 2026-11-16
    assert by_id["more-04"]["round1"]["valid_clarify"]
    assert by_id["never-01"]["round1"] == {**by_id["never-01"]["round1"], "valid_clarify": False}
    assert report["merged_intent_accuracy"] == 1.0 and report["answers_accuracy"] == 1.0
    assert report["valid_clarify_rate"] == pytest.approx(2 / 3)
    assert report["counts"]["invalid_clarify"] == ["never-01"]
    assert report["errors"] == {} and report["missing_predictions"] == []
    assert set(report["splits"]) == {"heldout"}  # both groups are held out
