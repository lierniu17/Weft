"""Tenant isolation red line (AC-4): two users, every route, cross access.

User A owns a confirmed Entry (person 老张 with facts), a 待确认 Draft, a failed Draft and a
custom subtype. User B — with his own 老张 — then calls **every route of the app** aimed
at A's ids (or, for collection routes, looks for A's data in the answer, including with
smuggled tenant query parameters). Id routes must answer 404 exactly as for an id that
does not exist; collections must contain only B's data; afterwards A's data is unchanged.

The route list comes from the live OpenAPI document: a new route without a case here makes
``test_every_route_has_an_isolation_case`` fail.
"""

from __future__ import annotations

import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

import httpx
import pytest
from fastapi import FastAPI

from tests.route.conftest import ApiUser, Register
from tests.support import scenarios as sc
from tests.support.asks import final
from tests.support.llm_script import LLMScript
from weft.main import PUBLIC_ROUTES

pytestmark = pytest.mark.route


@dataclass
class World:
    a: ApiUser
    b: ApiUser
    a_entry: str
    a_draft_confirmed: str
    a_draft_pending: str
    a_draft_failed: str
    a_message: str  # A's chitchat message
    a_person: str  # A's 老张
    a_fact: str  # A's 老张 LIKES 钓鱼
    b_person: str  # B's own 老张
    a_snapshot: dict[str, Any]


async def snapshot(user: ApiUser, **ids: str) -> dict[str, Any]:
    c = user.client
    return {
        "entries": (await c.get("/api/entries")).json(),
        "persons": (await c.get("/api/persons")).json(),
        "taxonomy": (await c.get("/api/taxonomy")).json(),
        "usage": (await c.get("/api/usage")).json(),
        "preferences": (await c.get("/api/me/preferences")).json(),
        "messages": (await c.get("/api/messages")).json(),
        **{
            name: (await c.get(url)).json()
            for name, url in {
                "pending": f"/api/drafts/{ids['pending']}",
                "failed": f"/api/drafts/{ids['failed']}",
                "profile": f"/api/persons/{ids['person']}",
                "me": "/api/auth/me",
            }.items()
        },
    }


B_QUESTION = "老张喜欢什么？"
THANKS = "谢谢"
FOREIGN_GROUP = "u_ffffffffffffffffffffffffffffffff"


def b_asks_about_laozhang(llm: LLMScript) -> None:
    """B's model first smuggles a tenant into a tool call, then asks properly."""
    llm.ask(
        B_QUESTION,
        [("read_profile", {"person": "老张", "group_id": FOREIGN_GROUP})],
        [("read_profile", {"person": "老张"})],
        final("text", ("老张最近迷上了钓鱼。", ["E2"])),
    )


