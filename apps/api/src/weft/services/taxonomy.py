"""Relationship Type vocabulary per user (AC-31, AC-32)."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from weft.domain.taxonomy import (
    BUILTIN,
    Category,
    CustomSubtype,
    InvalidCustomSubtypeError,
    Taxonomy,
)
from weft.infra import Infra
from weft.repositories.usage import CustomSubtypeRepository
from weft.services._uow import tenant
from weft.services.results import Err, Ok, Result


async def taxonomy_in(session: AsyncSession) -> Taxonomy:
    """Built-in subtypes plus the session's user's custom ones."""
    customs = await CustomSubtypeRepository(session, tenant()).list_all()
    return BUILTIN.with_custom(customs)


async def get_taxonomy(infra: Infra) -> Taxonomy:
    async with infra.sql() as session:
        return await taxonomy_in(session)


async def add_custom_subtype(infra: Infra, *, category: Category, name: str) -> Result[Taxonomy]:
    """Add a subtype under ``category``, visible only to this user (AC-32)."""
    async with infra.sql() as session, session.begin():
        current = await taxonomy_in(session)
        try:
            valid = current.validate_custom(CustomSubtype(category, name))
        except InvalidCustomSubtypeError as exc:
            reason = "subtype_exists" if "already exists" in str(exc) else "invalid_subtype"
            return Err(reason, str(exc))
        if not await CustomSubtypeRepository(session, tenant()).add(valid):
            return Err("subtype_exists", f"subtype {valid.name!r} already exists")
        return Ok(current.with_custom([valid]))


__all__ = ["add_custom_subtype", "get_taxonomy", "taxonomy_in"]
