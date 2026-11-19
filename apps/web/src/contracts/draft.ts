/**
 * 草稿 (Draft) as the web app consumes it.
 *
 * The contract is owned by the API: apps/api/contracts/draft.schema.json, projected into
 * `draft.gen.ts` (`pnpm contracts`, freshness checked by scripts/contracts.test.ts). This
 * module only re-exports the generated types under stable names and adds UI-side helpers.
 *
 * Every item has a stable `id` within the draft; edits and removals are keyed by it.
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
  Draft,
  DraftFact,
  DraftPerson,
  DraftProfileItem,
  DraftQuestion,
  DraftQuestionOption,
  DraftRelationship,
  DraftRelationshipType,
  PersonMatch,
  ProfileField,
  QuestionField,
  QuestionPatch,
  RelationshipStatus,
  TrustLevel,
} from "./draft.gen.ts";

/** Lifecycle of a draft (apps/api DraftStatus). */
export type DraftStatus = "extracting" | "pending" | "failed" | "confirmed" | "discarded";

/** 本人's person_id inside a draft. */
export const SELF_ID = "self";

export type DraftFeeling = Gen.ClosenessFeeling | Gen.AffinityFeeling | Gen.TrustFeeling;

export type FeelingDimension = DraftFeeling["dimension"];

/** Any keyed item except persons: what the review sheet lists as 「信息」. */
export type DraftItem = Gen.DraftFact | Gen.DraftRelationship | DraftFeeling | Gen.DraftProfileItem;

/** How the user resolves a 需选择 person: an existing candidate, or a new person. */
export type PersonChoice = { person_id: string } | "new";

/** How a 补充追问 is answered: a clicked option (its index) or a typed answer (自己填). */
export type QuestionAnswer = { option: number } | { text: string };