@pytest.fixture
async def world(register: Register, llm: LLMScript) -> World:
    sc.dinner_with_laozhang(llm)
    sc.laozhang_likes_fishing(llm, "我和老张去吃了火锅")  # B's own 老张
    sc.graphiti_only(llm, sc.FLAKY)
    sc.flaky_ok(llm)
    sc.graphiti_only(llm, sc.GARBLED)
    llm.enrichment_raw(
        sc.GARBLED, "抱歉，我暂时无法处理这条记录。"
    )  # same as test_drafts: one response per request
    b_asks_about_laozhang(llm)
    llm.intent(THANKS, "chitchat", confidence=0.98, reply="不客气")
    a, b = await register("甲"), await register("乙")

    confirmed = (await a.client.post("/api/entries", json={"text": sc.DINNER})).json()
    draft_id = confirmed["draft"]["id"]
    assert (await a.client.post(f"/api/drafts/{draft_id}/confirm")).status_code == 200
    pending = (await a.client.post("/api/entries", json={"text": sc.FLAKY})).json()
    failed = (await a.client.post("/api/entries", json={"text": sc.GARBLED})).json()
    await a.client.post("/api/taxonomy/subtypes", json={"category": "social", "name": "饭搭子"})
    await a.client.patch("/api/me/preferences", json={"graph_theme": "starfield"})
    a_message = (await a.client.post("/api/messages", json={"text": THANKS})).json()
    found = (await a.client.get("/api/persons", params={"q": "老张"})).json()
    [a_person] = [p for p in found if p["name"] == "老张"]  # not 老张的女儿
    profile = (await a.client.get(f"/api/persons/{a_person['id']}")).json()
    [a_fact] = [f for f in profile["facts"] if f["object"] == "钓鱼"]

    b_draft = (await b.client.post("/api/entries", json={"text": "我和老张去吃了火锅"})).json()
    await b.client.post(f"/api/drafts/{b_draft['draft']['id']}/confirm")
    [b_person] = (await b.client.get("/api/persons", params={"q": "老张"})).json()

    ids = {
        "pending": pending["draft"]["id"],
        "failed": failed["draft"]["id"],
        "person": a_person["id"],
    }
    assert (await a.client.get(f"/api/drafts/{ids['pending']}")).json()["status"] == "pending"
    assert (await a.client.get(f"/api/drafts/{ids['failed']}")).json()["status"] == "failed"
    return World(
        a=a,
        b=b,
        a_entry=confirmed["entry"]["id"],
        a_draft_confirmed=draft_id,
        a_draft_pending=ids["pending"],
        a_draft_failed=ids["failed"],
        a_message=a_message["message_id"],
        a_person=a_person["id"],
        a_fact=a_fact["id"],
        b_person=b_person["id"],
        a_snapshot=await snapshot(a, **ids),
    )


def a_ids(w: World) -> set[str]:
    return {
        str(w.a.id),
        w.a.self_person_id,
        w.a_entry,
        w.a_draft_confirmed,
        w.a_draft_pending,
        w.a_draft_failed,
        w.a_message,
        w.a_person,
        w.a_fact,
    }


def assert_no_a_data(w: World, response: httpx.Response) -> None:
    assert response.status_code < 400, response.text
    text = response.text
    leaked = [i for i in a_ids(w) if i in text]
    assert not leaked, f"A's ids leaked to B: {leaked}"
    assert "饭搭子" not in text and "甲" not in text and sc.DINNER not in text


def assert_not_found(response: httpx.Response) -> None:
    assert response.status_code == 404, response.text
    assert response.json()["error"] == "not_found"


def smuggled(w: World) -> dict[str, str]:
    return {"group_id": f"u_{w.a.id.hex}", "user_id": str(w.a.id), "tenant": str(w.a.id)}


Case = Callable[[World], Awaitable[None]]
CASES: dict[tuple[str, str], Case] = {}


def case(method: str, path: str) -> Callable[[Case], Case]:
    def register_case(fn: Case) -> Case:
        CASES[(method, path)] = fn
        return fn

    return register_case


# --- account ----------------------------------------------------------------------------


@case("POST", "/api/auth/logout")
async def _logout(w: World) -> None:
    cookie = "; ".join(f"{k}={v}" for k, v in w.b.client.cookies.items())
    assert (await w.b.client.post("/api/auth/logout", params=smuggled(w))).status_code == 204
    assert (await w.a.client.get("/api/auth/me")).status_code == 200  # A still logged in
    replay = await w.b.client.get("/api/auth/me", headers={"cookie": cookie})
    assert replay.status_code == 401  # B's old token is dead; log in again for later cases
    login = await w.b.client.post(
        "/api/auth/login", json={"username": w.b.username, "password": w.b.password}
    )
    assert login.status_code == 200


@case("GET", "/api/auth/me")
async def _me(w: World) -> None:
    response = await w.b.client.get("/api/auth/me", params=smuggled(w))
    assert response.json()["id"] == str(w.b.id)
    assert_no_a_data(w, response)


@case("DELETE", "/api/account")
async def _delete_account(w: World) -> None:
    """Runs last: B deletes *his* account; nothing of A's goes with it."""
    response = await w.b.client.request(
        "DELETE", "/api/account", json={"password": w.b.password}, params=smuggled(w)
    )
    assert response.status_code == 204
    assert (await w.a.client.get("/api/auth/me")).status_code == 200


