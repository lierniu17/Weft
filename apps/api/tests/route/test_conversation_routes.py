"""对话上下文 over HTTP (conversation-context AC-2, AC-10, AC-11, Q&A part): the 指代确认 on a
message (source ask, person ids), clicking a candidate, 「接着：…」 (history_used_of) and
``POST /api/messages/{id}/reanswer``."""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

import pytest

from tests.route.conftest import ApiUser, Register, as_test_user
from tests.support.asks import (
    JIANGUO,
    LIKES,
    TAO,
    WHICH,
    WIFE,
    WORKS,
    laozhang_works,
    likes_of,
    which_laozhou,
    wife_alone,
    wife_follows,
)
from tests.support.llm_script import LLMScript
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


async def send(user: ApiUser, text: str) -> dict[str, Any]:
    response = await user.client.post("/api/messages", json={"text": text})
    assert response.status_code == 201, response.text
    return response.json()  # type: ignore[no-any-return]


async def asks_used(user: ApiUser) -> int:
    usage = (await user.client.get("/api/usage")).json()
    return int(usage["ask"]["used"])


async def test_a_confirmation_is_returned_restored_and_settled_by_a_free_click(
    llm: LLMScript, seeded: Seeded
) -> None:
    which_laozhou(llm)
    likes_of(llm, TAO, "周涛", "钓鱼")
    user = seeded.api

    body = await send(user, LIKES)

    assert (body["intent"], body["answer"], body["uncertain"]) == ("ask", None, False)
    assert body["clarify"] == {
        "source": "ask",
        "question": WHICH,
        "options": [
            {
                "label": "老周（周涛，大学同学）",
                "intent": "ask",
                "question": TAO,
                "person_id": seeded.ids["周涛"],
            },
            {
                "label": "老周（周建国，老家的老邻居）",
                "intent": "ask",
                "question": JIANGUO,
                "person_id": seeded.ids["周建国"],
            },
        ],
        "resolved": False,
    }
    listed = (await user.client.get("/api/messages")).json()["messages"]
    assert listed[-1]["clarify"] == body["clarify"]  # AC-11

    response = await user.client.post(
        f"/api/messages/{body['message_id']}/clarify", json={"option": 0}
    )

    assert response.status_code == 200, response.text
    done = response.json()
    assert done["answer"]["kind"] == "text" and done["clarify"]["resolved"] is True
    assert await asks_used(user) == 1


async def test_a_follow_up_says_what_it_followed_and_can_be_answered_without_it(
    llm: LLMScript, seeded: Seeded
) -> None:
    laozhang_works(llm)
    wife_follows(llm, [WORKS])
    wife_alone(llm)
    user = seeded.api
    first = await send(user, WORKS)

    second = await send(user, WIFE)

    assert first["history_used_of"] == []
    assert second["history_used_of"] == [{"message_id": first["message_id"], "question": WORKS}]
    listed = (await user.client.get("/api/messages")).json()["messages"]
    assert listed[-1]["history_used_of"] == second["history_used_of"]  # AC-11

    response = await user.client.post(f"/api/messages/{second['message_id']}/reanswer")

    assert response.status_code == 200, response.text
    again = response.json()
    assert again["answer"]["kind"] == "no_answer" and again["history_used_of"] == []
    assert await asks_used(user) == 3
    refused = await user.client.post(f"/api/messages/{second['message_id']}/reanswer")
    assert refused.status_code == 409 and refused.json()["error"] == "no_history"
