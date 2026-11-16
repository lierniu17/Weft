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
import {
  categoryLabel,
  feelingDimensionLabel,
  feelingLevelLabel,
  predicateLabel,
  profileFieldLabel,
} from "./labels.ts";

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

/** One line of text for an item, e.g. 「李明 · 喜欢 钓鱼」. */
export function describeItem(draft: Draft, item: DraftItem): string {
  const n = (m: string) => displayName(draft, m);
  if ("predicate" in item) {
    return `${n(item.subject)} · ${predicateLabel(item.predicate)} ${item.object}`;
  }
  if ("field" in item) return `${n(item.person)} · ${profileFieldLabel(item.field)} ${item.value}`;
  if ("pair" in item) {
    const types = (item.types ?? [])
      .map((t) => `${categoryLabel(t.category)} · ${t.subtype}`)
      .join("，");
    return `${n(item.pair[0])} 与 ${n(item.pair[1])}${types ? ` · ${types}` : ""}`;
  }
  const level = feelingLevelLabel(item.dimension, item.level);
  return `${n(item.from)} → ${n(item.to)} · ${feelingDimensionLabel(item.dimension)} ${level}`;
}
