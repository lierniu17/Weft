"""Tenant isolation guard (ADR-0001, AC-4, AC-39 logic part)."""

import re
import uuid
from typing import Any

import pytest

from weft.domain.tenancy import (
    GRAPHITI_GROUP_ID_PATTERN,
    ScopedGraphiti,
    TenantContext,
    TenantMismatchError,
    TenantMissingError,
    current_tenant,
    group_id_for_user,
    require_tenant,
    tenant_scope,
    tenant_scoped,
)

pytestmark = pytest.mark.unit

ALICE = uuid.UUID("11111111-1111-4111-8111-111111111111")
BOB = uuid.UUID("22222222-2222-4222-8222-222222222222")


# --- group_id derivation ---------------------------------------------------


def test_group_id_is_graphiti_safe_and_stable() -> None:
    gid = group_id_for_user(ALICE)
    assert re.fullmatch(GRAPHITI_GROUP_ID_PATTERN, gid)
    assert gid == group_id_for_user(str(ALICE))
    assert gid != group_id_for_user(BOB)


def test_group_id_rejects_non_uuid_user_ids() -> None:
    with pytest.raises(ValueError):
        group_id_for_user("alice'; MATCH (n) DETACH DELETE n //")


def test_tenant_context_derives_its_group_id() -> None:
    assert TenantContext.for_user(ALICE).group_id == group_id_for_user(ALICE)


# --- request-scoped context ------------------------------------------------


def test_no_tenant_outside_a_scope() -> None:
    assert current_tenant() is None
    with pytest.raises(TenantMissingError):
        require_tenant()


def test_scope_sets_and_restores_the_tenant() -> None:
    alice = TenantContext.for_user(ALICE)
    with tenant_scope(alice):
        assert require_tenant() == alice
    assert current_tenant() is None


def test_require_tenant_rejects_a_different_expected_tenant() -> None:
    with tenant_scope(TenantContext.for_user(ALICE)), pytest.raises(TenantMismatchError):
        require_tenant(expected=TenantContext.for_user(BOB))


async def test_scope_is_isolated_between_concurrent_tasks() -> None:
    import asyncio

    async def who(user: uuid.UUID) -> str:
        with tenant_scope(TenantContext.for_user(user)):
            await asyncio.sleep(0)
            return require_tenant().group_id

    a, b = await asyncio.gather(who(ALICE), who(BOB))
    assert (a, b) == (group_id_for_user(ALICE), group_id_for_user(BOB))


# --- repository guard ------------------------------------------------------


class FakePersonRepository:
    """Shape of a real repository: bound to the session's tenant, methods guarded."""

    def __init__(self, tenant: TenantContext) -> None:
        self.tenant = tenant
        self.calls: list[tuple[str, str]] = []

    @tenant_scoped
    def find_by_alias(self, alias: str) -> list[str]:
        self.calls.append((self.tenant.group_id, alias))
        return []


def test_repository_call_without_a_tenant_raises() -> None:
    repo = FakePersonRepository(TenantContext.for_user(ALICE))
    with pytest.raises(TenantMissingError):
        repo.find_by_alias("老张")
    assert repo.calls == []


def test_repository_call_with_another_users_tenant_raises() -> None:
    repo = FakePersonRepository(TenantContext.for_user(BOB))
    with tenant_scope(TenantContext.for_user(ALICE)), pytest.raises(TenantMismatchError):
        repo.find_by_alias("老张")
    assert repo.calls == []


def test_repository_call_within_matching_tenant_runs() -> None:
    alice = TenantContext.for_user(ALICE)
    repo = FakePersonRepository(alice)
    with tenant_scope(alice):
        repo.find_by_alias("老张")
    assert repo.calls == [(alice.group_id, "老张")]


@pytest.mark.parametrize("smuggled", ["group_id", "group_ids", "tenant", "user_id"])
def test_repository_refuses_caller_supplied_tenant_arguments(smuggled: str) -> None:
    alice = TenantContext.for_user(ALICE)
    repo = FakePersonRepository(alice)
    with tenant_scope(alice), pytest.raises(TypeError):
        repo.find_by_alias("老张", **{smuggled: "u_other"})  # type: ignore[call-arg]
    assert repo.calls == []


async def test_async_repository_methods_are_guarded_too() -> None:
    class AsyncRepo:
        def __init__(self, tenant: TenantContext) -> None:
            self.tenant = tenant

        @tenant_scoped
        async def count(self) -> int:
            return 1

    with pytest.raises(TenantMissingError):
        await AsyncRepo(TenantContext.for_user(ALICE)).count()
    with tenant_scope(TenantContext.for_user(ALICE)):
        assert await AsyncRepo(TenantContext.for_user(ALICE)).count() == 1


# --- Graphiti wrapper ------------------------------------------------------


class FakeGraphiti:
    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    async def search(self, query: str, **kwargs: Any) -> list[str]:
        self.calls.append({"query": query, **kwargs})
        return []

    async def add_episode(self, **kwargs: Any) -> None:  # must never be reachable
        raise AssertionError("add_episode is not allowed")


async def test_graphiti_search_always_injects_the_session_group_id() -> None:
    fake = FakeGraphiti()
    alice = TenantContext.for_user(ALICE)
    with tenant_scope(alice):
        await ScopedGraphiti(fake, alice).search("老张", num_results=5)
    assert fake.calls == [
        {
            "query": "老张",
            "group_ids": [alice.group_id],
            "num_results": 5,
            "center_node_uuid": None,
            "search_filter": None,
        }
    ]


async def test_graphiti_search_without_tenant_raises() -> None:
    fake = FakeGraphiti()
    with pytest.raises(TenantMissingError):
        await ScopedGraphiti(fake, TenantContext.for_user(ALICE)).search("老张")
    assert fake.calls == []


async def test_graphiti_search_with_other_tenant_raises() -> None:
    fake = FakeGraphiti()
    with tenant_scope(TenantContext.for_user(BOB)), pytest.raises(TenantMismatchError):
        await ScopedGraphiti(fake, TenantContext.for_user(ALICE)).search("老张")
    assert fake.calls == []


async def test_graphiti_search_refuses_caller_group_ids() -> None:
    fake = FakeGraphiti()
    alice = TenantContext.for_user(ALICE)
    with tenant_scope(alice), pytest.raises(TypeError):
        await ScopedGraphiti(fake, alice).search("老张", group_ids=None)  # type: ignore[call-arg]
    assert fake.calls == []


def test_graphiti_wrapper_does_not_expose_the_raw_client() -> None:
    scoped = ScopedGraphiti(FakeGraphiti(), TenantContext.for_user(ALICE))
    with pytest.raises(AttributeError):
        scoped.add_episode  # type: ignore[attr-defined]  # noqa: B018
