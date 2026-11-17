"""账户: register (invite code), login, logout, me, account deletion (AC-1, AC-2, AC-3, AC-5)."""

from __future__ import annotations

from fastapi import APIRouter, Response, status

from weft.domain.tenancy import tenant_scope
from weft.routes.deps import (
    InfraDep,
    SessionDep,
    clear_session_cookie,
    set_session_cookie,
    unwrap,
)
from weft.routes.schemas import DeleteAccountRequest, LoginRequest, MeResponse, RegisterRequest
from weft.services import accounts, persons

router = APIRouter(tags=["auth"])

REGISTER_ERRORS = {
    "invite_invalid": 400,
    "invite_revoked": 400,
    "invite_used": 400,
    "username_taken": 409,
}


@router.post("/auth/register", status_code=status.HTTP_201_CREATED, response_model=MeResponse)
async def register(body: RegisterRequest, response: Response, infra: InfraDep) -> MeResponse:
    session = unwrap(
        await accounts.register(
            infra,
            invite_code=body.invite_code,
            username=body.username,
            password=body.password,
            display_name=body.display_name,
        ),
        REGISTER_ERRORS,
    )
    set_session_cookie(response, infra.settings, session.token)
    with tenant_scope(session.user_tenant):
        me = await persons.get_self(infra)
    return MeResponse.of(session.user, me.id)


@router.post("/auth/login", response_model=MeResponse)
async def login(body: LoginRequest, response: Response, infra: InfraDep) -> MeResponse:
    session = unwrap(
        await accounts.login(infra, username=body.username, password=body.password),
        {"invalid_credentials": 401},
    )
    set_session_cookie(response, infra.settings, session.token)
    with tenant_scope(session.user_tenant):
        me = await persons.get_self(infra)
    return MeResponse.of(session.user, me.id)


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(session: SessionDep, infra: InfraDep, response: Response) -> None:
    await accounts.logout(infra, session.token)
    clear_session_cookie(response, infra.settings)


@router.get("/auth/me", response_model=MeResponse)
async def me(session: SessionDep, infra: InfraDep) -> MeResponse:
    with tenant_scope(session.tenant):
        self_person = await persons.get_self(infra)
    return MeResponse.of(session.user, self_person.id)


@router.delete("/account", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(
    body: DeleteAccountRequest, session: SessionDep, infra: InfraDep, response: Response
) -> None:
    with tenant_scope(session.tenant):
        unwrap(
            await accounts.delete_account(infra, password=body.password), {"wrong_password": 403}
        )
    clear_session_cookie(response, infra.settings)
