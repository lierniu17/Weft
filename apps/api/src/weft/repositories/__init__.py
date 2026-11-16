"""Repository interfaces (batch 1 foundation). Implementations need Postgres / Neo4j.

Rules every implementation must follow (ADR-0001, spec 「租户隔离」):

* A repository is constructed bound to the session's ``TenantContext`` and every public
  method is decorated with ``@tenant_scoped``; no method accepts a tenant / user id /
  ``group_id`` argument.
* Every Cypher query filters by ``group_id``; every SQL query filters by ``user_id``.
* "Not found" (including "belongs to another user") is ``None``, never an exception.
* Repositories return domain objects, never ORM rows or Neo4j records.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, datetime
from typing import Protocol

from weft.domain.dates import PartialDate
from weft.domain.draft import Draft, DraftStatus
from weft.domain.quota import QuotaKind
from weft.domain.taxonomy import CustomSubtype
from weft.domain.tenancy import TenantContext

# --- domain records returned by repositories --------------------------------


@dataclass(frozen=True)
class UserRecord:
    id: uuid.UUID
    username: str
    display_name: str
    created_at: datetime


@dataclass(frozen=True)
class EntryRecord:
    id: uuid.UUID
    text: str
    occurred: PartialDate
    kind: str  # "user" | "manual_edit"
    created_at: datetime


@dataclass(frozen=True)
class DraftRecord:
    id: uuid.UUID
    entry_id: uuid.UUID
    status: DraftStatus
    content: Draft | None
    error: str | None


@dataclass(frozen=True)
class PersonRecord:
    id: str
    name: str
    aliases: tuple[str, ...]
    is_self: bool


# --- unscoped (account-level) repositories ----------------------------------


class UserRepository(Protocol):
    """Account lookup happens before a tenant exists (login / register)."""

    async def get_by_username(self, username: str) -> tuple[UserRecord, str] | None:
        """The user and their password hash."""
        ...

    async def create(
        self, *, username: str, password_hash: str, display_name: str
    ) -> UserRecord: ...


class InviteCodeRepository(Protocol):
    async def redeem(self, code: str, *, user_id: uuid.UUID) -> bool:
        """Atomically mark an unused, unrevoked code as used; False otherwise (AC-1)."""
        ...

    async def generate(self, count: int) -> list[str]: ...

    async def revoke(self, code: str) -> bool: ...


class SessionRepository(Protocol):
    async def create(self, user_id: uuid.UUID, *, expires_at: datetime) -> str: ...

    async def resolve(self, token: str, *, now: datetime) -> TenantContext | None: ...

    async def delete(self, token: str) -> None: ...


# --- tenant-scoped repositories (bound to the session's tenant) --------------


class EntryRepository(Protocol):
    tenant: TenantContext

    async def create(self, *, text: str, occurred: PartialDate, kind: str) -> EntryRecord: ...

    async def get(self, entry_id: uuid.UUID) -> EntryRecord | None: ...

    async def list_by_occurred_desc(self) -> list[EntryRecord]: ...


class DraftRepository(Protocol):
    tenant: TenantContext

    async def create_extracting(self, entry_id: uuid.UUID) -> DraftRecord: ...

    async def get(self, draft_id: uuid.UUID) -> DraftRecord | None: ...

    async def save_content(self, draft_id: uuid.UUID, content: Draft) -> DraftRecord | None: ...

    async def set_status(
        self, draft_id: uuid.UUID, status: DraftStatus, *, error: str | None = None
    ) -> DraftRecord | None: ...


class CustomSubtypeRepository(Protocol):
    tenant: TenantContext

    async def list_all(self) -> list[CustomSubtype]: ...

    async def add(self, subtype: CustomSubtype) -> CustomSubtype: ...


class UsageRepository(Protocol):
    tenant: TenantContext

    async def count(self, kind: QuotaKind, day: date) -> int: ...

    async def increment_if_below(self, kind: QuotaKind, day: date, *, limit: int) -> bool:
        """Atomically count one more use unless the limit is reached (AC-40)."""
        ...


class PersonGraphRepository(Protocol):
    """Neo4j access for Person nodes; the only way the app reads the graph besides
    ``ScopedGraphiti``. Every query is filtered by ``tenant.group_id``."""

    tenant: TenantContext

    async def get_self(self) -> PersonRecord | None: ...

    async def find_by_name_or_alias(self, text: str) -> list[PersonRecord]: ...

    async def get(self, person_id: str) -> PersonRecord | None: ...
