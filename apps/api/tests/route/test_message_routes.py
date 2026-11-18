"""Message routes over HTTP (intent routing): send, list, re-route; the occurred date on PUT
/api/drafts. Contract shape, status codes, background extraction (AC-3..AC-10). 反问 (intent
clarify AC-1, AC-3, AC-4, AC-8): the clarify fields and clicking an option."""

from __future__ import annotations

from typing import Any

import pytest
from fastapi import FastAPI

from tests.route.conftest import ApiUser, Register
from tests.support import scenarios as sc
from tests.support.asks import final
from tests.support.llm_script import LLMScript

pytestmark = pytest.mark.route

SAID = "2015 年那年夏天在社团认识了小李"


async def send(user: ApiUser, text: str) -> dict[str, Any]:
    response = await user.client.post("/api/messages", json={"text": text})
    assert response.status_code == 201, response.text
    return response.json()  # type: ignore[no-any-return]


async def test_a_record_message_returns_the_entry_and_its_draft_extracted_in_the_background(
    register: Register, llm: LLMScript
) -> None:
    llm.intent(sc.DINNER, "record")
    sc.dinner_with_laozhang(llm)
    user = await register()

    body = await send(user, sc.DINNER)

    assert set(body) == {
        "message_id",
        "text",
        "created_at",
        "intent",
        "recognized_intent",
        "confidence",
        "uncertain",
        "entry",
        "answer",
        "reply",
        "problems",
        "clarify",
        "clarification_of",
    }
    assert (body["intent"], body["recognized_intent"], body["uncertain"]) == (
        "record",
        "record",
        False,
    )
    assert body["confidence"] == pytest.approx(0.93)
    entry = body["entry"]
    assert (entry["text"], entry["occurred_on"], entry["precision"]) == (
        sc.DINNER,
        "2026-11-16",
        "day",
    )
    assert entry["draft"]["status"] == "extracting"
    assert (body["answer"], body["reply"], body["problems"]) == (None, None, [])
    draft = (await user.client.get(f"/api/drafts/{entry['draft']['id']}")).json()
    assert draft["status"] == "pending"
    usage = (await user.client.get("/api/usage")).json()
    assert (usage["entry"]["used"], usage["ask"]["used"]) == (1, 0)


async def test_a_question_returns_an_answer_and_chitchat_a_reply(
    register: Register, llm: LLMScript
) -> None:
    question = "帮我查下老马孩子叫啥"
    llm.intent(question, "ask")
    llm.ask(question, [("find_person", {"name": "老马"})], final("no_answer"))
    llm.intent("早啊", "chitchat", confidence=0.99, reply="早上好！")
    user = await register()

    asked = await send(user, question)
    chat = await send(user, "早啊")

    assert asked["intent"] == "ask" and asked["entry"] is None
    assert asked["answer"]["kind"] == "no_answer"
    assert (chat["intent"], chat["reply"], chat["answer"], chat["entry"]) == (
        "chitchat",
        "早上好！",
        None,
        None,
    )
    listed = (await user.client.get("/api/messages")).json()
    assert [m["message_id"] for m in listed["messages"]] == [
        asked["message_id"],
        chat["message_id"],
    ]  # newest last
    assert listed["messages"][0]["answer"]["kind"] == "no_answer"  # restored after a reload
    assert listed["has_more"] is False


async def test_a_used_up_quota_is_a_problem_on_the_message_not_an_error(
    register: Register, llm: LLMScript, app: FastAPI
) -> None:
    app.state.infra.settings = app.state.infra.settings.model_copy(update={"daily_entry_limit": 0})
    llm.intent(sc.PROMOTED, "record")
    user = await register()

    body = await send(user, sc.PROMOTED)

    assert body["entry"] is None
    [problem] = body["problems"]
    assert problem == {
        "part": "record",
        "error": "quota_exceeded",
        "message": "今日已达上限，明天 0 点重置",
        "resets_at": "2026-11-17T00:00:00+08:00",
    }


async def test_message_validation_errors(register: Register) -> None:
    user = await register()
    blank = await user.client.post("/api/messages", json={"text": "  "})
    long = await user.client.post("/api/messages", json={"text": "字" * 5001})
    extra = await user.client.post("/api/messages", json={"text": "x", "intent": "ask"})
    assert (blank.status_code, blank.json()["error"]) == (422, "blank_text")
    assert long.status_code == 422 and extra.status_code == 422
    bad_limit = await user.client.get("/api/messages", params={"limit": 0})
    unknown = await user.client.get(
        "/api/messages", params={"before": "00000000-0000-0000-0000-000000000000"}
    )
    assert bad_limit.status_code == 422
    assert (unknown.status_code, unknown.json()["error"]) == (404, "not_found")


