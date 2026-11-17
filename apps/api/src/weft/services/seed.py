"""Seed graph (种子图谱) for e2e BOT-5 / BOT-9, the Q&A tests and the Q&A quality eval.

About 30 persons around Self with every relationship category, written the way the app
writes a confirmed Draft: each seed Entry is stored in Postgres (with a confirmed Draft)
and applied to the graph as one ``GraphWrite`` whose episode is that Entry, so every fact,
relationship and feeling cites a real Entry.

It contains what BOT-5 / BOT-9 rely on:

* 我 → 老张 → 小王: 老张 introduced 小王 to me (``introduced_by``);
* 老张 and 小李 were 大学室友, fell out over borrowed money in 2026-09 — told by 小王
  (可信度 转述), relationship status 紧张;
* five persons 喜欢露营 (one of them only by hearsay);
* 小李 moved from 字节跳动 to 阿里巴巴 (history, AC-14); 我的评价 of 老张 (AC-23);
* persons I only know through others (赵磊 via 周涛, 刘洋 via 小王) for path questions.

Usage: ``uv run python -m weft.cli seed --user <login>`` (refuses a non-empty graph).
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime

from weft.domain.confidence import Confidence
from weft.domain.dates import PartialDate
from weft.domain.draft import Draft, DraftStatus
from weft.domain.graph_write import (
    OPINION,
    PREDICATE_TARGETS,
    AliasAdd,
    EpisodeWrite,
    FactInvalidated,
    GraphWrite,
    NewFact,
    NewFeeling,
    NewPerson,
    RelationshipUpsert,
    fact_sentence,
)
from weft.domain.taxonomy import Category, RelationshipType
from weft.infra import Infra
from weft.repositories.entries import DraftRepository, EntryRepository
from weft.services import embeddings
from weft.services._uow import graph, tenant
from weft.services.results import Err, Ok, Result

SELF = "我"
W, S, H = Confidence.WITNESSED, Confidence.SELF_TOLD, Confidence.HEARSAY
KIN, LOVE, SOCIAL, INTEREST, HOSTILE = (
    Category.KIN,
    Category.ROMANTIC,
    Category.SOCIAL,
    Category.INTEREST,
    Category.HOSTILE,
)


@dataclass(frozen=True)
class F:
    """A fact; ``obj`` is another person's name when ``predicate`` has no entity target."""

    subject: str
    predicate: str
    obj: str
    confidence: Confidence
    valid_at: str | None = None
    text: str | None = None  # the fact sentence, when the template does not read well
    until: str | None = None  # already over when written (e.g. a former employer)


@dataclass(frozen=True)
class R:
    a: str
    b: str
    category: Category
    subtype: str
    original: str
    confidence: Confidence
    met_at: str | None = None
    origin: str | None = None
    introduced_by: str | None = None
    status: str | None = "active"


@dataclass(frozen=True)
class E:
    """A feeling: ``src`` feels ``level`` about ``dst`` on ``dimension``."""

    src: str
    dst: str
    dimension: str
    level: str
    confidence: Confidence = W


@dataclass(frozen=True)
class SeedEntry:
    text: str
    occurred: str
    persons: tuple[tuple[str, tuple[str, ...]], ...] = ()  # (name, aliases) first seen here
    facts: tuple[F, ...] = ()
    relationships: tuple[R, ...] = ()
    feelings: tuple[E, ...] = ()
    ends: tuple[tuple[str, str, str, str], ...] = ()  # (subject, predicate, object, until)


