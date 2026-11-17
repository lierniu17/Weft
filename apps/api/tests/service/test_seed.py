"""The seed graph's Entries carry the confirmed Draft that would have produced them.

The chat's draft card reads 「✓ 已入图谱 · N 条信息」 from the confirmed Draft's content, so a
seed Entry whose Draft is empty shows 「0 条信息」 even though the graph has its facts.
"""

from __future__ import annotations

import uuid

import pytest

from tests.support.seeded import seeded_user
from weft.domain.draft import DraftStatus, PersonMatch
from weft.domain.tenancy import tenant_scope
from weft.infra import Infra
from weft.repositories.entries import DraftRepository
from weft.services import entries
from weft.services.drafts import SELF_ID
from weft.services.results import Ok
from weft.services.seed import ENTRIES, SELF

pytestmark = pytest.mark.service


async def test_seed_entries_store_the_confirmed_draft_that_wrote_them(infra: Infra) -> None:
    seeded = await seeded_user(infra)
    with tenant_scope(seeded.user.tenant):
        async with infra.sql() as session:
            drafts = DraftRepository(session, seeded.user.tenant)
            records = [await drafts.get_by_entry(uuid.UUID(e)) for e in seeded.entries]

    assert len(records) == len(ENTRIES)
    for record, entry in zip(records, ENTRIES, strict=True):
        assert record is not None
        assert record.status is DraftStatus.CONFIRMED
        content = record.content
        assert content is not None
        items = (
            len(content.facts)
            + len(content.relationships)
            + len(content.feelings)
            + len(content.profile)
        )
        # One draft item per fact, relationship and feeling the Entry wrote; never 0.
        assert items == len(entry.facts) + len(entry.relationships) + len(entry.feelings)
        assert items > 0, entry.text

        # Persons first named in this Entry were new; everyone else was matched to the
        # person the graph already had (Self as 「self」).
        new_names = {name for name, _ in entry.persons}
        for p in content.persons:
            if p.match is PersonMatch.NEW:
                assert p.mention in new_names
                assert p.person_id is None
            else:
                assert p.match is PersonMatch.MATCHED
                if p.mention == SELF:
                    assert p.person_id == SELF_ID
                else:
                    assert p.person_id == seeded.ids[p.mention]
        assert {p.mention for p in content.persons if p.match is PersonMatch.NEW} == new_names


async def test_seed_draft_reads_like_the_entry(infra: Infra) -> None:
    """老张's first Entry: new 张伟 (mentioned as 老张 later), Self matched, 6 items."""
    seeded = await seeded_user(infra)
    index = next(i for i, e in enumerate(ENTRIES) if e.text.startswith("2018 年入职字节跳动"))
    with tenant_scope(seeded.user.tenant):
        async with infra.sql() as session:
            record = await DraftRepository(session, seeded.user.tenant).get_by_entry(
                uuid.UUID(seeded.entries[index])
            )
    assert record is not None and record.content is not None
    content = record.content
    assert [(p.mention, p.match) for p in content.persons] == [
        ("张伟", PersonMatch.NEW),
        (SELF, PersonMatch.MATCHED),
    ]
    assert [(f.subject, f.predicate, f.object) for f in content.facts] == [
        (SELF, "WORKS_AT", "字节跳动"),
        ("张伟", "WORKS_AT", "字节跳动"),
        ("张伟", "HAS_TRAIT", "急性子"),
        ("张伟", "OPINION", "靠谱"),
    ]
    assert [r.pair for r in content.relationships] == [(SELF, "张伟")]
    assert [(f.from_, f.to, f.dimension) for f in content.feelings] == [
        (SELF, "张伟", "closeness"),
        (SELF, "张伟", "trust"),
    ]


async def test_each_seed_alias_is_learned_by_the_entry_that_introduced_it(infra: Infra) -> None:
    seeded = await seeded_user(infra)
    with tenant_scope(seeded.user.tenant):
        details = [await entries.get_entry(infra, uuid.UUID(e)) for e in seeded.entries]

    for result, entry in zip(details, ENTRIES, strict=True):
        assert isinstance(result, Ok)
        expected = [
            (alias, seeded.ids[name], name) for name, aliases in entry.persons for alias in aliases
        ]
        learned = [(a.alias, a.person_id, a.name) for a in result.value.learned_aliases]
        assert learned == expected, entry.text
    assert any(e.persons and any(a for _, a in e.persons) for e in ENTRIES)
