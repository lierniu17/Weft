"""The Q&A tools as the model sees them: JSON schemas, handles and evidence (AC-36, AC-39).

``AskSession`` sits between DeepSeek's tool calls and ``weft.services.query_tools``:

* the model refers to persons by handle (``P1`` …) or by name; evidence it can cite is
  ``E1`` … . Real ids — persons, Entries, the tenant — never reach the model, which keeps
  transcripts deterministic (replayable) and leaves nothing to forge;
* arguments are validated against fixed schemas; a tenant argument (``group_id`` …) is
  refused outright, whatever the model sends;
* every fact / relationship / feeling it shows is registered as ``Evidence`` with the
  Entries behind it and the persons it concerns, which ``weft.domain.answering`` turns
  into Citations;
* every name it looks up is remembered, so the question's subjects can be checked: a
  name from the question that resolves to nobody makes the answer no_answer (AC-38).
"""

from __future__ import annotations

import json
from collections.abc import Awaitable, Callable, Iterable
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from weft.domain.answer import PersonRef
from weft.domain.answering import Evidence, FinalAnswer, Source, Subjects
from weft.domain.confidence import Confidence
from weft.domain.dates import PartialDate
from weft.domain.draft import FEELING_DIMENSION_LABELS, FEELING_LEVEL_LABELS
from weft.domain.feelings import DIMENSIONS, by_direction
from weft.domain.graph_write import PREDICATE_LABELS
from weft.domain.taxonomy import Category
from weft.domain.tenancy import FORBIDDEN_TENANT_KWARGS
from weft.infra import Infra
from weft.llm import ToolSpec
from weft.repositories.records import (
    EpisodeRecord,
    FactRecord,
    FeelingRecord,
    IdentityValue,
    PersonRecord,
    RelationshipRecord,
)
from weft.services import query_tools as qt
from weft.services._uow import graph

FINAL_ANSWER = "final_answer"
EXCERPT_FOR_MODEL = 160
IDENTITY_LABELS = {"gender": "性别", "birthday": "生日", "hometown": "籍贯"}
# The extraction prompt's predicate labels, plus events between two persons.
FACT_LABELS = {**PREDICATE_LABELS, "RELATED_EVENT": "两人之间的事"}
CATEGORY_LABELS = {c.value: c.label for c in Category}
Predicate = Literal[
    "WORKS_AT", "STUDIED_AT", "LIVES_IN", "HAS_TRAIT", "LIKES", "DISLIKES", "EXPERIENCED",
    "HAS_ETIQUETTE",
]  # fmt: skip
Closeness = Literal["intimate", "close", "familiar", "casual", "distant"]
PERSON_HINT = "人物：之前结果里的 P 句柄（如 P3），或姓名 / 别名；本人写“我”"
DATE_HINT = "日期 YYYY、YYYY-MM 或 YYYY-MM-DD"


class _Args(BaseModel):
    model_config = ConfigDict(extra="forbid")


class FindPersonArgs(_Args):
    name: str = Field(description="姓名或别名，如“老张”")


class ReadProfileArgs(_Args):
    person: str = Field(description=PERSON_HINT)


class ReadRelationshipArgs(_Args):
    person_a: str = Field(description=PERSON_HINT)
    person_b: str = Field(description=PERSON_HINT)


class FindPathArgs(_Args):
    from_person: str = Field(default="我", description=PERSON_HINT)
    to_person: str = Field(description=PERSON_HINT)


class FilterArgs(_Args):
    relationship_category: Category | None = Field(
        default=None,
        description="关系大类：kin 亲属 / romantic 情感 / social 社会 / interest 利益 / hostile 敌对",
    )
    relationship_subtype: str | None = Field(
        default=None, description="关系小类或原话，如“同学”“室友”"
    )
    relative_to: str | None = Field(
        default=None, description="以谁为中心（默认本人）；" + PERSON_HINT
    )
    min_closeness: Closeness | None = Field(
        default=None, description="中心人物对此人的亲密度至少到这一档"
    )
    predicate: Predicate | None = Field(default=None, description="事实类型")
    object_keywords: list[str] = Field(
        default_factory=list, description='事实对象包含其中任一词，如 ["露营"]、["字节跳动","腾讯"]'
    )
    include_history: bool = Field(
        default=False, description="也算已经不成立的旧事实（如以前的工作单位）"
    )
    met_from: str | None = Field(default=None, description="认识时间不早于；" + DATE_HINT)
    met_to: str | None = Field(default=None, description="认识时间不晚于；" + DATE_HINT)


