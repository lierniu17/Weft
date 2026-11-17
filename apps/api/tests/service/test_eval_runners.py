"""Eval runners' plumbing with scripted LLM answers (the real runs need API keys).

``weft.eval.extraction`` runs the real extraction pipeline over a sample (its graph context
seeded into a throwaway tenant) and scores it with ``eval/extraction/score.py``;
``weft.eval.qa`` seeds a throwaway account, asks the questions and grades the answers.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from tests.support import asks
from tests.support import scenarios as sc
from tests.support.llm_script import LLMScript
from weft.domain.draft import Draft
from weft.eval import extraction as extraction_eval
from weft.eval import qa as qa_eval
from weft.eval.__main__ import main as eval_main
from weft.eval.qa_score import Question
from weft.infra import Infra
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
    assert [(p.mention, p.match.value) for p in draft.persons] == [("老张", "new")]
    assert report["samples"] == 1 and report["missing_predictions"] == []
    assert report["person_f1"] == 1.0
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


@pytest.mark.parametrize("which", ["extraction", "qa"])
def test_the_evals_refuse_to_run_without_api_keys(
    which: str, capsys: pytest.CaptureFixture[str]
) -> None:
    keyless = Settings(_env_file=None)
    assert eval_main([which], settings=keyless) == 2
    err = capsys.readouterr().err
    assert "DEEPSEEK_API_KEY" in err and "DASHSCOPE_API_KEY" in err
    assert f"python -m weft.eval {which}" in err
