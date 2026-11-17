"""我的 settings saved to the account (graph-viz AC-18)."""

from __future__ import annotations

from fastapi import APIRouter

from weft.domain.tenancy import tenant_scope
from weft.routes.deps import InfraDep, SessionDep
from weft.routes.schemas import PreferencesOut, PreferencesPatch
from weft.services import preferences

router = APIRouter(tags=["preferences"])


@router.get("/me/preferences", response_model=PreferencesOut)
async def get_preferences(session: SessionDep, infra: InfraDep) -> PreferencesOut:
    with tenant_scope(session.tenant):
        return PreferencesOut.of(await preferences.get_preferences(infra))


@router.patch("/me/preferences", response_model=PreferencesOut)
async def update_preferences(
    body: PreferencesPatch, session: SessionDep, infra: InfraDep
) -> PreferencesOut:
    with tenant_scope(session.tenant):
        saved = await preferences.update_preferences(infra, graph_theme=body.graph_theme)
    return PreferencesOut.of(saved)