# --- entries / drafts --------------------------------------------------------------------


@case("POST", "/api/entries")
async def _submit(w: World) -> None:
    response = await w.b.client.post("/api/entries", json={"text": sc.GARBLED}, params=smuggled(w))
    assert response.status_code == 201
    assert_no_a_data(w, response)


@case("GET", "/api/entries")
async def _entries(w: World) -> None:
    assert_no_a_data(w, await w.b.client.get("/api/entries", params=smuggled(w)))


@case("GET", "/api/entries/{entry_id}")
async def _entry(w: World) -> None:
    assert_not_found(await w.b.client.get(f"/api/entries/{w.a_entry}"))


@case("GET", "/api/drafts/{draft_id}")
async def _draft(w: World) -> None:
    for draft in (w.a_draft_confirmed, w.a_draft_pending, w.a_draft_failed):
        assert_not_found(await w.b.client.get(f"/api/drafts/{draft}"))


@case("PUT", "/api/drafts/{draft_id}")
async def _update_draft(w: World) -> None:
    content = {"persons": [], "facts": [], "relationships": [], "feelings": [], "profile": []}
    for extra in ({}, {"occurred_on": "2015"}):
        response = await w.b.client.put(
            f"/api/drafts/{w.a_draft_pending}", json={"content": content, **extra}
        )
        assert_not_found(response)


@case("POST", "/api/drafts/{draft_id}/confirm")
async def _confirm(w: World) -> None:
    assert_not_found(await w.b.client.post(f"/api/drafts/{w.a_draft_pending}/confirm"))


@case("POST", "/api/drafts/{draft_id}/discard")
async def _discard(w: World) -> None:
    assert_not_found(await w.b.client.post(f"/api/drafts/{w.a_draft_pending}/discard"))


@case("POST", "/api/drafts/{draft_id}/questions/{question_id}/answer")
async def _answer_question(w: World) -> None:
    for body in ({"option": 0}, {"text": "同事"}):
        response = await w.b.client.post(
            f"/api/drafts/{w.a_draft_pending}/questions/q1/answer", json=body
        )
        assert_not_found(response)


@case("POST", "/api/drafts/{draft_id}/retry")
async def _retry(w: World) -> None:
    assert_not_found(await w.b.client.post(f"/api/drafts/{w.a_draft_failed}/retry"))


# --- messages (intent routing) -----------------------------------------------------------


@case("POST", "/api/messages")
async def _send_message(w: World) -> None:
    response = await w.b.client.post("/api/messages", json={"text": THANKS}, params=smuggled(w))
    assert response.status_code == 201, response.text
    assert_no_a_data(w, response)
    smuggling = await w.b.client.post(
        "/api/messages", json={"text": THANKS, "user_id": str(w.a.id)}
    )
    assert smuggling.status_code == 422


@case("GET", "/api/messages")
async def _messages(w: World) -> None:
    response = await w.b.client.get("/api/messages", params=smuggled(w))
    assert_no_a_data(w, response)
    assert all(m["text"] == THANKS for m in response.json()["messages"])
    assert_not_found(await w.b.client.get("/api/messages", params={"before": w.a_message}))


@case("POST", "/api/messages/{message_id}/reroute")
async def _reroute(w: World) -> None:
    for target in ("record", "ask"):
        response = await w.b.client.post(
            f"/api/messages/{w.a_message}/reroute", json={"as": target}, params=smuggled(w)
        )
        assert_not_found(response)


@case("POST", "/api/messages/{message_id}/clarify")
async def _clarify(w: World) -> None:
    for option in (0, 1):
        response = await w.b.client.post(
            f"/api/messages/{w.a_message}/clarify", json={"option": option}, params=smuggled(w)
        )
        assert_not_found(response)


@case("POST", "/api/messages/{message_id}/reanswer")
async def _reanswer(w: World) -> None:
    response = await w.b.client.post(f"/api/messages/{w.a_message}/reanswer", params=smuggled(w))
    assert_not_found(response)


