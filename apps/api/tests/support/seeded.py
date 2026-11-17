"""A test user whose graph holds the seed graph (``weft.services.seed``)."""

from __future__ import annotations

from dataclasses import dataclass

from tests.conftest import TestUser
from tests.support.users import new_user
from weft.domain.tenancy import tenant_scope
from weft.infra import Infra
from weft.services import seed
from weft.services.results import Ok


@dataclass
class SeededUser:
    user: TestUser
    ids: dict[str, str]  # name / alias -> person id (我 -> Self)
    entries: list[str]  # seed Entry ids, oldest first


async def seeded_user(infra: Infra, name: str = "小明") -> SeededUser:
    user = await new_user(infra, name)
    with tenant_scope(user.tenant):
        result = await seed.seed_graph(infra)
    assert isinstance(result, Ok), result
    return SeededUser(user, result.value.persons, result.value.entries)


__all__ = ["SeededUser", "seeded_user"]
