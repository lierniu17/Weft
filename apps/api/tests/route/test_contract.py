"""HTTP contract: every route is documented with its body schemas; errors share one shape."""

from __future__ import annotations

import httpx
import pytest
from fastapi import FastAPI

from tests.route.conftest import Register
from weft.contracts import CONTRACTS

pytestmark = pytest.mark.route


async def test_every_route_documents_its_success_response(app: FastAPI) -> None:
    spec = app.openapi()
    for path, operations in spec["paths"].items():
        for method, op in operations.items():
            ok = [code for code in op["responses"] if code.startswith("2")]
            assert ok, (method, path)
            if ok != ["204"]:
                content = op["responses"][ok[0]].get("content", {})
                assert "application/json" in content, (method, path)
                assert content["application/json"].get("schema"), (method, path)


async def test_draft_bodies_use_the_published_draft_contract(app: FastAPI) -> None:
    schemas = app.openapi()["components"]["schemas"]
    published = CONTRACTS["draft.schema.json"]()
    assert schemas["UpdateDraftRequest"]["properties"]["content"] == {
        "$ref": "#/components/schemas/Draft"
    }
    assert set(schemas["Draft"]["properties"]) == set(published["properties"])
    for name in ("DraftPerson", "DraftFact", "DraftRelationship", "DraftProfileItem"):
        assert set(schemas[name]["properties"]) == set(published["$defs"][name]["properties"])


async def test_errors_have_an_error_code_and_a_message(
    anonymous: httpx.AsyncClient, register: Register
) -> None:
    user = await register()
    responses = [
        await anonymous.get("/api/entries"),  # 401
        await user.client.get("/api/drafts/00000000-0000-0000-0000-000000000000"),  # 404
        await user.client.post("/api/entries", json={}),  # 422
    ]
    for response in responses:
        body = response.json()
        assert isinstance(body["error"], str) and isinstance(body["message"], str), body
