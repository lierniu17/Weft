"""Accounts: invite-code registration, Self, login / logout, sessions (AC-1, AC-2, AC-3)."""

from __future__ import annotations

import pytest

from tests.conftest import FakeClock, track_user
from tests.support.users import DEFAULT_PASSWORD, new_user
from weft.domain.tenancy import tenant_scope
from weft.infra import Infra
from weft.services import accounts, invites, persons
from weft.services.results import Err, Ok

pytestmark = pytest.mark.service


async def _register(infra: Infra, code: str, username: str = "xiaoming") -> Ok | Err:  # type: ignore[type-arg]
    result = await accounts.register(
        infra,
        invite_code=code,
        username=username,
        password=DEFAULT_PASSWORD,
        display_name="小明",
    )
    if isinstance(result, Ok):
        track_user(result.value.user.id)
    return result


async def test_a_valid_unused_invite_registers_an_account_with_a_session(infra: Infra) -> None:
    [code] = await invites.generate(infra, 1)
    result = await _register(infra, code)
    assert isinstance(result, Ok)
    user = await accounts.resolve_session(infra, result.value.token)
    assert user is not None and user.username == "xiaoming" and user.display_name == "小明"


async def test_unknown_invite_is_refused_with_its_reason(infra: Infra) -> None:
    result = await _register(infra, "NOSUCHCODE")
    assert isinstance(result, Err) and result.reason == "invite_invalid"


async def test_revoked_invite_is_refused_with_its_reason(infra: Infra) -> None:
    [code] = await invites.generate(infra, 1)
    await invites.revoke(infra, code)
    result = await _register(infra, code)
    assert isinstance(result, Err) and result.reason == "invite_revoked"


async def test_an_invite_registers_exactly_one_account(infra: Infra) -> None:
    [code] = await invites.generate(infra, 1)
    assert isinstance(await _register(infra, code, "first"), Ok)
    second = await _register(infra, code, "second")
    assert isinstance(second, Err) and second.reason == "invite_used"
    assert isinstance(
        await accounts.login(infra, username="second", password=DEFAULT_PASSWORD), Err
    )


async def test_a_refused_registration_leaves_the_invite_and_username_usable(infra: Infra) -> None:
    [code] = await invites.generate(infra, 1)
    taken = await new_user(infra)
    clash = await _register(infra, code, taken.username)
    assert isinstance(clash, Err) and clash.reason == "username_taken"
    assert isinstance(await _register(infra, code, "someone_else"), Ok)


async def test_registration_puts_exactly_one_self_named_after_the_user(infra: Infra) -> None:
    user = await new_user(infra, "小明")
    with tenant_scope(user.tenant):
        people = await persons.list_persons(infra)
    assert [(p.name, p.is_self) for p in people] == [("小明", True)]


async def test_login_succeeds_with_the_right_password(infra: Infra) -> None:
    user = await new_user(infra)
    result = await accounts.login(infra, username=user.username, password=user.password)
    assert isinstance(result, Ok)
    resolved = await accounts.resolve_session(infra, result.value.token)
    assert resolved is not None and resolved.id == user.id


async def test_wrong_password_and_unknown_user_fail_identically(infra: Infra) -> None:
    user = await new_user(infra)
    wrong = await accounts.login(infra, username=user.username, password="not the password")
    unknown = await accounts.login(infra, username="nobody_here", password="whatever pass")
    assert isinstance(wrong, Err) and isinstance(unknown, Err)
    assert (wrong.reason, wrong.message) == (unknown.reason, unknown.message)
    assert wrong.reason == "invalid_credentials"


async def test_logout_ends_the_session(infra: Infra) -> None:
    user = await new_user(infra)
    await accounts.logout(infra, user.token)
    assert await accounts.resolve_session(infra, user.token) is None


async def test_sessions_expire(infra: Infra, clock: FakeClock) -> None:
    user = await new_user(infra)
    clock.advance(days=infra.settings.session_max_age_days + 1)
    assert await accounts.resolve_session(infra, user.token) is None
