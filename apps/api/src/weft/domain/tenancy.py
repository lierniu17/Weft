"""Tenant isolation (ADR-0001, spec 「租户隔离（安全红线）」).

* Every user owns exactly one Graphiti ``group_id``, derived server-side from the user id.
* The tenant for a request comes from the login session only, held in a ``ContextVar``
  set by the auth dependency via ``tenant_scope``.
* Repositories are constructed bound to a tenant and guard every method with
  ``@tenant_scoped``: the call fails if no tenant is in scope, if the scope's tenant
  differs from the repository's, or if the caller tries to pass a tenant argument.
* Graphiti is only reachable through ``ScopedGraphiti``, which always passes
  ``group_ids=[<session group_id>]`` and never ``None`` (which would search all tenants).
"""

from __future__ import annotations

import functools
import inspect
import uuid
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Any, Protocol, cast

GRAPHITI_GROUP_ID_PATTERN = r"^[a-zA-Z0-9_-]+$"
_GROUP_ID_PREFIX = "u_"
FORBIDDEN_TENANT_KWARGS = frozenset({"group_id", "group_ids", "tenant", "user_id"})


class TenantViolationError(PermissionError):
    """Base class: an operation tried to cross or skip the tenant boundary."""


class TenantMissingError(TenantViolationError):
    """A tenant-scoped operation ran with no tenant in scope."""


class TenantMismatchError(TenantViolationError):
    """A tenant-scoped operation ran for a tenant other than the session's."""


def group_id_for_user(user_id: uuid.UUID | str) -> str:
    """Derive the Graphiti ``group_id`` (``^[a-zA-Z0-9_-]+$``) from a user id (a UUID)."""
    parsed = user_id if isinstance(user_id, uuid.UUID) else uuid.UUID(str(user_id))
    return f"{_GROUP_ID_PREFIX}{parsed.hex}"


@dataclass(frozen=True, slots=True)
class TenantContext:
    user_id: uuid.UUID
    group_id: str

    @classmethod
    def for_user(cls, user_id: uuid.UUID | str) -> TenantContext:
        parsed = user_id if isinstance(user_id, uuid.UUID) else uuid.UUID(str(user_id))
        return cls(user_id=parsed, group_id=group_id_for_user(parsed))


_current: ContextVar[TenantContext | None] = ContextVar("weft_tenant", default=None)


def current_tenant() -> TenantContext | None:
    return _current.get()


@contextmanager
def tenant_scope(tenant: TenantContext) -> Iterator[TenantContext]:
    """Bind ``tenant`` as the session's tenant for the duration of the block."""
    token = _current.set(tenant)
    try:
        yield tenant
    finally:
        _current.reset(token)


def require_tenant(expected: TenantContext | None = None) -> TenantContext:
    """Return the session's tenant; raise if absent or different from ``expected``."""
    tenant = _current.get()
    if tenant is None:
        raise TenantMissingError("no tenant in scope; tenant-scoped calls need a login session")
    if expected is not None and expected != tenant:
        raise TenantMismatchError("operation bound to a different tenant than the session's")
    return tenant


def _refuse_tenant_kwargs(name: str, kwargs: dict[str, Any]) -> None:
    smuggled = FORBIDDEN_TENANT_KWARGS.intersection(kwargs)
    if smuggled:
        raise TypeError(
            f"{name}() does not accept tenant arguments ({', '.join(sorted(smuggled))}); "
            "the tenant comes from the login session"
        )


class _HasTenant(Protocol):
    tenant: TenantContext


def tenant_scoped[F: Callable[..., Any]](method: F) -> F:
    """Guard a repository method (sync or async) bound to ``self.tenant``."""

    def _check(self: _HasTenant, kwargs: dict[str, Any]) -> None:
        _refuse_tenant_kwargs(method.__name__, kwargs)
        require_tenant(expected=self.tenant)

    if inspect.iscoroutinefunction(method):

        @functools.wraps(method)
        async def async_wrapper(self: _HasTenant, *args: Any, **kwargs: Any) -> Any:
            _check(self, kwargs)
            return await method(self, *args, **kwargs)

        return cast(F, async_wrapper)

    @functools.wraps(method)
    def wrapper(self: _HasTenant, *args: Any, **kwargs: Any) -> Any:
        _check(self, kwargs)
        return method(self, *args, **kwargs)

    return cast(F, wrapper)


class _GraphitiSearch(Protocol):
    async def search(
        self,
        query: str,
        *,
        group_ids: list[str],
        num_results: int = ...,
        center_node_uuid: str | None = ...,
        search_filter: Any = ...,
    ) -> Any: ...


class ScopedGraphiti:
    """The only way to reach Graphiti: every call is pinned to the session's ``group_id``.

    Exposes an explicit allow-list of read methods; anything else on the raw client
    (``add_episode``, ``clear_data``, ...) is unreachable through this object.
    """

    __slots__ = ("_client", "tenant")

    def __init__(self, client: _GraphitiSearch, tenant: TenantContext) -> None:
        self._client = client
        self.tenant = tenant

    @tenant_scoped
    async def search(
        self,
        query: str,
        *,
        num_results: int = 10,
        center_node_uuid: str | None = None,
        search_filter: Any = None,
    ) -> Any:
        return await self._client.search(
            query,
            group_ids=[self.tenant.group_id],
            num_results=num_results,
            center_node_uuid=center_node_uuid,
            search_filter=search_filter,
        )


__all__ = [
    "FORBIDDEN_TENANT_KWARGS",
    "GRAPHITI_GROUP_ID_PATTERN",
    "ScopedGraphiti",
    "TenantContext",
    "TenantMismatchError",
    "TenantMissingError",
    "TenantViolationError",
    "current_tenant",
    "group_id_for_user",
    "require_tenant",
    "tenant_scope",
    "tenant_scoped",
]
