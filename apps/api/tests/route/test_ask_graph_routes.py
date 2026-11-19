"""问答 and graph routes over HTTP, and citations / summaries on profile and pair routes.

AC-24, AC-25, AC-33, AC-34, AC-36..AC-40 at the HTTP seam (status codes, contract shapes).
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

import pytest
from fastapi import FastAPI

from tests.route.conftest import ApiUser, Register, as_test_user
from tests.support import asks
from tests.support import scenarios as sc
from tests.support.graph import Seed, seed
from tests.support.llm_script import LLMScript
from weft.contracts import CONTRACTS
from weft.domain.answer import Answer, AnswerKind
from weft.domain.confidence import Confidence
from weft.domain.taxonomy import Category
from weft.domain.tenancy import tenant_scope
from weft.infra import Infra
from weft.services import seed as seed_service
from weft.services.results import Ok

pytestmark = pytest.mark.route


@dataclass
class Seeded:
    api: ApiUser
    ids: dict[str, str]


@pytest.fixture
async def seeded(infra: Infra, register: Register) -> AsyncIterator[Seeded]:
    api = await register()
    with tenant_scope(as_test_user(api).tenant):
        result = await seed_service.seed_graph(infra)
    assert isinstance(result, Ok)
    yield Seeded(api, result.value.persons)


# --- ask -----------------------------------------------------------------------------------


async def test_ask_answers_with_the_published_answer_contract(
    app: FastAPI, llm: LLMScript, seeded: Seeded
) -> None:
    asks.laozhang_profile(llm)
    response = await seeded.api.client.post("/api/ask", json={"question": asks.PROFILE})
    assert response.status_code == 200, response.text
    answer = Answer.model_validate(response.json())
    assert answer.kind is AnswerKind.TEXT
    assert all(seg.citations for seg in answer.segments)
    schemas = app.openapi()["components"]["schemas"]
    published = CONTRACTS["answer.schema.json"]()
    assert set(schemas["Answer"]["properties"]) == set(published["properties"])
    assert set(schemas["Citation"]["properties"]) == set(
        published["$defs"]["Citation"]["properties"]
    )


async def test_ask_is_limited_per_day(infra: Infra, llm: LLMScript, seeded: Seeded) -> None:
    infra.settings = infra.settings.model_copy(update={"daily_ask_limit": 1})
    asks.unknown_person(llm)
    first = await seeded.api.client.post("/api/ask", json={"question": asks.UNKNOWN})
    second = await seeded.api.client.post("/api/ask", json={"question": asks.UNKNOWN})
    usage = (await seeded.api.client.get("/api/usage")).json()
    assert first.status_code == 200 and first.json()["kind"] == "no_answer"
    assert second.status_code == 429
    assert second.json()["error"] == "quota_exceeded"
    assert second.json()["resets_at"] == "2026-11-17T00:00:00+08:00"
    assert usage["ask"] == {"used": 1, "limit": 1, "remaining": 0}


@pytest.mark.parametrize(
    "body",
    [
        {"question": ""},
        {"question": "   "},
        {"question": "问" * 501},
        {"question": "老张？", "group_id": "u_x"},
    ],
)
async def test_bad_questions_and_tenant_fields_are_refused(
    seeded: Seeded, body: dict[str, str]
) -> None:
    response = await seeded.api.client.post("/api/ask", json=body)
    assert response.status_code == 422, response.text


# --- local graph (AC-33) -------------------------------------------------------------------


async def test_the_local_graph_shows_one_hop_by_default_and_two_on_request(seeded: Seeded) -> None:
    url = f"/api/persons/{seeded.ids['老张']}/graph"
    one = (await seeded.api.client.get(url)).json()
    two = (await seeded.api.client.get(url, params={"hops": 2})).json()
    assert one["center_id"] == seeded.ids["老张"]
    assert {n["name"] for n in one["nodes"]} == {
        "小明",
        "张伟",
        "李明",
        "王浩",
        "吴昊",
        "黄丽",
        "老张的女儿",
    }
    assert len(two["nodes"]) > len(one["nodes"])
    assert {"刘洋", "宋佳", "周涛"} <= {n["name"] for n in two["nodes"]}
    assert one["omitted"] == two["omitted"] == 0
    [roommates] = [
        e
        for e in one["edges"]
        if {e["source"], e["target"]} == {seeded.ids["老张"], seeded.ids["小李"]}
    ]
    assert (roommates["types"][0]["subtype"], roommates["status"]) == ("室友", "tense")


async def test_the_local_graph_keeps_the_fifty_closest(infra: Infra, register: Register) -> None:
    api = await register()
    friends = [f"朋友{i:02d}" for i in range(55)]
    ids = await seed(
        infra,
        as_test_user(api),
        Seed(
            persons=["老张", *friends],
            relationships=[("老张", f, Category.SOCIAL, "朋友") for f in friends],
            feelings=[
                ("老张", f, "closeness", "intimate", "2026-01", Confidence.WITNESSED)
                for f in friends[:3]
            ],
        ),
    )
    graph = (await api.client.get(f"/api/persons/{ids['老张']}/graph")).json()
    kept = {n["name"] for n in graph["nodes"]}
    assert (len(graph["nodes"]), graph["omitted"]) == (50, 6)
    assert {"老张", "朋友00", "朋友01", "朋友02"} <= kept


@pytest.mark.parametrize("hops", ["0", "3", "x"])
async def test_only_one_or_two_hops(seeded: Seeded, hops: str) -> None:
    response = await seeded.api.client.get(
        f"/api/persons/{seeded.ids['老张']}/graph", params={"hops": hops}
    )
    assert response.status_code == 422


async def test_the_local_graph_of_an_unknown_person_is_not_found(seeded: Seeded) -> None:
    response = await seeded.api.client.get("/api/persons/nobody/graph")
    assert response.status_code == 404 and response.json()["error"] == "not_found"


# --- panorama (AC-34) ------------------------------------------------------------------------


async def test_the_panorama_is_everyone_around_self(seeded: Seeded) -> None:
    graph = (await seeded.api.client.get("/api/graph")).json()
    me = next(n for n in graph["nodes"] if n["is_self"])
    assert graph["center_id"] == me["id"] and len(graph["nodes"]) == 31


async def test_the_panorama_filters_by_category_and_closeness(seeded: Seeded) -> None:
    response = await seeded.api.client.get(
        "/api/graph", params={"category": "social", "closeness": "close"}
    )
    graph = response.json()
    # 郑凯 is 合伙人 and (since 2025-12) also 朋友
    assert {n["name"] for n in graph["nodes"]} == {"小明", "张伟", "李明", "郑凯"}
    assert all(any(t["category"] == "social" for t in e["types"]) for e in graph["edges"])
    assert len(graph["edges"]) == 4


async def test_the_panorama_filters_by_subtype(seeded: Seeded) -> None:
    graph = (await seeded.api.client.get("/api/graph", params={"subtype": "同学,师生"})).json()
    assert {n["name"] for n in graph["nodes"]} == {"小明", "李明", "陈静", "周涛", "罗建华"}


async def test_the_panorama_carries_what_the_star_graph_needs(seeded: Seeded) -> None:
    graph = (await seeded.api.client.get("/api/graph")).json()
    nodes = {n["name"]: n for n in graph["nodes"]}
    me, zhang = nodes["小明"], nodes["张伟"]
    assert (me["met_at"], me["anchor_person_id"]) == (None, None)
    assert (zhang["met_at"], zhang["anchor_person_id"]) == ("2018-03", None)
    daughter = nodes["老张的女儿"]
    assert (daughter["met_at"], daughter["anchor_person_id"]) == ("2026-11-10", zhang["id"])
    [me_zhang] = [
        e for e in graph["edges"] if {e["source"], e["target"]} == {me["id"], zhang["id"]}
    ]
    mine, theirs = (
        (me_zhang["source_closeness"], me_zhang["target_closeness"])
        if me_zhang["source"] == me["id"]
        else (me_zhang["target_closeness"], me_zhang["source_closeness"])
    )
    assert (mine, theirs, me_zhang["closeness"]) == ("intimate", "close", "intimate")
    assert me_zhang["confidence"] == "witnessed"
    assert [t["subtype"] for t in me_zhang["types"]] == ["同事", "朋友"]
    groups = {(g["kind"], g["name"]) for g in graph["groups"]}
    assert {("organization", "字节跳动"), ("school", "浙江大学"), ("family", "张伟家")} <= groups
    assert graph["timeline"] == {"from": "2012", "to": "2026-11-16"}
    assert graph["at"] is None


async def test_the_panorama_at_a_time_point(seeded: Seeded) -> None:
    client = seeded.api.client
    then = (await client.get("/api/graph", params={"at": "2013"})).json()
    assert {n["name"] for n in then["nodes"]} == {"小明", "唐亮"}
    assert then["at"] == "2013" and then["timeline"] == {"from": "2012", "to": "2026-11-16"}

    def roommates(graph: dict[str, Any]) -> dict[str, Any]:
        ids = {seeded.ids["老张"], seeded.ids["小李"]}
        [e] = [e for e in graph["edges"] if {e["source"], e["target"]} == ids]
        return e

    before = (await client.get("/api/graph", params={"at": "2024-12"})).json()
    after = (await client.get("/api/graph", params={"at": "2025-06"})).json()
    assert (roommates(before)["status"], roommates(after)["status"]) == (None, "tense")
    filtered = await client.get(
        "/api/graph", params={"at": "2016", "category": "social", "closeness": "close"}
    )
    assert {n["name"] for n in filtered.json()["nodes"]} == {"小明", "李明"}


@pytest.mark.parametrize("at", ["2013-13", "13", "yesterday", "2013-02-30"])
async def test_a_malformed_time_point_is_refused(seeded: Seeded, at: str) -> None:
    response = await seeded.api.client.get("/api/graph", params={"at": at})
    assert response.status_code == 422 and response.json()["error"] == "validation_error"


@pytest.mark.parametrize("params", [{"category": "friends"}, {"closeness": "very"}])
async def test_unknown_panorama_filters_are_refused(seeded: Seeded, params: dict[str, str]) -> None:
    assert (await seeded.api.client.get("/api/graph", params=params)).status_code == 422


# --- citations (AC-25) and summaries (AC-24, AC-28) -----------------------------------------


async def test_every_profile_and_relationship_item_returns_its_citations(seeded: Seeded) -> None:
    client = seeded.api.client
    profile = (await client.get(f"/api/persons/{seeded.ids['小李']}")).json()
    assert profile["facts"] and all(f["citations"] for f in profile["facts"])
    [old_job] = [f for f in profile["facts"] if f["object"] == "字节跳动"]
    assert old_job["citations"] == [
        {
            "entry_id": old_job["sources"][0],
            "entry_excerpt": "小李跟我说他去字节跳动上班了。",
            "occurred_on": "2023-02-20",
            "kind": "user",
            "confidence": "self_told",
        }
    ]
    laozhang = (await client.get(f"/api/persons/{seeded.ids['老张']}")).json()
    [opinion] = [f for f in laozhang["facts"] if f["kind"] == "opinion"]
    assert opinion["citations"][0]["entry_excerpt"].endswith("做事很靠谱。")

    pair = (
        await client.get(f"/api/persons/{seeded.ids['老张']}/relationships/{seeded.ids['小李']}")
    ).json()
    # told twice: 紧张 since 2025 (陈静), 闹掰 in 2026-09 (小王)
    assert [(c["confidence"], c["occurred_on"]) for c in pair["relationship"]["citations"]] == [
        ("hearsay", "2025-05-18"),
        ("hearsay", "2026-10-08"),
    ]
    assert all(f["citations"] for f in pair["facts"])
    trust = pair["b_to_a"]["dimensions"]["trust"]["current"]
    assert trust["citations"][0]["entry_excerpt"].startswith("听小王说")


async def test_a_confirmed_draft_gets_its_summary_with_the_generation_time(
    llm: LLMScript, register: Register
) -> None:
    sc.dinner_with_laozhang(llm)
    llm.person_summary("老张", "老张最近迷上了钓鱼，不喝酒。")
    llm.person_summary("老张的女儿", "老张的女儿明年高考。")
    llm.relationship_summary("老张", "老张的女儿", "老张是她的父亲。")
    api = await register()
    submitted = (await api.client.post("/api/entries", json={"text": sc.DINNER})).json()
    confirmed = await api.client.post(f"/api/drafts/{submitted['draft']['id']}/confirm")
    assert confirmed.status_code == 200
    found = (await api.client.get("/api/persons", params={"q": "老张"})).json()
    [laozhang] = [p for p in found if p["name"] == "老张"]
    profile = (await api.client.get(f"/api/persons/{laozhang['id']}")).json()
    assert profile["summary"]["text"] == "老张最近迷上了钓鱼，不喝酒。"
    assert profile["summary"]["generated_at"].startswith("2026-11-16T04:00")


async def test_a_person_is_found_by_any_alias(seeded: Seeded) -> None:
    found = (await seeded.api.client.get("/api/persons", params={"q": "老张"})).json()
    # and the descriptor person 老张的女儿 by her name
    assert [(p["name"], p["aliases"]) for p in found] == [("张伟", ["老张"]), ("老张的女儿", [])]
