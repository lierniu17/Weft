"""Admin commands acting inside one user's graph: seed, embeddings backfill, summaries."""

from __future__ import annotations

import pytest

from tests.support.graph import Seed, persons_of, seed
from tests.support.llm_script import LLMScript
from tests.support.users import new_user
from weft import cli
from weft.domain.confidence import Confidence
from weft.domain.graph_view import PanoramaFilter
from weft.domain.tenancy import tenant_scope
from weft.infra import Infra
from weft.services import graph_views

pytestmark = pytest.mark.service


async def test_seed_fills_an_empty_graph_and_refuses_a_second_time(
    infra: Infra, capsys: pytest.CaptureFixture[str]
) -> None:
    user = await new_user(infra)
    assert await cli.run(["seed", "--user", user.username], infra=infra) == 0
    assert "31 persons" in capsys.readouterr().out
    assert len(await persons_of(infra, user)) == 31
    assert await cli.run(["seed", "--user", user.username], infra=infra) == 1
    assert "只有本人" in capsys.readouterr().err


async def test_seed_size_grows_the_graph_for_performance_tests(
    infra: Infra, capsys: pytest.CaptureFixture[str]
) -> None:
    user = await new_user(infra)
    assert await cli.run(["seed", "--user", user.username, "--size", "300"], infra=infra) == 0
    assert "300 persons" in capsys.readouterr().out
    people = await persons_of(infra, user)
    assert len(people) == 300 and len({p.name for p in people}) == 300
    with tenant_scope(user.tenant):
        view = await graph_views.panorama(infra, PanoramaFilter())
    assert len(view.nodes) == 300
    assert sum(1 for n in view.nodes if n.anchor_id) > 30  # 间接认识 persons
    assert len(view.groups) >= 10


async def test_commands_need_an_existing_user(
    infra: Infra, capsys: pytest.CaptureFixture[str]
) -> None:
    for command in (["seed"], ["embeddings", "backfill"], ["summaries", "refresh"]):
        assert await cli.run([*command, "--user", "nobody"], infra=infra) == 1
        assert "nobody" in capsys.readouterr().err


async def test_backfill_embeds_one_users_graph(
    infra: Infra, llm: LLMScript, capsys: pytest.CaptureFixture[str]
) -> None:
    user = await new_user(infra)
    other = await new_user(infra)
    facts = [("老张", "LIKES", "露营", Confidence.WITNESSED, None)]
    await seed(infra, user, Seed(persons=["老张"], facts=facts))
    await seed(infra, other, Seed(persons=["小李"]))
    assert await cli.run(["embeddings", "backfill", "--user", user.username], infra=infra) == 0
    assert "2 nodes, 1 facts" in capsys.readouterr().out
    assert "小李" not in llm.embedded


async def test_summaries_refresh_regenerates_what_is_stale(
    infra: Infra, llm: LLMScript, capsys: pytest.CaptureFixture[str]
) -> None:
    user = await new_user(infra)
    await seed(
        infra,
        user,
        Seed(persons=["老张"], facts=[("老张", "LIKES", "露营", Confidence.WITNESSED, None)]),
    )
    llm.person_summary("老张", "老张喜欢露营。")
    assert await cli.run(["summaries", "refresh", "--user", user.username], infra=infra) == 0
    assert "1 persons, 0 relationships, 0 failed" in capsys.readouterr().out