ENTRIES: tuple[SeedEntry, ...] = (
    SeedEntry(
        "2015 年上大学，和李明（小李）、陈静、周涛是同班同学，都在浙江大学。",
        "2015",
        persons=(("李明", ("小李",)), ("陈静", ()), ("周涛", ())),
        facts=(
            F(SELF, "STUDIED_AT", "浙江大学", W, "2015"),
            F("小李", "STUDIED_AT", "浙江大学", W, "2015"),
            F("陈静", "STUDIED_AT", "浙江大学", W, "2015"),
            F("周涛", "STUDIED_AT", "浙江大学", W, "2015"),
        ),
        relationships=(
            R(SELF, "小李", SOCIAL, "同学", "大学同学", W, "2015", "浙江大学同班"),
            R(SELF, "陈静", SOCIAL, "同学", "大学同学", W, "2015", "浙江大学同班"),
            R(SELF, "周涛", SOCIAL, "同学", "大学同学", W, "2015", "浙江大学同班"),
        ),
        feelings=(
            E(SELF, "小李", "closeness", "close"),
            E(SELF, "陈静", "closeness", "familiar"),
            E(SELF, "周涛", "closeness", "familiar"),
        ),
    ),
    SeedEntry(
        "当兵时的战友唐亮退伍后在成都开了火锅店。",
        "2016-08",
        persons=(("唐亮", ()),),
        facts=(F("唐亮", "LIVES_IN", "成都", W), F("唐亮", "EXPERIENCED", "开火锅店", S, "2016")),
        relationships=(
            R(SELF, "唐亮", SOCIAL, "战友", "战友", W, "2012", "当兵", status="distant"),
        ),
        feelings=(E(SELF, "唐亮", "closeness", "casual"),),
    ),
    SeedEntry(
        "前女友苏珊去了上海，已经很久没联系了。",
        "2017-06",
        persons=(("苏珊", ()),),
        facts=(F("苏珊", "LIVES_IN", "上海", H),),
        relationships=(R(SELF, "苏珊", LOVE, "前任", "前女友", W, "2014", status="estranged"),),
        feelings=(E(SELF, "苏珊", "closeness", "distant"),),
    ),
    SeedEntry(
        "2018 年入职字节跳动，认识了同组的张伟，大家都叫他老张。他是个急性子，但做事很靠谱。",
        "2018-03-12",
        persons=(("张伟", ("老张",)),),
        facts=(
            F(SELF, "WORKS_AT", "字节跳动", W, "2018-03"),
            F("老张", "WORKS_AT", "字节跳动", W, "2018-03"),
            F("老张", "HAS_TRAIT", "急性子", W),
            F("老张", OPINION, "靠谱", W),
        ),
        relationships=(R(SELF, "老张", SOCIAL, "同事", "同组同事", W, "2018-03", "字节跳动同组"),),
        feelings=(E(SELF, "老张", "closeness", "close"), E(SELF, "老张", "trust", "high")),
    ),
    SeedEntry(
        "以前的竞争对手马超抢过我们好几个单子，听说他现在在拼多多。",
        "2019-08",
        persons=(("马超", ()),),
        facts=(F("马超", "WORKS_AT", "拼多多", H),),
        relationships=(
            R(SELF, "马超", HOSTILE, "竞争", "竞争对手", W, "2017", "抢客户", status="distant"),
        ),
        feelings=(E(SELF, "马超", "affinity", "dislike"), E(SELF, "马超", "closeness", "distant")),
    ),
    SeedEntry(
        "过年回家，爸爸陈建国和妈妈王秀英身体都挺好，妹妹陈晓在北京四中当老师。",
        "2020-01-25",
        persons=(("陈建国", ("爸爸",)), ("王秀英", ("妈妈",)), ("陈晓", ("妹妹",))),
        facts=(F("陈晓", "WORKS_AT", "北京四中", W),),
        relationships=(
            R("陈建国", SELF, KIN, "父母", "爸爸", W),
            R("王秀英", SELF, KIN, "父母", "妈妈", W),
            R("陈建国", "王秀英", KIN, "配偶", "夫妻", W),
            R("陈晓", SELF, KIN, "兄弟姐妹", "妹妹", W),
        ),
        feelings=(
            E(SELF, "陈建国", "closeness", "intimate"),
            E(SELF, "王秀英", "closeness", "intimate"),
            E(SELF, "陈晓", "closeness", "close"),
        ),
    ),
    SeedEntry(
        "部门聚餐，同组的吴昊、郭佳、钱多多都在，大家都在字节跳动好几年了。",
        "2020-12-18",
        persons=(("吴昊", ()), ("郭佳", ()), ("钱多多", ())),
        facts=(
            F("吴昊", "WORKS_AT", "字节跳动", W, "2019"),
            F("郭佳", "WORKS_AT", "字节跳动", W, "2020"),
            F("钱多多", "WORKS_AT", "字节跳动", W, "2020"),
        ),
        relationships=(
            R(SELF, "吴昊", SOCIAL, "同事", "同事", W, "2019", "字节跳动"),
            R(SELF, "郭佳", SOCIAL, "同事", "同事", W, "2020", "字节跳动"),
            R(SELF, "钱多多", SOCIAL, "同事", "同事", W, "2020", "字节跳动"),
            R("老张", "吴昊", SOCIAL, "同事", "同事", W, "2019", "字节跳动"),
        ),
        feelings=(
            E(SELF, "吴昊", "closeness", "familiar"),
            E(SELF, "郭佳", "closeness", "familiar"),
            E(SELF, "钱多多", "closeness", "casual"),
        ),
    ),
    SeedEntry(
        "听周涛说他在华为的同事赵磊做硬件，人很好，有机会可以认识一下。",
        "2021-04-10",
        persons=(("赵磊", ()),),
        facts=(F("赵磊", "WORKS_AT", "华为", H), F("周涛", "WORKS_AT", "华为", S)),
        relationships=(R("周涛", "赵磊", SOCIAL, "同事", "同事", H, origin="华为"),),
    ),
    SeedEntry(
        "和刘婷结婚了，我们是 2019 年在朋友聚会上认识的。她在中信银行工作。",
        "2022-10-01",
        persons=(("刘婷", ("老婆",)),),
        facts=(F("刘婷", "WORKS_AT", "中信银行", W),),
        relationships=(R("刘婷", SELF, KIN, "配偶", "老婆", W, "2019", "朋友聚会"),),
        feelings=(E(SELF, "刘婷", "closeness", "intimate"), E(SELF, "刘婷", "trust", "high")),
    ),
    SeedEntry(
        "老婆的闺蜜杜鹃来家里吃饭，她是幼儿园老师。",
        "2022-11-05",
        persons=(("杜鹃", ()),),
        facts=(F("杜鹃", "WORKS_AT", "幼儿园", S),),
        relationships=(
            R("刘婷", "杜鹃", SOCIAL, "朋友", "闺蜜", W),
            R(SELF, "杜鹃", SOCIAL, "朋友", "老婆的闺蜜", W, "2022-11", introduced_by="刘婷"),
        ),
        feelings=(E(SELF, "杜鹃", "closeness", "casual"),),
    ),
    SeedEntry(
        "小李跟我说他去字节跳动上班了。",
        "2023-02-20",
        facts=(F("小李", "WORKS_AT", "字节跳动", S, "2023-02"),),
    ),
    SeedEntry(
        "老乡会上认识了老家的冯强，他在中石化工作。",
        "2023-11-11",
        persons=(("冯强", ()),),
        facts=(F("冯强", "WORKS_AT", "中石化", S),),
        relationships=(R(SELF, "冯强", SOCIAL, "老乡", "老乡", W, "2023-11", "老乡会"),),
        feelings=(E(SELF, "冯强", "closeness", "casual"),),
    ),
    SeedEntry(
        "网友韩梅梅，一起打游戏两年了，还没见过面。",
        "2024-03-02",
        persons=(("韩梅梅", ()),),
        facts=(F("韩梅梅", "LIKES", "打游戏", W),),
        relationships=(R(SELF, "韩梅梅", SOCIAL, "网友", "网友", W, "2022", "打游戏"),),
        feelings=(E(SELF, "韩梅梅", "closeness", "casual"),),
    ),
    SeedEntry(
        "老张介绍我认识了他的老朋友王浩，大家叫他小王。小王说他在腾讯做产品，特别喜欢露营。",
        "2024-05-01",
        persons=(("王浩", ("小王",)),),
        facts=(F("小王", "WORKS_AT", "腾讯", S), F("小王", "LIKES", "露营", S)),
        relationships=(
            R(SELF, "小王", SOCIAL, "朋友", "朋友", W, "2024-05", "老张介绍", introduced_by="老张"),
            R("老张", "小王", SOCIAL, "朋友", "老朋友", S),
        ),
        feelings=(E(SELF, "小王", "closeness", "familiar"),),
    ),
    SeedEntry(
        "和郑凯合伙开了工作室，他负责技术，之前在百度干了五年。",
        "2025-03-01",
        persons=(("郑凯", ()),),
        facts=(F("郑凯", "WORKS_AT", "百度", S, "2020", until="2025-03"),),
        relationships=(R(SELF, "郑凯", INTEREST, "合伙人", "合伙人", W, "2024", "朋友介绍"),),
        feelings=(E(SELF, "郑凯", "closeness", "close"), E(SELF, "郑凯", "trust", "high")),
    ),
    SeedEntry(
        "陈静说她现在在杭州的阿里巴巴工作，周末常去露营。",
        "2025-06-08",
        facts=(
            F("陈静", "WORKS_AT", "阿里巴巴", S, "2025"),
            F("陈静", "LIVES_IN", "杭州", S),
            F("陈静", "LIKES", "露营", S),
        ),
    ),
    SeedEntry(
        "在健身房办了卡，教练高峰人很热情。",
        "2025-09-14",
        persons=(("高峰", ()),),
        facts=(F("高峰", "HAS_TRAIT", "热情", W),),
        relationships=(R(SELF, "高峰", SOCIAL, "其他", "健身教练", W, "2025-09", "健身房"),),
        feelings=(E(SELF, "高峰", "closeness", "casual"),),
    ),
    SeedEntry(
        "部门里郭佳刚升职了，请大家喝了奶茶。",
        "2026-06-20",
        facts=(F("郭佳", "EXPERIENCED", "升职", W, "2026-06"),),
    ),
    SeedEntry(
        "大学导师罗建华教授这个月退休了。",
        "2026-07-03",
        persons=(("罗建华", ("罗教授",)),),
        facts=(F("罗建华", "EXPERIENCED", "退休", W, "2026-07"),),
        relationships=(R(SELF, "罗建华", SOCIAL, "师生", "大学导师", W, "2015", "浙江大学"),),
        feelings=(E(SELF, "罗建华", "closeness", "familiar"),),
    ),
    SeedEntry(
        "周末去露营认识了孙悦，她是摄影师，也很喜欢露营和徒步。",
        "2026-07-12",
        persons=(("孙悦", ()),),
        facts=(F("孙悦", "LIKES", "露营", W), F("孙悦", "LIKES", "徒步", W)),
        relationships=(R(SELF, "孙悦", SOCIAL, "朋友", "露营认识的朋友", W, "2026-07", "露营"),),
        feelings=(E(SELF, "孙悦", "closeness", "familiar"),),
    ),
    SeedEntry(
        "小王说他们组的刘洋也喜欢露营，之前在美团。",
        "2026-08-02",
        persons=(("刘洋", ()),),
        facts=(F("刘洋", "WORKS_AT", "腾讯", H), F("刘洋", "LIKES", "露营", H)),
        relationships=(R("小王", "刘洋", SOCIAL, "同事", "同组同事", H, origin="腾讯"),),
    ),
    SeedEntry(
        "新客户何伟，美团的采购负责人，第一次见面聊得不错。",
        "2026-09-05",
        persons=(("何伟", ()),),
        facts=(F("何伟", "WORKS_AT", "美团", S),),
        relationships=(R(SELF, "何伟", INTEREST, "客户", "新客户", W, "2026-09", "工作对接"),),
        feelings=(E(SELF, "何伟", "closeness", "casual"), E(SELF, "何伟", "trust", "medium")),
    ),
    SeedEntry(
        "听小王说，老张和小李以前是大学室友，今年九月因为借钱的事闹掰了。",
        "2026-10-08",
        facts=(
            F(
                "老张",
                "RELATED_EVENT",
                "小李",
                H,
                "2026-09",
                text="老张和小李因为借钱闹掰了",
            ),
        ),
        relationships=(
            R("老张", "小李", SOCIAL, "室友", "大学室友", H, origin="大学", status="tense"),
        ),
        feelings=(E("小李", "老张", "trust", "low", H),),
    ),
    SeedEntry(
        "搬家后认识了邻居林芳，她在市一院当护士，也喜欢露营。",
        "2026-10-15",
        persons=(("林芳", ()),),
        facts=(F("林芳", "WORKS_AT", "市一院", S), F("林芳", "LIKES", "露营", S)),
        relationships=(R(SELF, "林芳", SOCIAL, "邻居", "邻居", W, "2026-10", "搬家"),),
        feelings=(E(SELF, "林芳", "closeness", "familiar"),),
    ),
    SeedEntry(
        "小李跟我说他上个月跳槽去了阿里巴巴，在那边的新同事宋佳很会做饭。",
        "2026-10-20",
        persons=(("宋佳", ()),),
        facts=(
            F("小李", "WORKS_AT", "阿里巴巴", S, "2026-09"),
            F("宋佳", "WORKS_AT", "阿里巴巴", H),
            F("宋佳", "HAS_TRAIT", "很会做饭", H),
        ),
        relationships=(R("小李", "宋佳", SOCIAL, "同事", "新同事", S, "2026-09", "阿里巴巴"),),
        ends=(("小李", "WORKS_AT", "字节跳动", "2026-09"),),
    ),
    SeedEntry(
        "老张说他老婆黄丽是中学老师，女儿张小雨明年高考。",
        "2026-11-10",
        persons=(("黄丽", ()), ("张小雨", ())),
        facts=(
            F("黄丽", "WORKS_AT", "中学", H),
            F("张小雨", "EXPERIENCED", "高考", H, "2027"),
        ),
        relationships=(
            R("黄丽", "老张", KIN, "配偶", "老婆", S),
            R("老张", "张小雨", KIN, "父母", "女儿", S),
        ),
    ),
)


