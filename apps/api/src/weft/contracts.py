"""Export JSON Schema contracts for the frontend: ``uv run python -m weft.contracts``."""

from __future__ import annotations

import json
from pathlib import Path

from weft.domain.draft import draft_json_schema
from weft.settings import API_DIR

CONTRACTS_DIR = API_DIR / "contracts"


def write_contracts(directory: Path = CONTRACTS_DIR) -> list[Path]:
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / "draft.schema.json"
    path.write_text(
        json.dumps(draft_json_schema(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return [path]


if __name__ == "__main__":
    for written in write_contracts():
        print(f"wrote {written}")
