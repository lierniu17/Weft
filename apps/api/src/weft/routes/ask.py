"""问答 route: ``POST /api/ask`` returns the ``Answer`` contract (contracts/answer.schema.json)."""

from __future__ import annotations

from fastapi import APIRouter

from weft.domain.answer import Answer
from weft.domain.tenancy import tenant_scope
from weft.routes.deps import InfraDep, SessionDep, unwrap
from weft.routes.schemas import AskRequest
from weft.services import ask as ask_service

router = APIRouter(tags=["ask"])

ASK_ERRORS = {
    "blank_question": 422,
    "question_too_long": 422,
    "quota_exceeded": 429,
    "ask_failed": 503,
}


@router.post("/ask", response_model=Answer)
async def ask(body: AskRequest, session: SessionDep, infra: InfraDep) -> Answer:
    with tenant_scope(session.tenant):
        asked = unwrap(await ask_service.ask(infra, body.question), ASK_ERRORS)
    return asked.answer
