/**
 * Pure helpers over a Draft: what the review sheet shows, and the keyed edits it emits
 * (choose a person, change a confidence or relationship type, remove an item). Batch 5
 * can apply the same functions optimistically before the API answers.
 */
import {
  type Confidence,
  type Draft,
  type DraftItem,
  type DraftPerson,
  type DraftRelationshipType,
  type PersonChoice,
  SELF_ID,
} from "../contracts/draft.ts";
import { feelingDimensionLabel, feelingLevelLabel, profileFieldLabel } from "./labels.ts";

export function unresolvedPersons(draft: Draft): DraftPerson[] {
  return draft.persons.filter((p) => p.match === "ambiguous");
}

/** AC-12: a draft with any 需选择 person cannot be confirmed. */
export function canConfirm(draft: Draft): boolean {
  return unresolvedPersons(draft).length === 0;
}

/** Review order: facts, profile, relationships, feelings. */
export function draftItems(draft: Draft): DraftItem[] {
  return [...draft.facts, ...draft.profile, ...draft.relationships, ...draft.feelings];
}

export function draftSummary(draft: Draft): { persons: number; items: number } {
  return { persons: draft.persons.length, items: draftItems(draft).length };
}

export function choosePerson(draft: Draft, personItemId: string, choice: PersonChoice): Draft {
  return {
    ...draft,
    persons: draft.persons.map((p): DraftPerson => {
      if (p.id !== personItemId) return p;
      if (choice === "new") return { ...p, match: "new", person_id: null };
      const c = p.candidates?.find((x) => x.person_id === choice.person_id);
      return {
        ...p,
        match: "matched",
        person_id: choice.person_id,
        name: c?.name ?? p.name,
        note: c?.note ?? p.note,
      };
    }),
  };
}

function mapItems(draft: Draft, id: string, fn: (item: DraftItem) => DraftItem | null): Draft {
  const apply = <T extends DraftItem>(list: T[]): T[] =>
    list.flatMap((item) => {
      if (item.id !== id) return [item];
      const next = fn(item);
      return next ? [next as T] : [];
    });
  return {
    ...draft,
    facts: apply(draft.facts),
    relationships: apply(draft.relationships),
    feelings: apply(draft.feelings),
    profile: apply(draft.profile),
  };
}

export function removeItem(draft: Draft, id: string): Draft {
  return mapItems(draft, id, () => null);
}

export function setConfidence(draft: Draft, id: string, confidence: Confidence): Draft {
  return mapItems(draft, id, (item) => ({ ...item, confidence }));
}

/** Re-classify one relationship type; the Entry's original wording is kept (AC-31). */
export function setRelationshipType(
  draft: Draft,
  id: string,
  index: number,
  type: Omit<DraftRelationshipType, "original">,
): Draft {
  return {
    ...draft,
    relationships: draft.relationships.map((r) => {
      if (r.id !== id) return r;
      const types = [...(r.types ?? [])];
      types[index] = { ...type, original: types[index]?.original ?? type.subtype };
      return { ...r, types };
    }),
  };
}

/** Display name for a mention: the matched person's name, 「我」 for self, else the mention. */
export function displayName(draft: Draft, mention: string): string {
  const p = draft.persons.find((x) => x.mention === mention);
  if (!p) return mention;
  if (p.person_id === SELF_ID) return "我";
  return (p.match === "matched" && p.name) || mention;
}

const FACT: Record<string, (s: string, o: string) => string> = {
  WORKS_AT: (s, o) => `${s}在${o}工作`,
  STUDIED_AT: (s, o) => `${s}在${o}上学`,
  LIVES_IN: (s, o) => `${s}住在${o}`,
  HAS_TRAIT: (s, o) => `${s}的性格：${o}`,
  LIKES: (s, o) => `${s}喜欢${o}`,
  DISLIKES: (s, o) => `${s}不喜欢${o.replace(/^不/, "")}`,
  EXPERIENCED: (s, o) => `${s}${o}`,
  HAS_ETIQUETTE: (s, o) => `和${s}相处：${o}`,
  OPINION: (s, o) => `我对${s}的评价：${o}`,
  RELATED_EVENT: (s, o) => `${s}和${o}之间的事`,
};

/** How one feels about the other, per dimension and level: 「我觉得和李明很亲近」. */
const FEELING: Record<string, Record<string, (f: string, t: string) => string>> = {
  closeness: {
    intimate: (f, t) => `${f}和${t}是至交`,
    close: (f, t) => `${f}觉得和${t}很亲近`,
    familiar: (f, t) => `${f}和${t}比较熟`,
    casual: (f, t) => `${f}和${t}关系一般`,
    distant: (f, t) => `${f}和${t}比较疏远`,
  },
  affinity: {
    like: (f, t) => `${f}喜欢${t}`,
    neutral: (f, t) => `${f}对${t}没有特别的好恶`,
    dislike: (f, t) => `${f}反感${t}`,
  },
  trust: {
    high: (f, t) => `${f}很信任${t}`,
    medium: (f, t) => `${f}对${t}的信任一般`,
    low: (f, t) => `${f}不太信任${t}`,
  },
};

export type ItemSentence = {
  /** The person the sentence is about (bold in the draft card), when it leads the text. */
  subject: string;
  /** The whole sentence, e.g. 「张伟喜欢钓鱼」. */
  text: string;
};

/**
 * 草稿条目 → 自然语句 (style refresh AC-8): 「张伟喜欢钓鱼」, 「老张是小李的室友」,
 * 「我觉得和李明很亲近」 — never fields glued together, never an internal name.
 * Directional relationship types read pair[0] 是 pair[1] 的 X (contract).
 */
export function itemSentence(draft: Draft, item: DraftItem): ItemSentence {
  const n = (m: string) => displayName(draft, m);
  if ("predicate" in item) {
    const s = n(item.subject);
    const write = FACT[item.predicate] ?? ((x: string, o: string) => `${x}：${o}`);
    return { subject: s, text: write(s, item.object) };
  }
  if ("field" in item) {
    const p = n(item.person);
    return { subject: p, text: `${p}的${profileFieldLabel(item.field)}是${item.value}` };
  }
  if ("pair" in item) {
    const [a, b] = [n(item.pair[0]), n(item.pair[1])];
    const types = [...new Set((item.types ?? []).map((t) => t.subtype))].join("、");
    return { subject: a, text: types ? `${a}是${b}的${types}` : `${a}和${b}认识` };
  }
  const [f, t] = [n(item.from), n(item.to)];
  const write = FEELING[item.dimension]?.[item.level];
  const text = write
    ? write(f, t)
    : `${f}对${t}的${feelingDimensionLabel(item.dimension)}：${feelingLevelLabel(item.dimension, item.level)}`;
  return { subject: f, text };
}
