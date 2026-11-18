/**
 * Pure mappings from API responses to what the frozen components take as props.
 * The page-integration layer calls these; they never fetch.
 */

import type { components } from "../api/schema.gen.ts";
import type { EntryStatus } from "../components/business/EntryListItem/EntryListItem.tsx";
import type { ProfileItem } from "../components/business/ProfileSection/ProfileSection.tsx";
import type { Citation } from "../contracts/answer.ts";
import type { Confidence } from "../contracts/draft.ts";
import type { OccurredOn } from "./datePrecision.ts";
import { formatPartialDate, parsePartialDate } from "./datePrecision.ts";
import { FEELING_LEVELS, profileFieldLabel } from "./labels.ts";

type S = components["schemas"];

const pad = (n: number) => String(n).padStart(2, "0");

export function toPartialDate(v: OccurredOn): string {
  if (v.precision === "year") return String(v.year);
  if (v.precision === "month") return `${v.year}-${pad(v.month)}`;
  return `${v.year}-${pad(v.month)}-${pad(v.day)}`;
}

/** An API timestamp as the Beijing calendar date "YYYY-MM-DD". */
export function beijingDate(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 8 * 3600_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

// --- 记录 --------------------------------------------------------------------------

export function entryStatus(entry: S["EntryOut"]): EntryStatus {
  const status = entry.draft?.status;
  if (!status) return "confirmed";
  return status === "extracting" ? "pending" : status;
}

/** 补记: the Entry happened before the day it was written (or is only known to month / year). */
export function isBackfilled(entry: S["EntryOut"]): boolean {
  if (entry.precision !== "day") return true;
  return entry.occurred_on < beijingDate(entry.created_at);
}

export function monthHeading(occurredOn: string): string {
  const d = parsePartialDate(occurredOn);
  return d.precision === "year" ? `${d.year} 年` : `${d.year} 年 ${d.month} 月`;
}

/** How many characters of an Entry name its draft card. */
const LABEL_CHARS = 12;

/**
 * Accessible names for the draft cards in the chat feed, by Entry id:
 * 「草稿 · <发生日期> · <记录开头>」. Every card is a region, so names must be unique
 * (axe landmark-unique); identical openings get 「 · 2」「 · 3」.
 */
export function draftCardLabels(
  entries: { id: string; occurred_on: string; text: string }[],
  today: Date,
): Map<string, string> {
  const labels = new Map<string, string>();
  const used = new Map<string, number>();
  for (const e of entries) {
    const flat = e.text.replace(/\s+/g, " ").trim();
    const opening = flat.length > LABEL_CHARS ? `${flat.slice(0, LABEL_CHARS)}…` : flat;
    const base = `草稿 · ${formatPartialDate(e.occurred_on, today)} · ${opening}`;
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    labels.set(e.id, n === 1 ? base : `${base} · ${n}`);
  }
  return labels;
}

/**
 * 「学到别名」 on a confirmed draft card: exactly the aliases the server recorded for this
 * Entry's confirmation (AC-13). An alias learned by an earlier Entry is not repeated.
 */
export function learnedAliases(
  detail: Pick<S["EntryDetailOut"], "learned_aliases"> | undefined,
): { alias: string; name: string }[] {
  return (detail?.learned_aliases ?? []).map((a) => ({ alias: a.alias, name: a.name }));
}

// --- 出处 --------------------------------------------------------------------------

export type CitationSource = S["CitationOut"];

export function toCitations(sources: CitationSource[]): Citation[] {
  return sources.map((c, i) => ({
    index: i + 1,
    entry_id: c.entry_id,
    entry_excerpt: c.kind === "manual_edit" ? `手动编辑：${c.entry_excerpt}` : c.entry_excerpt,
    occurred_on: c.occurred_on,
    confidence: c.confidence,
    is_opinion: false,
  }));
}

// --- 画像 --------------------------------------------------------------------------

/** The predicates shown as 社会角色, with the kind word a role reads with when nothing better. */
const ROLE_KIND: Record<string, string | null> = {
  WORKS_AT: null, // 「字节跳动」 needs no 「单位」
  STUDIED_AT: "学校",
  LIVES_IN: "城市",
};

/** The relations with 本人 a current role stands for: 在字节跳动 + 同事 → 「… · 同事」. */
const ROLE_RELATION: Record<string, readonly string[]> = {
  WORKS_AT: ["同事", "上下级", "合伙人"],
  STUDIED_AT: ["同学", "校友", "师生"],
};

export function dislikeText(object: string): string {
  return object.startsWith("不") ? object : `不${object}`;
}

export type ProfileView = {
  identity: ProfileItem[];
  roles: ProfileItem[];
  traits: ProfileItem[];
  likes: ProfileItem[];
  events: ProfileItem[];
  etiquette: ProfileItem[];
  opinions: ProfileItem[];
  /** Every source of an item (fact id or `identity:<field>`), for its CitationSheet. */
  sources: (id: string) => CitationSource[];
  /** The fact behind an item id, for in-place edits. */
  fact: (id: string) => S["FactOut"] | undefined;
};

/**
 * `relations`: the subtypes of his relationship with 本人 (同事、朋友); a current role's second
 * line names the one it stands for — 「2018 年 3 月 – 至今 · 同事」.
 */
export function profileView(profile: S["ProfileOut"], relations: string[] = []): ProfileView {
  const item = (f: S["FactOut"], text = f.object): ProfileItem => ({
    id: f.id,
    text,
    unverified: f.unverified,
  });
  // Current facts plus 待核实 ones; superseded facts only survive as role history (AC-22).
  const live = profile.facts.filter((f) => f.current || f.unverified);
  const by = (...predicates: string[]) => live.filter((f) => predicates.includes(f.predicate));

  const roles = profile.facts
    .filter((f) => f.predicate in ROLE_KIND && (f.current || f.unverified || f.invalid_at))
    .map((f) => {
      const end = f.unverified ? null : f.invalid_at;
      const relation = end
        ? undefined
        : relations.filter((r) => ROLE_RELATION[f.predicate]?.includes(r)).join("、");
      return { ...item(f), note: relation || ROLE_KIND[f.predicate], start: f.valid_at, end };
    });

  const identity = Object.entries(profile.identity)
    .filter(([field]) => field !== "name")
    .map(([field, v]) => ({
      id: `identity:${field}`,
      text: `${profileFieldLabel(field as S["ProfileField"])} · ${v.value}`,
    }));

  return {
    identity,
    roles,
    traits: by("HAS_TRAIT").map((f) => item(f)),
    likes: by("LIKES", "DISLIKES").map((f) =>
      item(f, f.predicate === "DISLIKES" ? dislikeText(f.object) : f.object),
    ),
    events: by("EXPERIENCED").map((f) =>
      item(f, f.valid_at ? `${f.object}（${f.valid_at}）` : f.object),
    ),
    etiquette: by("HAS_ETIQUETTE").map((f) => item(f)),
    opinions: live.filter((f) => f.kind === "opinion").map((f) => item(f)),
    sources: (id) => {
      if (id.startsWith("identity:")) return profile.identity[id.slice(9)]?.citations ?? [];
      return profile.facts.find((f) => f.id === id)?.citations ?? [];
    },
    fact: (id) => profile.facts.find((f) => f.id === id),
  };
}

// --- 人物列表 ------------------------------------------------------------------------

export type ListedPerson = S["PersonOut"] & { relation?: string };
export type ClosenessGroup = { key: string; title: string; people: ListedPerson[] };

const CLOSENESS = FEELING_LEVELS.closeness;

/** People grouped by my closeness to them (至交 / 亲近 / …), self pinned on top. */
export function closenessGroups(persons: S["PersonOut"][], graph: S["GraphOut"] | undefined) {
  const self = persons.find((p) => p.is_self);
  const edgeTo = new Map<string, S["GraphEdgeOut"]>();
  for (const e of graph?.edges ?? []) {
    if (self && e.source === self.id) edgeTo.set(e.target, e);
    else if (self && e.target === self.id) edgeTo.set(e.source, e);
  }
  const groups: ClosenessGroup[] = [
    ...CLOSENESS.map(([key, title]) => ({ key, title, people: [] as ListedPerson[] })),
    { key: "none", title: "其他", people: [] },
  ];
  for (const p of persons) {
    if (p.is_self) continue;
    const edge = edgeTo.get(p.id);
    const relation = edge?.types.map((t) => t.subtype).join(" · ") || undefined;
    const group =
      groups.find((g) => g.key === (edge?.closeness ?? "none")) ?? groups[groups.length - 1];
    group.people.push({ ...p, relation });
  }
  return { self, groups: groups.filter((g) => g.people.length > 0) };
}

// --- 人物页 / 关系页 --------------------------------------------------------------------

export function knownFor(metAt: string | null | undefined, today: Date): string | undefined {
  if (!metAt) return undefined;
  const years = today.getFullYear() - parsePartialDate(metAt).year;
  return years >= 1 ? `认识 ${years} 年` : "认识不到 1 年";
}

/** 「亲近 · 信任高」 from one direction's current dimensions. */
export function feelingSummary(direction: S["DirectionOut"] | undefined): string | undefined {
  if (!direction) return undefined;
  const parts: string[] = [];
  const closeness = direction.dimensions.closeness?.current.level;
  const trust = direction.dimensions.trust?.current.level;
  if (closeness) parts.push(CLOSENESS.find(([v]) => v === closeness)?.[1] ?? closeness);
  if (trust) parts.push(`信任${FEELING_LEVELS.trust.find(([v]) => v === trust)?.[1] ?? trust}`);
  return parts.join(" · ") || undefined;
}

export function feelingDimensions(direction: S["DirectionOut"]) {
  return Object.entries(direction.dimensions).map(([dimension, d]) => ({
    dimension: dimension as "closeness" | "affinity" | "trust",
    level: d.current.level,
    confidence: d.current.confidence as Confidence,
    history: d.history.map((h) => ({
      id: h.id,
      level: h.level,
      occurred_on: h.occurred_at,
      confidence: h.confidence as Confidence,
    })),
  }));
}

// --- 额度 --------------------------------------------------------------------------

export function quotaMessages(usage: S["UsageOut"] | undefined): {
  record?: string;
  ask?: string;
} {
  if (!usage) return {};
  const out: { record?: string; ask?: string } = {};
  if (usage.entry.remaining <= 0) {
    out.record = `今日已达上限：今天的 ${usage.entry.limit} 条记录已用完，北京时间 0 点重置 · 提问还剩 ${usage.ask.remaining} 次`;
  }
  if (usage.ask.remaining <= 0) {
    out.ask = `今日已达上限：今天的 ${usage.ask.limit} 次提问已用完，北京时间 0 点重置 · 记录还剩 ${usage.entry.remaining} 条`;
  }
  return out;
}
