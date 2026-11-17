"""Invite codes (admin, AC-41): generate, list with usage, revoke unused ones."""

from __future__ import annotations

from weft.infra import Infra
from weft.repositories.accounts import InviteCodeRepository, RevokeState
from weft.repositories.records import InviteRecord


async def generate(infra: Infra, count: int) -> list[str]:
    if count < 1:
        raise ValueError("count must be at least 1")
    async with infra.sql.begin() as session:
        return await InviteCodeRepository(session).generate(count)


async def list_all(infra: Infra) -> list[InviteRecord]:
    async with infra.sql() as session:
        return await InviteCodeRepository(session).list_all()


async def revoke(infra: Infra, code: str) -> RevokeState:
    async with infra.sql.begin() as session:
        return await InviteCodeRepository(session).revoke(code.strip(), now=infra.clock())


__all__ = ["RevokeState", "generate", "list_all", "revoke"]