@dataclass
class Seeded:
    persons: dict[str, str] = field(default_factory=dict)  # name and alias -> person id
    entries: list[str] = field(default_factory=list)  # entry ids, oldest first


class _Builder:
    def __init__(self, self_id: str) -> None:
        self.ids: dict[str, str] = {SELF: self_id}
        self.names: dict[str, str] = {self_id: SELF}
        self.facts: dict[tuple[str, str, str], str] = {}
        self.relationships: dict[frozenset[str], RelationshipUpsert] = {}

    def person(self, mention: str) -> str:
        return self.ids[mention]

    def write(self, entry_id: str, e: SeedEntry, now: datetime) -> GraphWrite:
        occurred = PartialDate.parse(e.occurred)
        w = GraphWrite(episode=EpisodeWrite(entry_id, e.text, occurred, "user", now))
        for name, aliases in e.persons:
            pid = str(uuid.uuid4())
            self.ids[name] = pid
            self.names[pid] = name
            for alias in aliases:
                self.ids[alias] = pid
                w.aliases.append(AliasAdd(pid, alias))
            w.persons.append(NewPerson(pid, name))
        for subject, predicate, obj, until in e.ends:
            key = (self.person(subject), predicate, obj)
            w.invalidations.append(FactInvalidated(self.facts[key], PartialDate.parse(until)))
        for f in e.facts:
            w.facts.append(self._fact(f))
        for r in e.relationships:
            w.relationships.append(self._relationship(r))
        for fe in e.feelings:
            w.feelings.append(
                NewFeeling(
                    str(uuid.uuid4()),
                    self.person(fe.src),
                    self.person(fe.dst),
                    fe.dimension,
                    fe.level,
                    fe.confidence,
                    occurred,
                )
            )
        mentioned = [self.person(n) for n, _ in e.persons]
        mentioned += [self.person(f.subject) for f in e.facts]
        mentioned += [self.person(m) for r in e.relationships for m in (r.a, r.b)]
        w.mentions.extend(dict.fromkeys(mentioned))
        return w

    def _fact(self, f: F) -> NewFact:
        subject = self.person(f.subject)
        name = self.names[subject]
        fid = str(uuid.uuid4())
        valid_at = PartialDate.parse(f.valid_at) if f.valid_at else None
        if f.predicate == OPINION:
            return NewFact(
                fid,
                self.ids[SELF],
                OPINION,
                f.obj,
                fact_sentence(name, OPINION, f.obj),
                f.confidence,
                object_person_id=subject,
                valid_at=valid_at,
                kind="opinion",
            )
        self.facts[(subject, f.predicate, f.obj)] = fid
        target = PREDICATE_TARGETS.get(f.predicate)
        return NewFact(
            fid,
            subject,
            f.predicate,
            f.obj,
            f.text or fact_sentence(name, f.predicate, f.obj),
            f.confidence,
            object_label=target,
            object_person_id=None if target else self.person(f.obj),
            valid_at=valid_at,
            invalid_at=PartialDate.parse(f.until) if f.until else None,
        )

    def _relationship(self, r: R) -> RelationshipUpsert:
        a, b = self.person(r.a), self.person(r.b)
        key = frozenset((a, b))
        new_type = RelationshipType(r.category, r.subtype, r.original)
        old = self.relationships.get(key)
        upsert = RelationshipUpsert(
            id=old.id if old else str(uuid.uuid4()),
            person_a=old.person_a if old else a,
            person_b=old.person_b if old else b,
            types=(*old.types, new_type) if old else (new_type,),
            confidence=r.confidence,
            met_at=PartialDate.parse(r.met_at) if r.met_at else (old.met_at if old else None),
            origin=r.origin or (old.origin if old else None),
            introduced_by_id=self.person(r.introduced_by) if r.introduced_by else None,
            status=r.status,
            exists=old is not None,
        )
        self.relationships[key] = upsert
        return upsert


