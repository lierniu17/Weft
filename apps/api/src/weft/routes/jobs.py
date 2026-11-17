"""Background jobs routes queue after the response, in the tenant of the requesting session."""

from __future__ import annotations

import logging

from weft.domain.tenancy import TenantContext, tenant_scope
from weft.infra import Infra
from weft.services import summaries

logger = logging.getLogger(__name__)


async def summary_job(infra: Infra, tenant: TenantContext) -> None:
    """Regenerate the summaries a confirmation or manual edit made stale (AC-24, AC-28)."""
    with tenant_scope(tenant):
        try:
            await summaries.refresh_stale(infra)
        except Exception:  # pragma: no cover - refresh_stale isolates failures itself
            logger.exception("summary refresh crashed")


__all__ = ["summary_job"]