async def test_rerouting_over_http(register: Register, llm: LLMScript) -> None:
    text = "老张喜欢什么"
    llm.intent(text, "record")
    sc.laozhang_promoted(llm, text)
    llm.ask(text, [("find_person", {"name": "老张"})], final("no_answer"))
    user = await register()
    sent = await send(user, text)
    message_id = sent["message_id"]

    bad = await user.client.post(f"/api/messages/{message_id}/reroute", json={"as": "chitchat"})
    same = await user.client.post(f"/api/messages/{message_id}/reroute", json={"as": "record"})
    asked = await user.client.post(f"/api/messages/{message_id}/reroute", json={"as": "ask"})

    assert bad.status_code == 422
    assert (same.status_code, same.json()["error"]) == (409, "not_reroutable")
    assert asked.status_code == 200, asked.text
    body = asked.json()
    assert (body["intent"], body["recognized_intent"]) == ("ask", "record")
    assert body["entry"]["draft"]["status"] == "discarded"
    assert body["answer"]["kind"] == "no_answer"
    again = await user.client.post(f"/api/messages/{message_id}/reroute", json={"as": "record"})
    assert again.status_code == 200
    assert again.json()["entry"]["draft"]["status"] in ("extracting", "pending")
    assert again.json()["entry"]["id"] != body["entry"]["id"]  # a new Entry


async def test_a_confirmed_record_cannot_be_rerouted_to_a_question(
    register: Register, llm: LLMScript
) -> None:
    llm.intent(sc.PROMOTED, "record")
    sc.laozhang_promoted(llm)
    user = await register()
    sent = await send(user, sc.PROMOTED)
    draft_id = sent["entry"]["draft"]["id"]
    assert (await user.client.post(f"/api/drafts/{draft_id}/confirm")).status_code == 200

    refused = await user.client.post(
        f"/api/messages/{sent['message_id']}/reroute", json={"as": "ask"}
    )

    assert (refused.status_code, refused.json()["error"]) == (409, "already_confirmed")
    [listed] = (await user.client.get("/api/messages")).json()["messages"]
    assert listed["entry"]["draft"]["status"] == "confirmed"


async def test_moving_a_drafts_occurred_date_over_http(register: Register, llm: LLMScript) -> None:
    llm.intent(SAID, "record", occurred="2015")
    llm.graphiti_entities(SAID, [("小李", "Person")])
    llm.graphiti_facts(SAID, [])
    llm.enrichment(
        SAID,
        {
            "persons": ["小李"],
            "facts": [],
            "relationships": [
                {
                    "pair": ["我", "小李"],
                    "types": [{"category": "social", "subtype": "同学", "original": "社团认识"}],
                    "met_at": "2015",
                    "confidence": "witnessed",
                }
            ],
            "feelings": [],
            "profile": [],
        },
        written_on="2026-11-16",
    )
    user = await register()
    sent = await send(user, SAID)
    assert (sent["entry"]["occurred_on"], sent["entry"]["precision"]) == ("2015", "year")
    draft_id = sent["entry"]["draft"]["id"]
    content = (await user.client.get(f"/api/drafts/{draft_id}")).json()["content"]

    future = await user.client.put(
        f"/api/drafts/{draft_id}", json={"content": content, "occurred_on": "2027"}
    )
    moved = await user.client.put(
        f"/api/drafts/{draft_id}", json={"content": content, "occurred_on": "2016-09"}
    )

    assert (future.status_code, future.json()["error"]) == (422, "future_date")
    assert moved.status_code == 200, moved.text
    assert moved.json()["content"]["relationships"][0]["met_at"] == "2016-09"
    [listed] = (await user.client.get("/api/messages")).json()["messages"]
    assert (listed["entry"]["occurred_on"], listed["entry"]["precision"]) == ("2016-09", "month")


async def test_message_contract_uses_the_published_answer_and_draft_schemas(app: FastAPI) -> None:
    schemas = app.openapi()["components"]["schemas"]
    message = schemas["MessageOut"]["properties"]
    assert message["answer"]["anyOf"][0] == {"$ref": "#/components/schemas/Answer"}
    assert schemas["MessageEntryOut"]["properties"]["draft"]["anyOf"][0] == {
        "$ref": "#/components/schemas/DraftOut"
    }
    assert set(schemas["Intent"]["enum"]) == {"record", "ask", "record_ask", "chitchat"}
    assert schemas["RerouteRequest"]["required"] == ["as"]
    assert "occurred_on" in schemas["UpdateDraftRequest"]["properties"]


# --- 反问 (intent clarify) -------------------------------------------------------------------

UNSURE = "小蒋最近好像不太开心吧"
UNSURE_ASKED = "你是想记下小蒋最近不开心，还是想查小蒋最近怎么样？"
UNSURE_OPTIONS = [
    {"label": "记下：小蒋最近不开心", "intent": "record"},
    {"label": "查：小蒋最近怎么样", "intent": "ask", "question": "小蒋最近怎么样？"},
]


def unsure(llm: LLMScript) -> None:
    llm.intent(
        UNSURE,
        "record",
        confidence=0.45,
        clarify={"question": UNSURE_ASKED, "options": UNSURE_OPTIONS},
    )


