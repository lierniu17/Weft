"""Q&A quality eval runner (AC-36, AC-38): ``eval/qa/questions.jsonl`` over the seed graph.

Registers a throwaway account (``eval_…``), writes the seed graph into it
(``weft.services.seed``), asks every question through the real 问答 path
(``weft.services.ask``), grades the answers (``weft.eval.qa_score``) and deletes the account.
The clock is pinned to 2026-11-16 (Beijing), the date the seed and the questions assume.

对话上下文 (conversation-context AC-12): an item with ``history`` is a short conversation.
Its earlier questions are asked first, one minute apart and ``history_minutes_ago`` before
the last one, each read with the 上文 of the turns before it; the last question is then
answered with the 上文 the production rule picks (``select_history``: at most 3 turns
within the window). Items are independent: each has its own 上文.
"""

from __future__ import annotations

import asyncio
import logging
import secrets
import uuid
from collections.abc import Mapping
from datetime import UTC, datetime, timedelta
from typing import Any

from weft.domain.answer import Answer
from weft.domain.conversation import HistoryTurn, select_history
from weft.domain.tenancy import TenantContext, tenant_scope
from weft.eval.qa_score import Question, score
from weft.infra import Infra
from weft.services import accounts, ask, invites, seed
from weft.services.results import Err

logger = logging.getLogger(__name__)

EVAL_NOW = datetime(2026, 11, 16, 4, 0, tzinfo=UTC)  # 12:00 Beijing
CONCURRENCY = 1  # sequential, like the original runner: answers never compete for the graph


def eval_clock() -> datetime:
    return EVAL_NOW


def _aliases(persons: Mapping[str, str]) -> dict[str, tuple[str, ...]]:
    """Canonical name -> aliases, from the seed's name / alias -> id map."""
    by_id: dict[str, list[str]] = {}
    for name, pid in persons.items():
        by_id.setdefault(pid, []).append(name)
    out: dict[str, tuple[str, ...]] = {}
    for names in by_id.values():
        canonical, *aliases = names  # the seed lists a person's name before its aliases
        out[canonical] = tuple(aliases)
    return out


class _Asked:
    def __init__(self) -> None:
        self.answers: dict[str, Answer] = {}
        self.used_history: dict[str, bool] = {}
        self.turns: dict[str, list[str]] = {}  # earlier questions' answers, for the report
        self.errors: dict[str, str] = {}


async def _conversation(infra: Infra, q: Question, out: _Asked) -> None:
    """Ask the item's earlier questions, then the question itself with its 上文."""
    window = timedelta(minutes=infra.settings.history_window_minutes)
    final_at = EVAL_NOW
    first_at = final_at - timedelta(minutes=q.history_minutes_ago + len(q.history) - 1)
    turns: list[HistoryTurn] = []
    earlier: list[str] = []
    asked_at = [first_at + timedelta(minutes=i) for i in range(len(q.history))]
    steps = [*zip(q.history, asked_at, strict=True), (q.question, final_at)]
    for step, (text, at) in enumerate(steps):
        refused = ask.check_question(text) or await ask.charge(infra)
        if refused is not None:
            out.errors[q.id] = f"{refused.reason}: {refused.message}"
            return
        history = select_history(turns, now=at, window=window)
        result = await ask.answer(infra, text, history=history)
        if isinstance(result, Err):
            out.errors[q.id] = f"{result.reason}: {result.message}"
            return
        if step == len(q.history):  # the question itself
            out.answers[q.id] = result.value.answer
            out.used_history[q.id] = result.value.used_history
            out.turns[q.id] = earlier
            return
        turns.append(HistoryTurn.of(uuid.uuid4(), text, result.value.answer, at))
        earlier.append("".join(s.text for s in result.value.answer.segments))


async def run(infra: Infra, questions: list[Question]) -> dict[str, Any]:
    asks = sum(1 + len(q.history) for q in questions)
    infra.settings = infra.settings.model_copy(
        update={"daily_ask_limit": max(infra.settings.daily_ask_limit, asks + 1)}
    )
    [code] = await invites.generate(infra, 1)
    password = secrets.token_urlsafe(16)
    registered = await accounts.register(
        infra,
        invite_code=code,
        username=f"eval_{secrets.token_hex(4)}",
        password=password,
        display_name="小明",
    )
    if isinstance(registered, Err):
        raise RuntimeError(f"cannot create the eval account: {registered.message}")
    tenant = TenantContext.for_user(registered.value.user.id)
    out = _Asked()
    with tenant_scope(tenant):
        try:
            seeded = await seed.seed_graph(infra)
            if isinstance(seeded, Err):
                raise RuntimeError(seeded.message)
            gate = asyncio.Semaphore(CONCURRENCY)

            async def one(q: Question) -> None:
                async with gate:
                    try:
                        await _conversation(infra, q, out)
                    except Exception as exc:  # one failed question must not stop the run
                        logger.warning("qa eval: %s failed: %r", q.id, exc)
                        out.errors[q.id] = f"{type(exc).__name__}: {str(exc)[:200]}"

            await asyncio.gather(*(one(q) for q in questions))
            aliases = _aliases(seeded.value.persons)
        finally:
            await accounts.delete_account(infra, password=password)
    return score(
        questions,
        out.answers,
        aliases,
        errors=out.errors,
        used_history=out.used_history,
        turns=out.turns,
    )


__all__ = ["EVAL_NOW", "eval_clock", "run"]