# --- persons / relationships ------------------------------------------------------------


@case("GET", "/api/persons")
async def _persons(w: World) -> None:
    for params in (smuggled(w), {"q": "老张", **smuggled(w)}):
        response = await w.b.client.get("/api/persons", params=params)
        assert_no_a_data(w, response)
    names = [p["id"] for p in (await w.b.client.get("/api/persons", params={"q": "老张"})).json()]
    assert names == [w.b_person]


@case("GET", "/api/persons/{person_id}")
async def _profile(w: World) -> None:
    for person in (w.a_person, w.a.self_person_id):
        assert_not_found(await w.b.client.get(f"/api/persons/{person}"))


@case("PATCH", "/api/persons/{person_id}/profile")
async def _edit_profile(w: World) -> None:
    edits: list[tuple[str, dict[str, Any]]] = [
        (w.a_person, {"op": "set_identity", "field": "birthday", "value": "01-01"}),
        (w.a_person, {"op": "add_fact", "predicate": "LIKES", "object": "偷看"}),
        (w.a_person, {"op": "delete_fact", "fact_id": w.a_fact}),
        # A's fact through B's own person
        (w.b_person, {"op": "delete_fact", "fact_id": w.a_fact}),
        (w.b_person, {"op": "update_fact", "fact_id": w.a_fact, "object": "篡改"}),
    ]
    for person, body in edits:
        assert_not_found(await w.b.client.patch(f"/api/persons/{person}/profile", json=body))


@case("GET", "/api/persons/{person_id}/deletion-impact")
async def _impact(w: World) -> None:
    assert_not_found(await w.b.client.get(f"/api/persons/{w.a_person}/deletion-impact"))


@case("DELETE", "/api/persons/{person_id}")
async def _delete_person(w: World) -> None:
    for person in (w.a_person, w.a.self_person_id):
        assert_not_found(await w.b.client.delete(f"/api/persons/{person}"))


def _pairs(w: World) -> list[tuple[str, str]]:
    return [
        (w.a.self_person_id, w.a_person),  # entirely A's
        (w.b.self_person_id, w.a_person),  # B's self with A's person
        (w.b_person, w.a_person),
    ]


@case("GET", "/api/persons/{person_id}/relationships/{other_id}")
async def _pair(w: World) -> None:
    for x, y in _pairs(w):
        assert_not_found(await w.b.client.get(f"/api/persons/{x}/relationships/{y}"))


@case("PATCH", "/api/persons/{person_id}/relationships/{other_id}")
async def _edit_pair(w: World) -> None:
    body = {
        "status": "tense",
        "feelings": [{"direction": "a_to_b", "dimension": "trust", "level": "low"}],
    }
    for x, y in _pairs(w):
        assert_not_found(await w.b.client.patch(f"/api/persons/{x}/relationships/{y}", json=body))


# --- graph views / ask (AC-4, AC-39) ------------------------------------------------------


@case("GET", "/api/persons/{person_id}/graph")
async def _local_graph(w: World) -> None:
    for person in (w.a_person, w.a.self_person_id):
        for hops in (1, 2):
            response = await w.b.client.get(f"/api/persons/{person}/graph", params={"hops": hops})
            assert_not_found(response)
    own = await w.b.client.get(
        f"/api/persons/{w.b_person}/graph", params={"hops": 2, **smuggled(w)}
    )
    assert_no_a_data(w, own)


@case("GET", "/api/graph")
async def _panorama(w: World) -> None:
    for params in (smuggled(w), {"category": "social", **smuggled(w)}):
        response = await w.b.client.get("/api/graph", params=params)
        assert_no_a_data(w, response)
    nodes = (await w.b.client.get("/api/graph")).json()["nodes"]
    assert {n["id"] for n in nodes} == {w.b.self_person_id, w.b_person}


