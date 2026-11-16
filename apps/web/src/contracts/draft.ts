/**
 * 草稿 (Draft) as the web app consumes it.
 *
 * The machine-readable contract is apps/api/contracts/draft.schema.json; `draft.gen.ts` is
 * generated from it (`pnpm contracts`, freshness checked by scripts/contracts.test.ts).
 * This file only layers on what the spec's 补充约定 promises but the schema does not carry yet:
 *
 *   - every item has a stable `id` within the draft; edits and removals are keyed by it;
 *   - facts may carry `valid_to` (a date range such as 「上周末」);
 *   - a relationship `pair` is two person mentions (the generator cannot express prefixItems);
 *   - a matched person may carry the display `name` / `note` of the person it matched
 *     (「老张 → 张伟（同事）」) — the draft detail endpoint is expected to fill these in.
 *
 * When the schema gains these fields the intersections below become no-ops.
 * Person references inside items (fact.subject, pair, feeling.from/to, profile.person) are
 * `persons[].mention` strings; 本人 appears as a person with `person_id = "self"`.
 */
import type * as Gen from "./draft.gen.ts";

export type {
  AffinityLevel,
  Candidate,
  Category,
  ClosenessLevel,
  Confidence,
  ConflictAction,
  PersonMatch,
  ProfileField,
  RelationshipStatus,
  TrustLevel,
} from "./draft.gen.ts";

/** Lifecycle of a draft (apps/api DraftStatus). */
export type DraftStatus = "extracting" | "pending" | "failed" | "confirmed" | "discarded";

/** 本人's person_id inside a draft. */
export const SELF_ID = "self";

type Keyed<T> = T & { id: string };

export type DraftPerson = Keyed<Gen.DraftPerson> & {
  name?: string | null;
  note?: string | null;
};

export type DraftFact = Keyed<Gen.DraftFact> & { valid_to?: string | null };

export type DraftRelationshipType = Gen.DraftRelationshipType;

export type DraftRelationship = Keyed<Omit<Gen.DraftRelationship, "pair">> & {
  pair: [string, string];
};

export type DraftFeeling =
  | Keyed<Gen.ClosenessFeeling>
  | Keyed<Gen.AffinityFeeling>
  | Keyed<Gen.TrustFeeling>;

export type FeelingDimension = DraftFeeling["dimension"];

export type DraftProfileItem = Keyed<Gen.DraftProfileItem>;

export type Draft = {
  persons: DraftPerson[];
  facts: DraftFact[];
  relationships: DraftRelationship[];
  feelings: DraftFeeling[];
  profile: DraftProfileItem[];
};

/** Any keyed item except persons: what the review sheet lists as 「信息」. */
export type DraftItem = DraftFact | DraftRelationship | DraftFeeling | DraftProfileItem;

/** How the user resolves a 需选择 person: an existing candidate, or a new person. */
export type PersonChoice = { person_id: string } | "new";
