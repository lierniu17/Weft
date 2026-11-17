"""Postgres: users, invite codes, sessions (account level) and the tenant's own account row."""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from weft.domain.tenancy import TenantContext, tenant_scoped
from weft.models.tables import InviteCode, Session, User
from weft.repositories.records import InviteRecord, UserRecord

_INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O/1/I


def _user(row: User) -> UserRecord:
    return UserRecord(
        id=row.id, username=row.username, display_name=row.display_name, created_at=row.created_at
    )


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


class UserRepository:
    """Unscoped: login and register happen before a tenant exists."""

    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def get_by_username(self, username: str) -> tuple[UserRecord, str] | None:
        row = await self._s.scalar(select(User).where(User.username == username))
        return None if row is None else (_user(row), row.password_hash)

    async def username_taken(self, username: str) -> bool:
        return await self._s.scalar(select(User.id).where(User.username == username)) is not None

    async def create(self, *, username: str, password_hash: str, display_name: str) -> UserRecord:
        row = User(username=username, password_hash=password_hash, display_name=display_name)
        self._s.add(row)
        await self._s.flush()
        await self._s.refresh(row)
        return _user(row)


class InviteState(StrEnum):
    REDEEMED = "redeemed"
    INVALID = "invalid"  # no such code
    REVOKED = "revoked"
    USED = "used"


class RevokeState(StrEnum):
    REVOKED = "revoked"
    NOT_FOUND = "not_found"
    ALREADY_USED = "already_used"
    ALREADY_REVOKED = "already_revoked"


class InviteCodeRepository:
    """Unscoped: managed by the admin CLI (AC-41), redeemed at registration (AC-1)."""

    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def generate(self, count: int) -> list[str]:
        codes = ["".join(secrets.choice(_INVITE_ALPHABET) for _ in range(10)) for _ in range(count)]
        self._s.add_all([InviteCode(code=code) for code in codes])
        await self._s.flush()
        return codes

    async def list_all(self) -> list[InviteRecord]:
        rows = await self._s.execute(
            select(InviteCode, User.username)
            .outerjoin(User, User.id == InviteCode.used_by_user_id)
            .order_by(InviteCode.created_at, InviteCode.code)
        )
        return [
            InviteRecord(
                code=invite.code,
                created_at=invite.created_at,
                used_at=invite.used_at,
                revoked_at=invite.revoked_at,
                used_by_username=username,
            )
            for invite, username in rows.all()
        ]

    async def redeem(self, code: str, *, user_id: uuid.UUID, now: datetime) -> InviteState:
        """Atomically mark an unused, unrevoked code as used by ``user_id``."""
        claimed = await self._s.scalar(
            update(InviteCode)
            .where(
                InviteCode.code == code,
                InviteCode.used_at.is_(None),
                InviteCode.revoked_at.is_(None),
            )
            .values(used_at=now, used_by_user_id=user_id)
            .returning(InviteCode.id)
        )
        if claimed is not None:
            return InviteState.REDEEMED
        return await self.state_of(code)

    async def state_of(self, code: str) -> InviteState:
        row = await self._s.scalar(select(InviteCode).where(InviteCode.code == code))
        if row is None:
            return InviteState.INVALID
        if row.used_at is not None:
            return InviteState.USED
        if row.revoked_at is not None:
            return InviteState.REVOKED
        return InviteState.REDEEMED  # usable

    async def revoke(self, code: str, *, now: datetime) -> RevokeState:
        revoked = await self._s.scalar(
            update(InviteCode)
            .where(
                InviteCode.code == code,
                InviteCode.used_at.is_(None),
                InviteCode.revoked_at.is_(None),
            )
            .values(revoked_at=now)
            .returning(InviteCode.id)
        )
        if revoked is not None:
            return RevokeState.REVOKED
        row = await self._s.scalar(select(InviteCode).where(InviteCode.code == code))
        if row is None:
            return RevokeState.NOT_FOUND
        if row.used_at is not None:
            return RevokeState.ALREADY_USED
        return RevokeState.ALREADY_REVOKED


class SessionRepository:
    """Unscoped: turns a cookie token into the session's user (and so its tenant)."""

    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def create(self, user_id: uuid.UUID, *, expires_at: datetime) -> str:
        token = secrets.token_urlsafe(32)
        self._s.add(Session(id=_token_hash(token), user_id=user_id, expires_at=expires_at))
        await self._s.flush()
        return token

    async def resolve(self, token: str, *, now: datetime) -> UserRecord | None:
        row = await self._s.scalar(
            select(User)
            .join(Session, Session.user_id == User.id)
            .where(Session.id == _token_hash(token), Session.expires_at > now)
        )
        return None if row is None else _user(row)

    async def delete(self, token: str) -> None:
        await self._s.execute(delete(Session).where(Session.id == _token_hash(token)))


class AccountRepository:
    """The session's own account row (scoped)."""

    def __init__(self, session: AsyncSession, tenant: TenantContext) -> None:
        self._s = session
        self.tenant = tenant

    @tenant_scoped
    async def get(self) -> tuple[UserRecord, str] | None:
        row = await self._s.scalar(select(User).where(User.id == self.tenant.user_id))
        return None if row is None else (_user(row), row.password_hash)

    @tenant_scoped
    async def delete(self) -> None:
        """Delete the account; every business table cascades on ``user_id`` (AC-5).

        The invite code keeps ``used_at`` (``used_by_user_id`` becomes NULL), so it can
        never be redeemed again.
        """
        await self._s.execute(delete(User).where(User.id == self.tenant.user_id))


__all__ = [
    "AccountRepository",
    "InviteCodeRepository",
    "InviteState",
    "RevokeState",
    "SessionRepository",
    "UserRepository",
]
