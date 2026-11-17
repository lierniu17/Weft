"""Accounts: register with an invite code (AC-1), Self (AC-3), login / logout (AC-2),
account deletion (AC-5)."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from weft.domain.tenancy import TenantContext, require_tenant, tenant_scope
from weft.infra import Infra
from weft.repositories.accounts import (
    AccountRepository,
    InviteCodeRepository,
    InviteState,
    SessionRepository,
    UserRepository,
)
from weft.repositories.records import UserRecord
from weft.security import DUMMY_HASH, hash_password, verify_password
from weft.services._uow import graph
from weft.services.results import Err, Ok, Result

INVITE_ERRORS = {
    InviteState.INVALID: Err("invite_invalid", "邀请码无效"),
    InviteState.REVOKED: Err("invite_revoked", "邀请码已作废"),
    InviteState.USED: Err("invite_used", "邀请码已被使用"),
}
INVALID_CREDENTIALS = Err("invalid_credentials", "账号或密码错误")
USERNAME_TAKEN = Err("username_taken", "这个账号已被注册")
WRONG_PASSWORD = Err("wrong_password", "密码错误")


@dataclass(frozen=True)
class SessionInfo:
    user: UserRecord
    token: str
    expires_at: datetime

    @property
    def user_tenant(self) -> TenantContext:
        return TenantContext.for_user(self.user.id)


def _expiry(infra: Infra) -> datetime:
    return infra.clock() + timedelta(days=infra.settings.session_max_age_days)


async def register(
    infra: Infra, *, invite_code: str, username: str, password: str, display_name: str
) -> Result[SessionInfo]:
    """Create the account, redeem the invite and put Self in the new graph, all or nothing."""
    try:
        return await _register(
            infra,
            invite_code=invite_code,
            username=username,
            password=password,
            display_name=display_name,
        )
    except _RefusedError as refused:
        return refused.err


class _RefusedError(Exception):
    def __init__(self, err: Err) -> None:
        super().__init__(err.reason)
        self.err = err


async def _register(
    infra: Infra, *, invite_code: str, username: str, password: str, display_name: str
) -> Result[SessionInfo]:
    async with infra.sql() as session, session.begin():
        invites = InviteCodeRepository(session)
        state = await invites.state_of(invite_code)
        if state is not InviteState.REDEEMED:
            return INVITE_ERRORS[state]
        users = UserRepository(session)
        if await users.username_taken(username):
            return USERNAME_TAKEN
        user = await users.create(
            username=username, password_hash=hash_password(password), display_name=display_name
        )
        state = await invites.redeem(invite_code, user_id=user.id, now=infra.clock())
        if state is not InviteState.REDEEMED:  # lost a race for the same code: roll back
            raise _RefusedError(INVITE_ERRORS[state])
        expires_at = _expiry(infra)
        token = await SessionRepository(session).create(user.id, expires_at=expires_at)
        tenant = TenantContext.for_user(user.id)
        with tenant_scope(tenant):
            await graph(infra, tenant).create_self(
                person_id=str(uuid.uuid4()), name=display_name, now=infra.clock()
            )
    return Ok(SessionInfo(user=user, token=token, expires_at=expires_at))


async def login(infra: Infra, *, username: str, password: str) -> Result[SessionInfo]:
    """Same answer for a wrong password and an unknown account (AC-2)."""
    async with infra.sql() as session, session.begin():
        found = await UserRepository(session).get_by_username(username)
        stored = found[1] if found else DUMMY_HASH
        if not verify_password(password, stored) or found is None:
            return INVALID_CREDENTIALS
        user = found[0]
        expires_at = _expiry(infra)
        token = await SessionRepository(session).create(user.id, expires_at=expires_at)
    return Ok(SessionInfo(user=user, token=token, expires_at=expires_at))


async def logout(infra: Infra, token: str) -> None:
    async with infra.sql.begin() as session:
        await SessionRepository(session).delete(token)


async def resolve_session(infra: Infra, token: str) -> UserRecord | None:
    async with infra.sql() as session:
        return await SessionRepository(session).resolve(token, now=infra.clock())


async def current_user(infra: Infra) -> UserRecord | None:
    async with infra.sql() as session:
        found = await AccountRepository(session, require_tenant()).get()
    return None if found is None else found[0]


async def delete_account(infra: Infra, *, password: str) -> Result[None]:
    """Wipe the tenant from Neo4j (whole ``group_id``) and Postgres (cascade) (AC-5)."""
    tenant = require_tenant()
    async with infra.sql() as session, session.begin():
        accounts = AccountRepository(session, tenant)
        found = await accounts.get()
        if found is None or not verify_password(password, found[1]):
            return WRONG_PASSWORD
        await graph(infra, tenant).delete_tenant()
        await accounts.delete()
    return Ok(None)


__all__ = [
    "SessionInfo",
    "current_user",
    "delete_account",
    "login",
    "logout",
    "register",
    "resolve_session",
]
