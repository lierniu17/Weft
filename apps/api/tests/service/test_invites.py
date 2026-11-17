"""Invite-code CLI: generate, list with usage, revoke unused codes (AC-41)."""

from __future__ import annotations

import pytest

from tests.support.users import new_user
from weft import cli
from weft.infra import Infra
from weft.services import invites

pytestmark = pytest.mark.service


async def test_generate_prints_the_requested_number_of_distinct_codes(
    infra: Infra, capsys: pytest.CaptureFixture[str]
) -> None:
    assert await cli.run(["invites", "generate", "3"], infra=infra) == 0
    codes = capsys.readouterr().out.split()
    assert len(codes) == 3 and len(set(codes)) == 3
    assert sorted(i.code for i in await invites.list_all(infra)) == sorted(codes)


async def test_list_shows_each_code_with_its_usage(
    infra: Infra, capsys: pytest.CaptureFixture[str]
) -> None:
    unused, revoked = await invites.generate(infra, 2)
    await invites.revoke(infra, revoked)
    user = await new_user(infra)  # consumes a third code
    capsys.readouterr()

    assert await cli.run(["invites", "list"], infra=infra) == 0
    lines = {line.split()[0]: line for line in capsys.readouterr().out.splitlines()[1:]}
    assert "unused" in lines[unused]
    assert "revoked" in lines[revoked]
    [used_line] = [line for line in lines.values() if user.username in line]
    assert "used" in used_line


async def test_revoke_only_affects_unused_codes(
    infra: Infra, capsys: pytest.CaptureFixture[str]
) -> None:
    [code] = await invites.generate(infra, 1)
    assert await cli.run(["invites", "revoke", code], infra=infra) == 0
    assert await cli.run(["invites", "revoke", code], infra=infra) == 1  # already revoked
    assert await cli.run(["invites", "revoke", "NOSUCHCODE"], infra=infra) == 1

    await new_user(infra)
    [used] = [i.code for i in await invites.list_all(infra) if i.status == "used"]
    assert await cli.run(["invites", "revoke", used], infra=infra) == 1
    assert {i.code: i.status for i in await invites.list_all(infra)}[used] == "used"