async def test_a_clarification_is_returned_restored_and_settled_by_a_click(
    register: Register, llm: LLMScript
) -> None:
    unsure(llm)
    llm.ask("小蒋最近怎么样？", [("find_person", {"name": "小蒋"})], final("no_answer"))
    user = await register()

    body = await send(user, UNSURE)

    assert (body["intent"], body["uncertain"], body["reply"]) == ("chitchat", True, UNSURE_ASKED)
    assert body["clarify"] == {
        "question": UNSURE_ASKED,
        "options": [
            {"label": "记下：小蒋最近不开心", "intent": "record", "question": None},
            {"label": "查：小蒋最近怎么样", "intent": "ask", "question": "小蒋最近怎么样？"},
        ],
        "resolved": False,
    }
    assert body["clarification_of"] is None
    [restored] = (await user.client.get("/api/messages")).json()["messages"]
    assert restored["clarify"] == body["clarify"]

    url = f"/api/messages/{body['message_id']}/clarify"
    clicked = await user.client.post(url, json={"option": 1})

    assert clicked.status_code == 200, clicked.text
    done = clicked.json()
    assert (done["intent"], done["reply"]) == ("ask", None)
    assert done["answer"]["kind"] == "no_answer" and done["clarify"]["resolved"] is True
    [restored] = (await user.client.get("/api/messages")).json()["messages"]
    assert restored["clarify"]["resolved"] is True and restored["answer"] == done["answer"]
    usage = (await user.client.get("/api/usage")).json()
    assert (usage["entry"]["used"], usage["ask"]["used"]) == (0, 1)
    again = await user.client.post(url, json={"option": 0})
    assert (again.status_code, again.json()["error"]) == (409, "already_resolved")


async def test_clicking_record_extracts_the_original_words_in_the_background(
    register: Register, llm: LLMScript
) -> None:
    unsure(llm)
    sc.laozhang_promoted(llm, UNSURE, "小蒋")  # whatever the model extracts from it
    user = await register()
    body = await send(user, UNSURE)

    clicked = await user.client.post(
        f"/api/messages/{body['message_id']}/clarify", json={"option": 0}
    )

    assert clicked.status_code == 200, clicked.text
    entry = clicked.json()["entry"]
    assert entry["text"] == UNSURE and entry["draft"]["status"] == "extracting"
    draft = (await user.client.get(f"/api/drafts/{entry['draft']['id']}")).json()
    assert draft["status"] == "pending"


async def test_clarify_errors(register: Register, llm: LLMScript, app: FastAPI) -> None:
    unsure(llm)
    llm.intent("早上好呀", "chitchat", confidence=0.99, reply="早！")
    user = await register()
    plain = await send(user, "早上好呀")
    body = await send(user, UNSURE)
    url = f"/api/messages/{body['message_id']}/clarify"

    out_of_range = await user.client.post(url, json={"option": 5})
    negative = await user.client.post(url, json={"option": -1})
    extra = await user.client.post(url, json={"option": 0, "as": "ask"})
    none = await user.client.post(
        f"/api/messages/{plain['message_id']}/clarify", json={"option": 0}
    )
    unknown = await user.client.post(
        "/api/messages/00000000-0000-0000-0000-000000000000/clarify", json={"option": 0}
    )
    assert (out_of_range.status_code, out_of_range.json()["error"]) == (422, "no_such_option")
    assert negative.status_code == 422 and extra.status_code == 422
    assert (none.status_code, none.json()["error"]) == (409, "no_clarification")
    assert (unknown.status_code, unknown.json()["error"]) == (404, "not_found")

    app.state.infra.settings = app.state.infra.settings.model_copy(update={"daily_ask_limit": 0})
    quota = await user.client.post(url, json={"option": 1})
    assert (quota.status_code, quota.json()["error"]) == (429, "quota_exceeded")
    [_, kept] = (await user.client.get("/api/messages")).json()["messages"]
    assert kept["clarify"]["resolved"] is False


async def test_a_typed_answer_points_at_the_message_it_answers(
    register: Register, llm: LLMScript
) -> None:
    unsure(llm)
    reply = "记一下吧，她失恋了"
    llm.intent_after(
        UNSURE, UNSURE_ASKED, reply, "record", answers=True, record_text="小蒋最近失恋了，不太开心"
    )
    sc.laozhang_promoted(llm, "小蒋最近失恋了，不太开心", "小蒋")
    user = await register()
    original = await send(user, UNSURE)

    answer = await send(user, reply)

    assert answer["clarification_of"] == original["message_id"] and answer["clarify"] is None
    assert answer["entry"]["text"] == "小蒋最近失恋了，不太开心"
    first, second = (await user.client.get("/api/messages")).json()["messages"]
    assert first["clarify"]["resolved"] is True
    assert second["clarification_of"] == original["message_id"]
    assert second["entry"]["draft"]["status"] == "pending"
