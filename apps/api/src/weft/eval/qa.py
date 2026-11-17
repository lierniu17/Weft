"""Q&A quality eval runner (AC-36, AC-38): ``eval/qa/questions.jsonl`` over the seed graph.

Registers a throwaway account (``eval_…``), writes the seed graph into it
(``weft.services.seed``), asks every question through the real 问答 path
(``weft.services.ask``), grades the answers (``weft.eval.qa_score``) and deletes the account.
The clock is pinned to 2026-11-16 (Beijing), the date the seed and the questions assume.
"""

from __future__ import annotations

import logging
import secrets
from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Any

from weft.domain.answer import Answer
from weft.domain.tenancy import TenantContext, tenant_scope
from weft.eval.qa_score import Question, score
from weft.infra import Infra
from weft.services import accounts, ask, invites, seed
from weft.services.results import Err, Ok

logger = logging.getLogger(__name__)

EVAL_NOW = datetime(2026, 11, 16, 4, 0, tzinfo=UTC)  # 12:00 Beijing


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


async def run(infra: Infra, questions: list[Question]) -> dict[str, Any]:
    infra.settings = infra.settings.model_copy(
        update={"daily_ask_limit": max(infra.settings.daily_ask_limit, len(questions) + 1)}
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
    answers: dict[str, Answer] = {}
    errors: dict[str, str] = {}
    with tenant_scope(tenant):
        try:
            seeded = await seed.seed_graph(infra)
            if isinstance(seeded, Err):
                raise RuntimeError(seeded.message)
            for q in questions:
                try:
                    result = await ask.ask(infra, q.question)
                except Exception as exc:  # one failed question must not stop the run
                    logger.warning("qa eval: %s failed: %r", q.id, exc)
                    errors[q.id] = f"{type(exc).__name__}: {str(exc)[:200]}"
                    continue
                if isinstance(result, Ok):
                    answers[q.id] = result.value.answer
                else:
                    errors[q.id] = f"{result.reason}: {result.message}"
            aliases = _aliases(seeded.value.persons)
        finally:
            await accounts.delete_account(infra, password=password)
    return score(questions, answers, aliases, errors=errors)


__all__ = ["EVAL_NOW", "eval_clock", "run"]
