"""Chinese labels for every fact kind; no internal name reaches the user (style refresh AC-9)."""

from __future__ import annotations

import pytest

from weft.domain.graph_write import (
    FACT_LABELS,
    PREDICATE_LABELS,
    fact_label,
    fact_sentence,
    humanize,
)

pytestmark = pytest.mark.unit


def test_every_predicate_and_the_event_between_two_persons_has_a_chinese_label() -> None:
    assert set(PREDICATE_LABELS) < set(FACT_LABELS)
    assert fact_label("RELATED_EVENT") == "两人之间的事"
    assert fact_label("LIKES") == "喜欢"
    assert all(not any(c.isascii() and c.isalpha() for c in v) for v in FACT_LABELS.values())


def test_an_unknown_predicate_is_never_shown_as_its_internal_name() -> None:
    assert fact_label("SOMETHING_NEW") == "信息"
    assert "SOMETHING_NEW" not in fact_sentence("老张", "SOMETHING_NEW", "钓鱼")


def test_an_event_between_two_persons_reads_as_a_sentence() -> None:
    assert fact_sentence("老张", "RELATED_EVENT", "小李") == "老张和小李之间的事"


def test_generated_text_gets_chinese_labels_even_next_to_chinese_characters() -> None:
    assert (
        humanize("张伟：据说RELATED_EVENT小李；LIKES 钓鱼。")
        == "张伟：据说两人之间的事小李；喜欢 钓鱼。"
    )
    # only whole internal names: ordinary latin words stay
    assert humanize("他在 OPINIONS 公司，用 LIKES_X 工具") == "他在 OPINIONS 公司，用 LIKES_X 工具"
