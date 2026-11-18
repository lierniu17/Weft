"""消息 routes (intent routing, ADR 0005): send a message, list the chat, re-route a message,
click an option of a 反问 (intent clarify).

``POST /api/messages`` recognizes the message and records it, answers it, or both
(``weft.services.messages``); a new Draft is extracted in the background, exactly like
``POST /api/entries``. Parts that hit a used-up quota come back as ``problems`` (201);
re-routing is a single action, so its quota error is a 429 and nothing changes; the same
holds for clicking a 反问 option. A typed answer to a 反问 is just the next
``POST /api/messages``.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Query, status

from weft.domain.intent import Intent
from weft.domain.tenancy import tenant_scope
from weft.routes.deps import InfraDep, SessionDep, unwrap
from weft.routes.entries import extraction_job
from weft.routes.schemas import (
    ClarifyRequest,
    MessageOut,
    MessagePage,
    RerouteRequest,
    SendMessageRequest,
)
from weft.services import messages

router = APIRouter(tags=["messages"])

SEND_ERRORS = {"blank_text": 422, "text_too_long": 422}
REROUTE_ERRORS = {
    "not_found": 404,
    "not_reroutable": 409,
    "already_confirmed": 409,
    "blank_question": 422,
    "question_too_long": 422,
    "blank_text": 422,
    "text_too_long": 422,
    "quota_exceeded": 429,
    "ask_failed": 503,
}
CLARIFY_ERRORS = {
    "not_found": 404,
    "no_clarification": 409,
    "already_resolved": 409,
    "no_such_option": 422,
    "blank_question": 422,
    "question_too_long": 422,
    "blank_text": 422,
    "text_too_long": 422,
    "quota_exceeded": 429,
    "ask_failed": 503,
}


@router.post("/messages", status_code=status.HTTP_201_CREATED, response_model=MessageOut)
async def send_message(
    body: SendMessageRequest, session: SessionDep, infra: InfraDep, background: BackgroundTasks
) -> MessageOut:
    with tenant_scope(session.tenant):
        handled = unwrap(await messages.send(infra, body.text), SEND_ERRORS)
    if handled.new_draft_id is not None:
        background.add_task(extraction_job, infra, session.tenant, handled.new_draft_id)
    return MessageOut.of(handled.view)


@router.get("/messages", response_model=MessagePage)
async def list_messages(
    session: SessionDep,
    infra: InfraDep,
    before: Annotated[
        uuid.UUID | None, Query(description="Only messages older than this message")
    ] = None,
    limit: Annotated[int, Query(ge=1, le=messages.MAX_PAGE_SIZE)] = messages.DEFAULT_PAGE_SIZE,
) -> MessagePage:
    with tenant_scope(session.tenant):
        page = unwrap(
            await messages.list_messages(infra, before=before, limit=limit), {"not_found": 404}
        )
    return MessagePage(messages=[MessageOut.of(v) for v in page.messages], has_more=page.has_more)


@router.post("/messages/{message_id}/reroute", response_model=MessageOut)
async def reroute_message(
    message_id: uuid.UUID,
    body: RerouteRequest,
    session: SessionDep,
    infra: InfraDep,
    background: BackgroundTasks,
) -> MessageOut:
    with tenant_scope(session.tenant):
        handled = unwrap(
            await messages.reroute(infra, message_id, Intent(body.as_)), REROUTE_ERRORS
        )
    if handled.new_draft_id is not None:
        background.add_task(extraction_job, infra, session.tenant, handled.new_draft_id)
    return MessageOut.of(handled.view)


@router.post("/messages/{message_id}/clarify", response_model=MessageOut)
async def clarify_message(
    message_id: uuid.UUID,
    body: ClarifyRequest,
    session: SessionDep,
    infra: InfraDep,
    background: BackgroundTasks,
) -> MessageOut:
    """Click option ``option`` of the message's 反问; returns the updated message."""
    with tenant_scope(session.tenant):
        handled = unwrap(await messages.clarify(infra, message_id, body.option), CLARIFY_ERRORS)
    if handled.new_draft_id is not None:
        background.add_task(extraction_job, infra, session.tenant, handled.new_draft_id)
    return MessageOut.of(handled.view)
