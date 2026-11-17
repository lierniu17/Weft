"""Test users for service tests: an invite code, a registered account, its tenant."""

from __future__ import annotations

import secrets

from tests.conftest import TestUser, track_user
from weft.infra import Infra
from weft.services import accounts, invites
from weft.services.results import Ok

DEFAULT_PASSWORD = "correct horse battery"


async def new_user(
    infra: Infra, display_name: str = "小明", *, password: str = DEFAULT_PASSWORD
) -> TestUser:
    [code] = await invites.generate(infra, 1)
    username = f"user_{secrets.token_hex(4)}"
    result = await accounts.register(
        infra,
        invite_code=code,
        username=username,
        password=password,
        display_name=display_name,
    )
    assert isinstance(result, Ok), result
    session = result.value
    return TestUser(
        id=session.user.id,
        username=username,
        password=password,
        display_name=display_name,
        token=session.token,
        tenant=track_user(session.user.id),
    )


__all__ = ["DEFAULT_PASSWORD", "new_user"]
