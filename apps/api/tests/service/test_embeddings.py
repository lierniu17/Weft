"""Embeddings for semantic search: written at confirm time, backfilled when missing."""

from __future__ import annotations

import pytest

from tests.support import scenarios as sc
from tests.support.graph import Seed, seed
from tests.support.llm_script import LLMScript
from tests.support.users import new_user
from weft.domain.confidence import Confidence
from weft.domain.tenancy import tenant_scope
from weft.infra import Infra
from weft.services import embeddings

pytestmark = pytest.mark.service


async def test_confirming_a_draft_embeds_its_persons_entities_and_facts(
    infra: Infra, llm: LLMScript
) -> None:
    sc.dinner_with_laozhang(llm)
    user = await new_user(infra)
    draft = await sc.extracted(infra, user, sc.DINNER)
    await sc.confirmed(infra, user, draft.id)

    assert {"老张", "钓鱼", "老张喜欢钓鱼", "老张不喜欢喝酒"} <= set(llm.embedded)
    with tenant_scope(user.tenant):
        assert await embeddings.backfill(infra) == embeddings.Backfilled(nodes=0, facts=0)


async def test_backfill_embeds_what_is_missing_and_then_finds_nothing(
    infra: Infra, llm: LLMScript
) -> None:
    user = await new_user(infra)
    # the test seed writes straight through the repository, without embeddings
    await seed(
        infra,
        user,
        Seed(persons=["老张"], facts=[("老张", "LIKES", "露营", Confidence.WITNESSED, None)]),
    )
    with tenant_scope(user.tenant):
        first = await embeddings.backfill(infra)
        second = await embeddings.backfill(infra)
    assert first == embeddings.Backfilled(nodes=2, facts=1)  # 老张, 露营; 老张喜欢露营
    assert second == embeddings.Backfilled(nodes=0, facts=0)


async def test_an_embedding_outage_does_not_block_confirmation(
    infra: Infra, llm: LLMScript
) -> None:
    sc.dinner_with_laozhang(llm)
    user = await new_user(infra)
    draft = await sc.extracted(infra, user, sc.DINNER)
    llm.embeddings_down = True
    confirmed = await sc.confirmed(infra, user, draft.id)
    assert confirmed.status.value == "confirmed"

    llm.embeddings_down = False
    with tenant_scope(user.tenant):
        filled = await embeddings.backfill(infra)
    assert filled.nodes >= 4 and filled.facts == 3