async def seed_graph(infra: Infra, entries: tuple[SeedEntry, ...] = ENTRIES) -> Result[Seeded]:
    """Write the seed into the session's tenant; refuses a graph that already has persons."""
    scope = tenant()
    g = graph(infra, scope)
    me = await g.get_self()
    assert me is not None, "every account has Self"
    if len(await g.list_persons()) > 1:
        return Err("graph_not_empty", "种子图谱只能写入只有本人的图谱")
    builder = _Builder(me.id)
    seeded = Seeded()
    empty = Draft.model_validate(
        {"persons": [], "facts": [], "relationships": [], "feelings": [], "profile": []}
    )
    # All or nothing: the Entries commit only after the whole graph is written.
    async with infra.sql() as session, session.begin():
        writes: list[GraphWrite] = []
        for e in entries:
            entry = await EntryRepository(session, scope).create(
                text=e.text, occurred=PartialDate.parse(e.occurred), kind="user"
            )
            drafts = DraftRepository(session, scope)
            draft = await drafts.create_extracting(entry.id)
            await drafts.transition(
                draft.id,
                from_statuses=[DraftStatus.EXTRACTING],
                to=DraftStatus.PENDING,
                content=empty,
            )
            await drafts.transition(
                draft.id,
                from_statuses=[DraftStatus.PENDING],
                to=DraftStatus.CONFIRMED,
                now=infra.clock(),
            )
            writes.append(builder.write(str(entry.id), e, infra.clock()))
            seeded.entries.append(str(entry.id))
        await g.apply_all([await embeddings.attach(infra, w) for w in writes])
    seeded.persons = dict(builder.ids)
    return Ok(seeded)


__all__ = ["ENTRIES", "SELF", "SeedEntry", "Seeded", "seed_graph"]