@case("POST", "/api/ask")
async def _ask(w: World) -> None:
    response = await w.b.client.post("/api/ask", json={"question": B_QUESTION}, params=smuggled(w))
    assert_no_a_data(w, response)
    answer = response.json()
    assert answer["kind"] == "text" and answer["citations"]
    b_entries = {e["id"] for e in (await w.b.client.get("/api/entries")).json()}
    assert {c["entry_id"] for c in answer["citations"]} <= b_entries
    assert [p["person_id"] for p in answer["persons"]] in ([], [w.b_person])
    smuggling = await w.b.client.post(
        "/api/ask", json={"question": B_QUESTION, "group_id": f"u_{w.a.id.hex}"}
    )
    assert smuggling.status_code == 422


# --- taxonomy / usage -------------------------------------------------------------------


@case("GET", "/api/taxonomy")
async def _taxonomy(w: World) -> None:
    assert_no_a_data(w, await w.b.client.get("/api/taxonomy", params=smuggled(w)))


@case("POST", "/api/taxonomy/subtypes")
async def _add_subtype(w: World) -> None:
    response = await w.b.client.post(
        "/api/taxonomy/subtypes", json={"category": "kin", "name": "表亲"}, params=smuggled(w)
    )
    assert response.status_code == 201
    assert_no_a_data(w, response)


@case("GET", "/api/usage")
async def _usage(w: World) -> None:
    response = await w.b.client.get("/api/usage", params=smuggled(w))
    assert_no_a_data(w, response)
    b_entries = [e for e in (await w.b.client.get("/api/entries")).json() if e["kind"] == "user"]
    assert response.json()["entry"]["used"] == len(b_entries)


# --- preferences (graph-viz AC-18) --------------------------------------------------------


@case("GET", "/api/me/preferences")
async def _preferences(w: World) -> None:
    response = await w.b.client.get("/api/me/preferences", params=smuggled(w))
    assert_no_a_data(w, response)
    assert response.json() == {"graph_theme": "light"}  # A chose starfield


@case("PATCH", "/api/me/preferences")
async def _edit_preferences(w: World) -> None:
    for params in (smuggled(w), {}):
        response = await w.b.client.patch(
            "/api/me/preferences", json={"graph_theme": "light"}, params=params
        )
        assert_no_a_data(w, response)
    smuggling = await w.b.client.patch(
        "/api/me/preferences", json={"graph_theme": "light", "user_id": str(w.a.id)}
    )
    assert smuggling.status_code == 422
    assert (await w.a.client.get("/api/me/preferences")).json() == {"graph_theme": "starfield"}


# --- the tests ---------------------------------------------------------------------------


async def _app_routes(app: FastAPI) -> set[tuple[str, str]]:
    return {
        (method.upper(), path)
        for path, operations in app.openapi()["paths"].items()
        for method in operations
    }


async def test_every_route_has_an_isolation_case(app: FastAPI) -> None:
    routes = await _app_routes(app)
    business = routes - PUBLIC_ROUTES
    missing = sorted(business - set(CASES))
    stale = sorted(set(CASES) - business)
    assert not missing, f"routes without a cross-tenant isolation case: {missing}"
    assert not stale, f"isolation cases for routes that no longer exist: {stale}"
    assert routes >= PUBLIC_ROUTES


async def test_user_b_cannot_read_change_or_delete_anything_of_user_a(
    app: FastAPI, world: World
) -> None:
    order = sorted(CASES, key=lambda r: r == ("DELETE", "/api/account"))  # account last
    for route in order:
        await CASES[route](world)

    after = await snapshot(
        world.a, pending=world.a_draft_pending, failed=world.a_draft_failed, person=world.a_person
    )
    assert after == world.a_snapshot


async def test_ids_of_another_tenant_look_exactly_like_missing_ids(world: World) -> None:
    missing = await world.b.client.get(f"/api/drafts/{uuid.uuid4()}")
    foreign = await world.b.client.get(f"/api/drafts/{world.a_draft_pending}")
    assert (missing.status_code, missing.json()) == (foreign.status_code, foreign.json())