class TimeArgs(_Args):
    kind: Literal["met", "pair_events", "facts"] = Field(
        description="met：某段时间新认识的人；pair_events：两人之间关系的变化事件；facts：某段时间发生的事"
    )
    start: str | None = Field(default=None, description=DATE_HINT)
    end: str | None = Field(default=None, description=DATE_HINT)
    person_a: str | None = Field(default=None, description=PERSON_HINT)
    person_b: str | None = Field(default=None, description=PERSON_HINT)


class SearchArgs(_Args):
    query: str = Field(description="自然语言检索词，如“户外运动”")


def _spec(name: str, description: str, model: type[BaseModel]) -> ToolSpec:
    return ToolSpec(name=name, description=description, parameters=model.model_json_schema())


TOOL_SPECS: list[ToolSpec] = [
    _spec("find_person", "按姓名或别名查找人物。", FindPersonArgs),
    _spec("read_profile", "读取一个人物的画像：身份、社会角色（含历史）、性格、喜好、生活事件、相处之道、你的评价、综合描述，每条带出处。", ReadProfileArgs),
    _spec("read_relationship", "读取两个人物之间的关系：关系类型、认识时间与途径、介绍人、现状、事实时间线、双方各自的感受。", ReadRelationshipArgs),
    _spec("find_path", "人脉路径：两人之间最短的关系链（最多 4 跳）；若两人由人介绍认识，返回介绍链。用于“我是怎么认识某人的”“通过谁能认识某人”。", FindPathArgs),
    _spec("filter_persons", "条件筛选人物：关系类型、亲密度、事实（学校/公司/城市/喜好等）、认识时间。", FilterArgs),
    _spec("count_persons", "按与 filter_persons 相同的条件计数，并返回被计入的人物。", FilterArgs),
    _spec("time_query", "时间查询：某段时间新认识的人、两人关系的变化事件、某段时间发生的事。", TimeArgs),
    _spec("semantic_search", "语义检索事实与人物，用于其他工具不好表达的问题。", SearchArgs),
    _spec(FINAL_ANSWER, "提交最终回答（必须调用它来结束）。每段文字的 evidence 只能填工具结果里出现过的 E 句柄；人物只能填 P 句柄。", FinalAnswer),
]  # fmt: skip


class ToolInputError(ValueError):
    """The model's arguments are unusable; the message goes back to the model."""


def _date(value: str | None) -> PartialDate | None:
    if value is None or not value.strip():
        return None
    try:
        return PartialDate.parse(value.strip())
    except ValueError as exc:
        raise ToolInputError(f"日期格式不对：{value}（应为 YYYY、YYYY-MM 或 YYYY-MM-DD）") from exc


def _iso(value: PartialDate | None) -> str | None:
    return None if value is None else value.isoformat()


