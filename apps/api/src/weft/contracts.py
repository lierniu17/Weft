"""Export JSON Schema contracts for the frontend: ``uv run python -m weft.contracts``.

The API owns every contract the web app consumes; apps/web/scripts/contracts.ts turns
these files into TypeScript (``pnpm contracts``).
"""

from __future__ import annotations

import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

from weft.domain.answer import answer_json_schema
from weft.domain.draft import draft_json_schema
from weft.domain.taxonomy_contract import taxonomy_json_schema
from weft.settings import API_DIR

CONTRACTS_DIR = API_DIR / "contracts"

CONTRACTS: dict[str, Callable[[], dict[str, Any]]] = {
    "answer.schema.json": answer_json_schema,
    "draft.schema.json": draft_json_schema,
    "taxonomy.schema.json": taxonomy_json_schema,
}


def write_contracts(directory: Path = CONTRACTS_DIR) -> list[Path]:
    directory.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    for name, build in CONTRACTS.items():
        path = directory / name
        text = json.dumps(build(), ensure_ascii=False, indent=2) + "\n"
        path.write_text(text, encoding="utf-8", newline="\n")
        written.append(path)
    return written


if __name__ == "__main__":
    for written in write_contracts():
        print(f"wrote {written}")
