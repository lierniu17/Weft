"""记录与草稿: submit / list / detail Entries; read / edit / confirm / discard / retry Drafts."""

from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, BackgroundTasks, status

from weft.domain.tenancy import TenantContext, tenant_scope
from weft.infra import Infra
from weft.routes.deps import InfraDep, SessionDep, unwrap
from weft.routes.schemas import (
    DraftOut,
    EntryDetailOut,
    EntryOut,
    EntrySubmitted,
    FactOut,
    PersonOut,
    SubmitEntryRequest,
    UpdateDraftRequest,
)
from weft.services import drafts, entries

logger = logging.getLogger(__name__)
router = APIRouter(tags=["entries"])

NOT_FOUND = {"not_found": 404}
DRAFT_ERRORS = {
    **NOT_FOUND,
    "not_pending": 409,
    "not_failed": 409,
    "ambiguous_persons": 409,
    "unknown_person": 422,
    "unknown_relationship_type": 422,
    "graph_write_failed": 503,
}


async def extraction_job(infra: Infra, tenant: TenantContext, draft_id: uuid.UUID) -> None:
    """Background extraction for one Draft, in the tenant of the session that queued it."""
    with tenant_scope(tenant):
        try:
            await drafts.run_extraction(infra, draft_id)
        except Exception:  # pragma: no cover - run_extraction records failures itself
            logger.exception("extraction job for draft %s crashed", draft_id)


@router.post("/entries", status_code=status.HTTP_201_CREATED, response_model=EntrySubmitted)
async def submit_entry(
    body: SubmitEntryRequest, session: SessionDep, infra: InfraDep, background: BackgroundTasks
) -> EntrySubmitted:
    with tenant_scope(session.tenant):
        submitted = unwrap(
            await entries.submit_entry(infra, text=body.text, occurred=body.occurred_on),
            {"blank_text": 422, "text_too_long": 422, "future_date": 422, "quota_exceeded": 429},
        )
    background.add_task(extraction_job, infra, session.tenant, submitted.draft.id)
    return EntrySubmitted(
        entry=EntryOut.of(submitted.entry, submitted.draft), draft=DraftOut.of(submitted.draft)
    )


@router.get("/entries", response_model=list[EntryOut])
async def list_entries(session: SessionDep, infra: InfraDep) -> list[EntryOut]:
    with tenant_scope(session.tenant):
        rows = await entries.list_entries(infra)
    return [EntryOut.of(e, d) for e, d in rows]


@router.get("/entries/{entry_id}", response_model=EntryDetailOut)
async def get_entry(entry_id: uuid.UUID, session: SessionDep, infra: InfraDep) -> EntryDetailOut:
    with tenant_scope(session.tenant):
        detail = unwrap(await entries.get_entry(infra, entry_id), NOT_FOUND)
    return EntryDetailOut(
        entry=EntryOut.of(detail.entry, detail.draft),
        draft=None if detail.draft is None else DraftOut.of(detail.draft),
        persons=[PersonOut.of(p) for p in detail.persons],
        facts=[FactOut.of(f) for f in detail.facts],
    )


@router.get("/drafts/{draft_id}", response_model=DraftOut)
async def get_draft(draft_id: uuid.UUID, session: SessionDep, infra: InfraDep) -> DraftOut:
    with tenant_scope(session.tenant):
        return DraftOut.of(unwrap(await drafts.get_draft(infra, draft_id), NOT_FOUND))


@router.put("/drafts/{draft_id}", response_model=DraftOut)
async def update_draft(
    draft_id: uuid.UUID, body: UpdateDraftRequest, session: SessionDep, infra: InfraDep
) -> DraftOut:
    with tenant_scope(session.tenant):
        result = await drafts.update_draft(infra, draft_id, body.content)
    return DraftOut.of(unwrap(result, DRAFT_ERRORS))


@router.post("/drafts/{draft_id}/confirm", response_model=DraftOut)
async def confirm_draft(draft_id: uuid.UUID, session: SessionDep, infra: InfraDep) -> DraftOut:
    with tenant_scope(session.tenant):
        return DraftOut.of(unwrap(await drafts.confirm_draft(infra, draft_id), DRAFT_ERRORS))


@router.post("/drafts/{draft_id}/discard", response_model=DraftOut)
async def discard_draft(draft_id: uuid.UUID, session: SessionDep, infra: InfraDep) -> DraftOut:
    with tenant_scope(session.tenant):
        return DraftOut.of(unwrap(await drafts.discard_draft(infra, draft_id), DRAFT_ERRORS))


@router.post(
    "/drafts/{draft_id}/retry", status_code=status.HTTP_202_ACCEPTED, response_model=DraftOut
)
async def retry_draft(
    draft_id: uuid.UUID, session: SessionDep, infra: InfraDep, background: BackgroundTasks
) -> DraftOut:
    with tenant_scope(session.tenant):
        draft = unwrap(await drafts.retry_extraction(infra, draft_id), DRAFT_ERRORS)
    background.add_task(extraction_job, infra, session.tenant, draft.id)
    return DraftOut.of(draft)
