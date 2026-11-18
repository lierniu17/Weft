"""Configuration, read from the environment and ``apps/api/.env`` (see ``.env.example``)."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from weft.llm.replay import ReplayMode

API_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=API_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- deployment -------------------------------------------------------
    # Baked into the image at build time (git short SHA); reported by /api/health.
    # Empty means "not a built image": /api/health then reports the package version.
    app_version: str = ""

    # --- databases --------------------------------------------------------
    database_url: str = "postgresql+asyncpg://weft:weft@localhost:5432/weft"
    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: SecretStr = SecretStr("weft-dev-password")

    # --- LLM providers (ADR-0002, OpenAI-compatible) -----------------------
    deepseek_api_key: SecretStr = SecretStr("")
    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_chat_model: str = "deepseek-chat"
    dashscope_api_key: SecretStr = SecretStr("")
    dashscope_base_url: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    dashscope_embedding_model: str = "text-embedding-v4"
    embedding_dimensions: int = 1024
    llm_timeout_seconds: float = 60.0
    llm_replay_mode: ReplayMode = ReplayMode.OFF
    llm_fixtures_dir: Path = API_DIR / "tests" / "fixtures" / "llm"

    # --- usage limits (AC-40) --------------------------------------------
    daily_entry_limit: int = 50
    daily_ask_limit: int = 100

    # --- intent recognition (intent-routing spec AC-2) ---------------------
    # Below this confidence a message is 无关 (chitchat), flagged 拿不准.
    intent_confidence_threshold: float = 0.7
    # 反问 (intent-clarify AC-4): how long a 拿不准 message takes a typed answer.
    clarify_answer_window_minutes: int = 30

    # --- sessions ---------------------------------------------------------
    session_secret: SecretStr = SecretStr("dev-only-change-me")
    session_cookie_name: str = "weft_session"
    session_max_age_days: int = 30
    session_cookie_secure: bool = False

    # --- Graphiti (ADR-0001) ----------------------------------------------
    graphiti_telemetry_enabled: bool = False

    @field_validator("graphiti_telemetry_enabled")
    @classmethod
    def _telemetry_stays_off(cls, value: bool) -> bool:
        if value:
            raise ValueError("Graphiti telemetry must stay disabled (ADR-0001)")
        return value

    @field_validator("intent_confidence_threshold")
    @classmethod
    def _a_probability(cls, value: float) -> float:
        if not 0.0 <= value <= 1.0:
            raise ValueError("the intent confidence threshold must be within 0..1")
        return value

    @field_validator("daily_entry_limit", "daily_ask_limit", "clarify_answer_window_minutes")
    @classmethod
    def _non_negative(cls, value: int) -> int:
        if value < 0:
            raise ValueError("limits must be non-negative")
        return value


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
