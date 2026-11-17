"""Account deletion wipes the tenant from both stores (AC-5)."""

from __future__ import annotations

import pytest
from sqlalchemy import text

from tests.support import scenarios as sc
from tests.support.graph import Seed, count_group_nodes, seed
from tests.support.llm_script import LLMScript
from tests.support.users import new_user
from weft.domain.taxonomy import Category
from weft.domain.tenancy import tenant_scope
from weft.infra import Infra
from weft.services import accounts, entries, invites, taxonomy
from weft.services.results import Err, Ok

pytestmark = pytest.mark.service

USER_TABLES = ("sessions", "entries", "drafts", "custom_subtypes", "usage_counters")


async def _rows(infra: Infra, table: str, user_id: object) -> int:
    async with infra.sql() as session:
        value = await session.scalar(
            text(f"SELECT count(*) FROM {table} WHERE user_id = :u"), {"u": user_id}
        )
    return int(value or 0)


async def test_deleting_the_account_wipes_postgres_and_neo4j_for_that_tenant(
    infra: Infra, llm: LLMScript
) -> None:
    sc.dinner_with_laozhang(llm)
    user = await new_user(infra)
    other = await new_user(infra, "小红")
    await seed(infra, other, Seed(persons=["老张"]))
    await sc.confirmed(infra, user, (await sc.extracted(infra, user, sc.DINNER)).id)
    with tenant_scope(user.tenant):
        await taxonomy.add_custom_subtype(infra, category=Category.SOCIAL, name="球友")
        await entries.submit_entry(infra, text="还没整理的一条", occurred=None)
    assert all([await _rows(infra, t, user.id) for t in USER_TABLES])
    assert await count_group_nodes(infra, user) > 1
    other_nodes = await count_group_nodes(infra, other)

    with tenant_scope(user.tenant):
        assert isinstance(await accounts.delete_account(infra, password=user.password), Ok)

    for table in USER_TABLES:
        assert await _rows(infra, table, user.id) == 0, table
    async with infra.sql() as session:
        users = await session.scalar(
            text("SELECT count(*) FROM users WHERE id = :u"), {"u": user.id}
        )
    assert users == 0
    async with infra.neo4j.session() as session:
        result = await session.run(
            """
            OPTIONAL MATCH (n) WHERE n.group_id = $g
            WITH count(n) AS nodes
            OPTIONAL MATCH ()-[r]->() WHERE r.group_id = $g
            RETURN nodes, count(r) AS edges
            """,
            g=user.tenant.group_id,
        )
        record = await result.single()
    assert record is not None and (record["nodes"], record["edges"]) == (0, 0)
    assert await count_group_nodes(infra, other) == other_nodes  # nobody else touched


async def test_a_deleted_account_cannot_log_in_and_its_invite_stays_used(infra: Infra) -> None:
    user = await new_user(infra)
    [used] = [i.code for i in await invites.list_all(infra) if i.status == "used"]
    with tenant_scope(user.tenant):
        await accounts.delete_account(infra, password=user.password)

    login = await accounts.login(infra, username=user.username, password=user.password)
    assert isinstance(login, Err) and login.reason == "invalid_credentials"
    assert await accounts.resolve_session(infra, user.token) is None
    again = await accounts.register(
        infra, invite_code=used, username="reuse", password="another password", display_name="x"
    )
    assert isinstance(again, Err) and again.reason == "invite_used"


async def test_a_wrong_password_deletes_nothing(infra: Infra) -> None:
    user = await new_user(infra)
    with tenant_scope(user.tenant):
        result = await accounts.delete_account(infra, password="not my password")
    assert isinstance(result, Err) and result.reason == "wrong_password"
    assert await accounts.resolve_session(infra, user.token) is not None
    assert await count_group_nodes(infra, user) == 1