class AskSession:
    """One question's tool calls: handles, evidence and the episodes behind them."""

    def __init__(self, infra: Infra) -> None:
        self._infra = infra
        self.persons: dict[str, PersonRecord] = {}  # handle -> person
        self._handles: dict[str, str] = {}  # person id -> handle
        self.evidence: dict[str, Evidence] = {}
        self._evidence_keys: dict[tuple[str, str], str] = {}
        self._episodes: dict[str, EpisodeRecord] = {}
        self.calls: list[tuple[str, dict[str, Any]]] = []  # every tool call, in order
        self.lookups: dict[str, list[PersonRecord]] = {}  # name looked up -> who it found
        self._tools: dict[str, tuple[type[_Args], Callable[[Any], Awaitable[dict[str, Any]]]]] = {
            "find_person": (FindPersonArgs, self._find_person),
            "read_profile": (ReadProfileArgs, self._read_profile),
            "read_relationship": (ReadRelationshipArgs, self._read_relationship),
            "find_path": (FindPathArgs, self._find_path),
            "filter_persons": (FilterArgs, self._filter),
            "count_persons": (FilterArgs, self._count),
            "time_query": (TimeArgs, self._time),
            "semantic_search": (SearchArgs, self._search),
        }

    # --- dispatch ------------------------------------------------------------------

    async def run(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        """Run one tool call; failures come back as ``{"error": ...}`` for the model."""
        self.calls.append((name, arguments))
        smuggled = sorted(FORBIDDEN_TENANT_KWARGS.intersection(arguments))
        if smuggled:
            return {"error": f"工具不接受租户参数（{', '.join(smuggled)}）；数据范围由服务端决定"}
        if name not in self._tools:
            return {"error": f"没有这个工具：{name}"}
        model, handler = self._tools[name]
        try:
            args = model.model_validate(arguments)
            return await handler(args)
        except ValidationError as exc:
            return {"error": f"参数不正确：{exc.errors(include_url=False)}"}
        except (ToolInputError, ValueError) as exc:
            return {"error": str(exc)}

    # --- handles and evidence ----------------------------------------------------------

    def ref(self, person: PersonRecord) -> str:
        handle = self._handles.get(person.id)
        if handle is None:
            handle = f"P{len(self._handles) + 1}"
            self._handles[person.id] = handle
            self.persons[handle] = person
        return handle

    def person_refs(self) -> dict[str, PersonRef]:
        return {
            h: PersonRef(person_id=p.id, name=p.name, is_self=p.is_self)
            for h, p in self.persons.items()
        }

    def _person(self, p: PersonRecord) -> dict[str, Any]:
        out: dict[str, Any] = {"person": self.ref(p), "name": "我" if p.is_self else p.name}
        if p.is_self:
            out["is_self"] = True
        if p.aliases:
            out["aliases"] = list(p.aliases)
        if p.note:
            out["note"] = p.note
        return out

    async def _lookup(self, name: str) -> list[PersonRecord]:
        found = await qt.find_person(self._infra, name)
        self.lookups[name] = found
        return found

    async def subjects(self, question: str, declared: Iterable[str]) -> Subjects:
        """Who the question asks about: each name -> the persons it resolves to.

        The names the model declared in ``final_answer.subjects``, plus every name it
        looked up in vain that the question itself contains (「老王」 in 「老王喜欢什么？」) —
        so a model that forgets to declare 老王 and answers about 老张 is still caught.
        """
        names = [n.strip() for n in declared if n.strip()]
        names += [n for n, found in self.lookups.items() if not found and n in question]
        out: dict[str, tuple[PersonRef, ...]] = {}
        for name in dict.fromkeys(names):
            if name in self.persons:
                found = [self.persons[name]]
            elif name in self.lookups:
                found = self.lookups[name]
            else:
                found = await self._lookup(name)
            out[name] = tuple(
                PersonRef(person_id=p.id, name=p.name, is_self=p.is_self) for p in found
            )
        return out

    async def _resolve(self, ref: str) -> PersonRecord:
        text = ref.strip()
        if text in self.persons:
            return self.persons[text]
        found = await self._lookup(text)
        if not found:
            raise ToolInputError(f"图谱里没有叫“{text}”的人物")
        if len(found) > 1:
            names = "、".join(f"{self.ref(p)} {p.name}" for p in found)
            raise ToolInputError(f"“{text}”可能是多个人物：{names}；请用 P 句柄指定")
        return found[0]

    async def _load_episodes(self, entry_ids: list[str]) -> None:
        missing = [i for i in dict.fromkeys(entry_ids) if i not in self._episodes]
        if missing:
            self._episodes.update(await graph(self._infra).episodes(missing))

    def _evidence(
        self,
        kind: str,
        record_id: str,
        confidence: Confidence,
        sources: tuple[str, ...],
        *,
        is_opinion: bool = False,
        pair: tuple[PersonRecord, PersonRecord] | None = None,
        about: Iterable[str] = (),
    ) -> str:
        key = (kind, record_id)
        if key in self._evidence_keys:
            return self._evidence_keys[key]
        handle = f"E{len(self.evidence) + 1}"
        if pair is not None:
            self.ref(pair[0]), self.ref(pair[1])
        refs = self.person_refs()
        self.evidence[handle] = Evidence(
            key=handle,
            confidence=confidence,
            sources=tuple(
                Source(e.entry_id, e.content, e.occurred)
                for s in sources
                if (e := self._episodes.get(s)) is not None
            ),
            is_opinion=is_opinion,
            pair=None if pair is None else (refs[self.ref(pair[0])], refs[self.ref(pair[1])]),
            about=frozenset(about) | (frozenset() if pair is None else {pair[0].id, pair[1].id}),
        )
        self._evidence_keys[key] = handle
        return handle

    def _sources(self, sources: tuple[str, ...]) -> list[dict[str, str]]:
        out = []
        for s in sources:
            e = self._episodes.get(s)
            if e is not None:
                out.append(
                    {"excerpt": e.content[:EXCERPT_FOR_MODEL], "date": e.occurred.isoformat()}
                )
        return sorted(out, key=lambda x: x["date"])

    # --- presentation ----------------------------------------------------------------

    def _fact(self, f: FactRecord, people: dict[str, PersonRecord]) -> dict[str, Any]:
        subject = people.get(f.subject_id)
        out: dict[str, Any] = {
            "evidence": self._evidence(
                "fact",
                f.id,
                f.confidence,
                f.sources,
                is_opinion=f.kind == "opinion",
                about=(f.subject_id, f.object_id),
            ),
        }
        if subject is not None:
            out["about"] = self.ref(subject)
        if f.kind == "opinion":
            out |= {
                "kind": "opinion",
                "kind_label": "评价（你的主观评价，不是事实）",
                "opinion": f.object,
            }
        else:
            out |= {
                "kind": "fact",
                "predicate": f.predicate,
                "label": FACT_LABELS.get(f.predicate, f.predicate),
                "object": f.object,
                "status": "unverified"
                if f.unverified
                else ("history" if f.invalid_at else "current"),
            }
        out |= {
            "text": f.fact,
            "confidence": f.confidence.value,
            "confidence_label": f.confidence.label,
        }
        if f.valid_at:
            out["from"] = f.valid_at.isoformat()
        if f.invalid_at:
            out["until"] = f.invalid_at.isoformat()
        out["sources"] = self._sources(f.sources)
        return out

    def _relationship(
        self, r: RelationshipRecord, people: dict[str, PersonRecord]
    ) -> dict[str, Any]:
        a, b = people[r.person_a], people[r.person_b]
        out: dict[str, Any] = {
            "evidence": self._evidence(
                "relationship",
                r.id,
                r.confidence,
                r.sources,
                pair=(a, b),
                about=() if r.introduced_by is None else (r.introduced_by.id,),
            ),
            "between": [self.ref(a), self.ref(b)],
            "types": [
                {
                    "category": CATEGORY_LABELS.get(t.category, t.category),
                    "subtype": t.subtype,
                    "original": t.original,
                }
                for t in r.types
            ],
            "confidence": r.confidence.value,
            "confidence_label": r.confidence.label,
        }
        if r.met_at:
            out["met_at"] = r.met_at.isoformat()
        if r.origin:
            out["origin"] = r.origin
        if r.introduced_by is not None:
            out["introduced_by"] = self.ref(people.get(r.introduced_by.id, r.introduced_by))
        if r.status:
            out["status"] = qt.STATUS_LABELS.get(r.status, r.status)
        if r.summary:
            out["summary"] = r.summary
        out["sources"] = self._sources(r.sources)
        return out

    def _closeness(self, f: FeelingRecord) -> dict[str, Any]:
        return {
            "evidence": self._evidence(
                "feeling", f.id, f.confidence, (f.source,), about=(f.from_id, f.to_id)
            ),
            "level": FEELING_LEVEL_LABELS["closeness"].get(f.level, f.level),
            "since": f.occurred_at.isoformat(),
            "confidence": f.confidence.value,
        }

    def _identity(self, field: str, v: IdentityValue, person: PersonRecord) -> dict[str, Any]:
        return {
            "evidence": self._evidence(
                "identity", f"{person.id}:{field}", v.confidence, v.sources, about=(person.id,)
            ),
            "field": IDENTITY_LABELS.get(field, field),
            "value": v.value,
            "confidence": v.confidence.value,
            "sources": self._sources(v.sources),
        }

    async def _people(self) -> dict[str, PersonRecord]:
        return {p.id: p for p in await graph(self._infra).list_persons()}

    # --- tools ---------------------------------------------------------------------

    async def _find_person(self, args: FindPersonArgs) -> dict[str, Any]:
        name = args.name.strip()
        found = await self._lookup(name) if name else []
        return {"found": bool(found), "persons": [self._person(p) for p in found]}

    async def _read_profile(self, args: ReadProfileArgs) -> dict[str, Any]:
        person = await self._resolve(args.person)
        profile = await qt.read_profile(self._infra, person.id)
        if profile is None:
            return {"found": False}
        self._episodes.update(profile.episodes)
        people = await self._people()
        facts = [self._fact(f, people) for f in profile.facts if f.kind == "fact"]
        opinions = [self._fact(f, people) for f in profile.facts if f.kind == "opinion"]
        identity = [self._identity(k, v, person) for k, v in sorted(profile.identity.items())]
        out: dict[str, Any] = {"person": self._person(person), "identity": identity, "facts": facts}
        out["opinions"] = opinions
        if profile.summary:
            out["summary"] = profile.summary
        out["found"] = bool(facts or opinions or identity)
        return out

    async def _read_relationship(self, args: ReadRelationshipArgs) -> dict[str, Any]:
        a, b = await self._resolve(args.person_a), await self._resolve(args.person_b)
        pair = await qt.read_relationship(self._infra, a.id, b.id)
        if pair is None:
            return {"found": False}
        self._episodes.update(pair.episodes)
        people = await self._people()
        feelings: dict[str, list[dict[str, Any]]] = {}
        for label, (src, dst) in {"a_to_b": (a, b), "b_to_a": (b, a)}.items():
            views = by_direction(pair.feelings, src.id, dst.id)
            feelings[label] = [
                {
                    "evidence": self._evidence(
                        "feeling",
                        v.current.id,
                        v.current.confidence,
                        (v.current.source,),
                        about=(v.current.from_id, v.current.to_id),
                    ),
                    "dimension": FEELING_DIMENSION_LABELS[d],
                    "current": FEELING_LEVEL_LABELS[d].get(v.current.level, v.current.level),
                    "history": [
                        {
                            "level": FEELING_LEVEL_LABELS[d].get(h.level, h.level),
                            "date": h.occurred_at.isoformat(),
                        }
                        for h in v.history
                    ],
                    "confidence": v.current.confidence.value,
                }
                for d in DIMENSIONS
                if (v := views.get(d)) is not None
            ]
        rel = pair.relationship
        timeline = [self._fact(f, people) for f in sorted(pair.facts, key=qt.fact_order)]
        return {
            "found": rel is not None or bool(timeline) or any(feelings.values()),
            "pair": [self.ref(a), self.ref(b)],
            "relationship": None if rel is None else self._relationship(rel, people),
            "timeline": timeline,
            "feelings": feelings,
        }

    async def _find_path(self, args: FindPathArgs) -> dict[str, Any]:
        a, b = await self._resolve(args.from_person), await self._resolve(args.to_person)
        path = await qt.find_path(self._infra, a.id, b.id)
        if path is None:
            return {"found": False, "max_hops": qt.MAX_PATH_HOPS}
        rels = [*path.relationships, *([path.direct] if path.direct else [])]
        await self._load_episodes([s for r in rels for s in r.sources])
        people = await self._people()
        out: dict[str, Any] = {
            "found": True,
            "path": [self._person(p) for p in path.persons],
            "links": [self._relationship(r, people) for r in path.relationships],
        }
        if path.introduced_by is not None and path.direct is not None:
            out["introduced_by"] = self.ref(path.introduced_by)
            out["direct_relationship"] = self._relationship(path.direct, people)
        return out

    async def _filter_matches(
        self, args: FilterArgs
    ) -> tuple[list[qt.PersonMatch], list[dict[str, Any]]]:
        anchor = await self._resolve(args.relative_to) if args.relative_to else None
        matches = await qt.filter_persons(
            self._infra,
            qt.PersonFilter(
                relationship_category=args.relationship_category,
                relationship_subtype=args.relationship_subtype,
                relative_to=anchor.id if anchor else None,
                min_closeness=args.min_closeness,
                predicate=args.predicate,
                object_keywords=tuple(k for k in args.object_keywords if k.strip()),
                include_history=args.include_history,
                met_from=_date(args.met_from),
                met_to=_date(args.met_to),
            ),
        )
        sources = [s for m in matches for f in m.facts for s in f.sources]
        sources += [s for m in matches if m.relationship for s in m.relationship.sources]
        sources += [m.closeness.source for m in matches if m.closeness]
        await self._load_episodes(sources)
        people = await self._people()
        shown = []
        for m in matches:
            row = self._person(m.person)
            if m.relationship is not None:
                row["relationship"] = self._relationship(m.relationship, people)
            if m.facts:
                row["facts"] = [self._fact(f, people) for f in m.facts]
            if m.closeness is not None:
                row["closeness"] = self._closeness(m.closeness)
            shown.append(row)
        return matches, shown

    async def _filter(self, args: FilterArgs) -> dict[str, Any]:
        matches, shown = await self._filter_matches(args)
        return {"found": bool(matches), "persons": shown}

    async def _count(self, args: FilterArgs) -> dict[str, Any]:
        matches, shown = await self._filter_matches(args)
        return {"found": bool(matches), "count": len(matches), "persons": shown}

    async def _time(self, args: TimeArgs) -> dict[str, Any]:
        a = await self._resolve(args.person_a) if args.person_a else None
        b = await self._resolve(args.person_b) if args.person_b else None
        result = await qt.time_query(
            self._infra,
            qt.TimeQuery(
                kind=args.kind,
                start=_date(args.start),
                end=_date(args.end),
                person_a=a.id if a else None,
                person_b=b.id if b else None,
            ),
        )
        people = await self._people()
        if args.kind == "met":
            await self._load_episodes(
                [s for m in result.met if m.relationship for s in m.relationship.sources]
            )
            persons = []
            for m in result.met:
                row = self._person(m.person)
                if m.relationship is not None:
                    row["relationship"] = self._relationship(m.relationship, people)
                persons.append(row)
            return {"found": bool(persons), "persons": persons}
        if args.kind == "pair_events":
            if result.pair is not None:
                self._episodes.update(result.pair.episodes)
            events = [
                {
                    "evidence": self._evidence(
                        "event",
                        f"{e.kind}:{e.text}:{_iso(e.date)}",
                        e.confidence,
                        e.sources,
                        pair=(result.pair.a, result.pair.b) if result.pair else None,
                    ),
                    "date": _iso(e.date),
                    "event": e.text,
                    "confidence": e.confidence.value,
                    "confidence_label": e.confidence.label,
                    "sources": self._sources(e.sources),
                }
                for e in result.events
            ]
            return {"found": bool(events), "events": events}
        await self._load_episodes([s for _, f in result.facts for s in f.sources])
        return {
            "found": bool(result.facts),
            "facts": [self._fact(f, people) for _, f in result.facts],
        }

    async def _search(self, args: SearchArgs) -> dict[str, Any]:
        if not args.query.strip():
            raise ToolInputError("检索词不能为空")
        hits = await qt.semantic_search(self._infra, args.query)
        await self._load_episodes([s for f in hits.facts for s in f.sources])
        people = await self._people()
        # Hybrid-search ranks depend on index-wide statistics; show hits in a stable order.
        facts = sorted(
            (f for f in hits.facts if f.subject_id in people),
            key=lambda f: (people[f.subject_id].name, *qt.fact_order(f)),
        )
        return {
            "found": bool(facts or hits.persons),
            "facts": [self._fact(f, people) for f in facts],
            "persons": [
                self._person(p) for p in sorted(hits.persons, key=lambda p: (p.name, p.id))
            ],
        }


def tool_message(result: dict[str, Any]) -> str:
    return json.dumps(result, ensure_ascii=False, separators=(",", ":"))


__all__ = ["FINAL_ANSWER", "TOOL_SPECS", "AskSession", "tool_message"]
