"""Published JSON Schema contracts (apps/api/contracts/*.schema.json) never drift from the code.

Regenerate with: ``uv run python -m weft.contracts``
"""

import json
from pathlib import Path

import pytest

from weft.contracts import CONTRACTS, CONTRACTS_DIR, write_contracts

pytestmark = pytest.mark.unit

NAMES = ["answer.schema.json", "draft.schema.json", "taxonomy.schema.json"]


def test_all_three_contracts_are_published() -> None:
    assert sorted(CONTRACTS) == NAMES


@pytest.mark.parametrize("name", NAMES)
def test_committed_contract_is_up_to_date(name: str) -> None:
    path = CONTRACTS_DIR / name
    assert path.exists(), "run `uv run python -m weft.contracts`"
    assert json.loads(path.read_text(encoding="utf-8")) == CONTRACTS[name]()


@pytest.mark.parametrize("name", NAMES)
def test_contract_has_draft_2020_12_header_and_id(name: str) -> None:
    schema = CONTRACTS[name]()
    assert schema["$schema"] == "https://json-schema.org/draft/2020-12/schema"
    assert schema["$id"] == f"https://weft.local/contracts/{name}"


def test_write_contracts_writes_every_file(tmp_path: Path) -> None:
    written = write_contracts(tmp_path)
    assert sorted(p.name for p in written) == NAMES
    for path in written:
        committed = (CONTRACTS_DIR / path.name).read_text(encoding="utf-8")
        # read_text() normalizes CRLF (git autocrlf) to LF
        assert path.read_text(encoding="utf-8") == committed


@pytest.mark.parametrize("name", NAMES)
def test_contracts_contain_no_prefix_items(name: str) -> None:
    """json-schema-to-typescript cannot read prefixItems; tuples become [unknown, unknown]."""
    assert "prefixItems" not in json.dumps(CONTRACTS[name]())
