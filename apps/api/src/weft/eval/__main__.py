"""Quality evals with the real models (not in CI; spec 「测试决策 → 质量评测」).

    uv run python -m weft.eval extraction [--samples PATH] [--split dev|heldout] [--limit N]
                                          [--out DIR] [--record DIR]
    uv run python -m weft.eval qa         [--questions PATH] [--out DIR] [--record DIR]

* ``extraction`` (AC-42): the real pipeline over ``eval/extraction/samples.jsonl``, scored
  by ``eval/extraction/score.py`` (person F1 ≥ 0.9, relationship-type and confidence
  accuracy ≥ 0.8).
* ``qa`` (AC-36, AC-38): ``eval/qa/questions.jsonl`` over the seed graph; per-kind accuracy
  and the fabrication rate on the no-answer questions (must be 0).

Both need ``DEEPSEEK_API_KEY`` and ``DASHSCOPE_API_KEY`` (environment or ``apps/api/.env``)
and the docker compose Postgres + Neo4j. ``--record DIR`` also saves every model response
as replay fixtures. Reports go to ``--out`` (default ``eval/out``); exit 1 if a threshold
is missed, 2 if the run cannot start.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from collections.abc import Sequence
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from weft.eval import extraction, qa
from weft.eval.qa_score import QUESTIONS_PATH, load_questions, to_json
from weft.infra import build_infra
from weft.llm import ReplayMode
from weft.repositories.graph_schema import ensure_graph_schema
from weft.settings import API_DIR, Settings, get_settings

OUT_DIR = API_DIR / "eval" / "out"

NO_KEYS = """\
The {which} eval calls the real models and needs API keys; nothing was run.

  1. Put the keys in apps/api/.env (or export them):
       DEEPSEEK_API_KEY=sk-...        # DeepSeek: chat, extraction, Q&A
       DASHSCOPE_API_KEY=sk-...       # 通义千问 DashScope: text-embedding-v4
  2. Start the databases from the repository root:  docker compose up -d
  3. Run it from apps/api:
       uv run python -m weft.eval {which}
     (add --record tests/fixtures/llm-eval to also save the responses as replay fixtures)
"""


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m weft.eval", description=__doc__)
    sub = parser.add_subparsers(dest="which", required=True)
    ext = sub.add_parser("extraction", help="extraction quality (AC-42)")
    ext.add_argument("--samples", type=Path, default=extraction.SAMPLES_PATH)
    ext.add_argument(
        "--split", choices=("dev", "heldout"), default=None, help="only that split's samples"
    )
    ext.add_argument("--limit", type=int, default=None, help="only the first N samples")
    qa_cmd = sub.add_parser("qa", help="Q&A quality (AC-36, AC-38)")
    qa_cmd.add_argument("--questions", type=Path, default=QUESTIONS_PATH)
    for cmd in (ext, qa_cmd):
        cmd.add_argument("--out", type=Path, default=OUT_DIR)
        cmd.add_argument("--record", type=Path, default=None, help="save replay fixtures here")
    return parser


def _missing_keys(settings: Settings) -> list[str]:
    missing = []
    if not settings.deepseek_api_key.get_secret_value():
        missing.append("DEEPSEEK_API_KEY")
    if not settings.dashscope_api_key.get_secret_value():
        missing.append("DASHSCOPE_API_KEY")
    return missing


def _write(out: Path, name: str, report: dict[str, Any]) -> Path:
    out.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    path = out / f"{name}-{stamp}.json"
    path.write_text(to_json(report), encoding="utf-8", newline="\n")
    return path


async def _run(args: argparse.Namespace, settings: Settings) -> int:
    if args.record is not None:
        settings = settings.model_copy(
            update={"llm_replay_mode": ReplayMode.RECORD, "llm_fixtures_dir": args.record}
        )
    clock = qa.eval_clock if args.which == "qa" else None
    infra = build_infra(settings, clock=clock) if clock else build_infra(settings)
    try:
        await ensure_graph_schema(infra.neo4j)
        if args.which == "extraction":
            lines = args.samples.read_text(encoding="utf-8").splitlines()
            samples = [json.loads(line) for line in lines if line.strip()]
            samples = extraction.load_scorer().select(samples, args.split)[: args.limit]
            predictions, report = await extraction.run(infra, samples)
            report["predictions"] = predictions
            passed = bool(report["passed"]) and not report["errors"]
        else:
            report = await qa.run(infra, load_questions(args.questions))
            passed = bool(report["passed"]) and not report["errors"]
    finally:
        await infra.aclose()
    path = _write(args.out, args.which, report)
    summary = {k: v for k, v in report.items() if k not in {"details", "predictions"}}
    print(to_json(summary))
    print(f"full report: {path}")
    return 0 if passed else 1


def main(argv: Sequence[str] | None = None, *, settings: Settings | None = None) -> int:
    args = _parser().parse_args(list(sys.argv[1:] if argv is None else argv))
    settings = settings or get_settings()
    missing = _missing_keys(settings)
    if missing:
        print(f"missing: {', '.join(missing)}", file=sys.stderr)
        print(NO_KEYS.format(which=args.which), file=sys.stderr)
        return 2
    return asyncio.run(_run(args, settings))


if __name__ == "__main__":
    sys.exit(main())
