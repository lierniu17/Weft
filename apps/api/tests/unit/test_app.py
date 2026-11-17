"""App skeleton: settings, Graphiti telemetry off, health route, table definitions."""

import os
import re
import subprocess
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from weft import __version__
from weft.llm import ReplayMode
from weft.settings import Settings

pytestmark = pytest.mark.unit

API_DIR = Path(__file__).resolve().parents[2]


def test_settings_defaults_match_spec() -> None:
    s = Settings(_env_file=None)
    assert s.daily_entry_limit == 50
    assert s.daily_ask_limit == 100
    assert s.llm_replay_mode is ReplayMode.OFF
    assert s.dashscope_embedding_model == "text-embedding-v4"
    assert s.graphiti_telemetry_enabled is False


def test_settings_read_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DAILY_ENTRY_LIMIT", "2")
    monkeypatch.setenv("LLM_REPLAY_MODE", "replay")
    s = Settings(_env_file=None)
    assert s.daily_entry_limit == 2
    assert s.llm_replay_mode is ReplayMode.REPLAY


def test_settings_refuse_graphiti_telemetry() -> None:
    with pytest.raises(ValidationError):
        Settings(_env_file=None, graphiti_telemetry_enabled=True)


def test_env_example_lists_every_setting() -> None:
    text = (API_DIR / ".env.example").read_text(encoding="utf-8")
    keys = set(re.findall(r"^([A-Z][A-Z0-9_]*)=", text, flags=re.MULTILINE))
    expected = {name.upper() for name in Settings.model_fields}
    assert expected <= keys, f"missing from .env.example: {sorted(expected - keys)}"


def test_graphiti_telemetry_is_disabled_even_if_env_says_otherwise() -> None:
    """ADR-0001: importing weft forces Graphiti's anonymous telemetry off."""
    code = (
        "import weft, graphiti_core.telemetry.telemetry as t, os;"
        "print(os.environ['GRAPHITI_TELEMETRY_ENABLED'], t.is_telemetry_enabled())"
    )
    env = {**os.environ, "GRAPHITI_TELEMETRY_ENABLED": "true"}
    out = subprocess.run(
        [sys.executable, "-c", code], env=env, capture_output=True, text=True, check=True
    )
    assert out.stdout.split() == ["false", "False"]


def test_health_route_returns_status_and_version() -> None:
    from weft.main import create_app

    client = TestClient(create_app(Settings(_env_file=None)))
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": __version__}


def test_health_reports_the_version_baked_into_the_image() -> None:
    """Deploys are verified by /api/health showing the git SHA the image was built from."""
    from weft.main import create_app

    client = TestClient(create_app(Settings(_env_file=None, app_version="7e2772f")))
    assert client.get("/api/health").json() == {"status": "ok", "version": "7e2772f"}


def test_every_business_table_carries_user_id() -> None:
    """Spec: all Postgres business tables carry the user id (tenant isolation)."""
    from weft.models.tables import Base

    tables = Base.metadata.tables
    assert {
        "users",
        "invite_codes",
        "sessions",
        "entries",
        "drafts",
        "custom_subtypes",
        "usage_counters",
    } <= set(tables)
    for name, table in tables.items():
        if name in {"users", "invite_codes"}:
            continue
        assert "user_id" in table.c, f"{name} lacks user_id"


def test_the_test_process_never_sees_the_local_env_file() -> None:
    # graphiti_core calls load_dotenv() on import, which would copy apps/api/.env (with the
    # developer's real API keys) into os.environ; tests/conftest.py scrubs it again.
    import graphiti_core.graphiti  # noqa: F401
    from dotenv import dotenv_values

    from tests import PRE_IMPORT_ENV

    leaked = [
        k for k in dotenv_values(API_DIR / ".env") if k in os.environ and k not in PRE_IMPORT_ENV
    ]
    assert leaked == []
    assert Settings.model_config.get("env_file") is None
    keyless = Settings()
    assert keyless.deepseek_api_key.get_secret_value() == os.environ.get("DEEPSEEK_API_KEY", "")
    assert keyless.dashscope_api_key.get_secret_value() == os.environ.get("DASHSCOPE_API_KEY", "")
