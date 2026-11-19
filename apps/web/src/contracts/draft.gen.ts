/* GENERATED from apps/api/contracts/draft.schema.json by scripts/contracts.ts — do not edit; run `pnpm contracts`. */

/**
 * Stable id of this item, unique within the draft
 */
export type Id = string;
/**
 * How the Entry refers to the person, e.g. 老张
 */
export type Mention = string;
/**
 * This interface was referenced by `Draft`'s JSON-Schema
 * via the `definition` "PersonMatch".
 */
export type PersonMatch = "matched" | "ambiguous" | "new";
export type PersonId = string | null;
/**
 * Display name of the matched person, e.g. 张伟
 */
export type Name = string | null;
/**
 * Short hint about the matched person, e.g. 同事
 */
export type Note = string | null;
export type Candidates = Candidate[] | null;
export type PersonId1 = string;
export type Name1 = string;
/**
 * Disambiguating hint, e.g. 同事 / 邻居
 */
export type Note1 = string | null;
export type Persons = DraftPerson[];
/**
 * Stable id of this item, unique within the draft
 */
export type Id1 = string;
/**
 * Person mention
 */
export type Subject = string;
/**
 * e.g. WORKS_AT, LIKES, HAS_TRAIT, EXPERIENCED
 */
export type Predicate = string;
export type Object = string;
export type ValidAt = string | null;
/**
 * End of a time span such as 上周末; not before valid_at
 */
export type ValidTo = string | null;
/**
 * This interface was referenced by `Draft`'s JSON-Schema
 * via the `definition` "Confidence".
 */
export type Confidence = "witnessed" | "self_told" | "hearsay" | "inferred";
/**
 * The current value this fact conflicts with
 */
export type Old = string;
/**
 * This interface was referenced by `Draft`'s JSON-Schema
 * via the `definition` "ConflictAction".
 */
export type ConflictAction = "update" | "unverified";
export type Facts = DraftFact[];
/**
 * Stable id of this item, unique within the draft
 */
export type Id2 = string;
/**
 * Two person mentions; directional kin types read as pair[0] 是 pair[1] 的 X
 *
 * @minItems 2
 * @maxItems 2
 */
export type Pair = [string, string];
/**
 * This interface was referenced by `Draft`'s JSON-Schema
 * via the `definition` "Category".
 */
export type Category = "kin" | "romantic" | "social" | "interest" | "hostile";
export type Subtype = string;
/**
 * The Entry's own wording, e.g. 铁哥们
 */
export type Original = string;
export type Types = DraftRelationshipType[];
export type MetAt = string | null;
/**
 * How they met (认识途径)
 */
export type Origin = string | null;
/**
 * Person mention of the introducer
 */
export type IntroducedBy = string | null;
/**
 * This interface was referenced by `Draft`'s JSON-Schema
 * via the `definition` "RelationshipStatus".
 */
export type RelationshipStatus = "active" | "distant" | "tense" | "estranged";
export type Relationships = DraftRelationship[];
/**
 * Stable id of this item, unique within the draft
 */
export type Id3 = string;
/**
 * Person mention who feels
 */
export type From = string;
/**
 * Person mention the feeling is about
 */
export type To = string;
export type Dimension = "closeness";
/**
 * This interface was referenced by `Draft`'s JSON-Schema
 * via the `definition` "ClosenessLevel".
 */
export type ClosenessLevel = "intimate" | "close" | "familiar" | "casual" | "distant";
/**
 * Stable id of this item, unique within the draft
 */
export type Id4 = string;
/**
 * Person mention who feels
 */
export type From1 = string;
/**
 * Person mention the feeling is about
 */
export type To1 = string;
export type Dimension1 = "affinity";
/**
 * This interface was referenced by `Draft`'s JSON-Schema
 * via the `definition` "AffinityLevel".
 */
export type AffinityLevel = "like" | "neutral" | "dislike";
/**
 * Stable id of this item, unique within the draft
 */
export type Id5 = string;
/**
 * Person mention who feels
 */
export type From2 = string;
/**
 * Person mention the feeling is about
 */
export type To2 = string;
export type Dimension2 = "trust";
/**
 * This interface was referenced by `Draft`'s JSON-Schema
 * via the `definition` "TrustLevel".
 */
export type TrustLevel = "high" | "medium" | "low";
export type Feelings = (ClosenessFeeling | AffinityFeeling | TrustFeeling)[];
/**
 * Stable id of this item, unique within the draft
 */
export type Id6 = string;
/**
 * Person mention
 */
export type Person = string;
/**
 * This interface was referenced by `Draft`'s JSON-Schema
 * via the `definition` "ProfileField".
 */
export type ProfileField = "name" | "gender" | "birthday" | "hometown";
export type Value = string;
export type Profile = DraftProfileItem[];
/**
 * Stable id of this item, unique within the draft
 */
export type Id7 = string;
/**
 * This interface was referenced by `Draft`'s JSON-Schema
 * via the `definition` "QuestionField".
 */
export type QuestionField = "relationship_type" | "met" | "occurred";
/**
 * The two person mentions asked about (relationship_type / met only)
 */
export type Pair1 = [string, string] | null;
/**
 * e.g. 小李是你的同事还是同学？
 */
export type Prompt = string;
/**
 * @minItems 2
 * @maxItems 4
 */
export type Options =
  | [DraftQuestionOption, DraftQuestionOption]
  | [DraftQuestionOption, DraftQuestionOption, DraftQuestionOption]
  | [DraftQuestionOption, DraftQuestionOption, DraftQuestionOption, DraftQuestionOption];
/**
 * Button text, e.g. 同事
 */
export type Label = string;
export type Types1 = DraftRelationshipType[] | null;
export type MetAt1 = string | null;
export type Origin1 = string | null;
export type Occurred = string | null;
export type Answered = boolean;
/**
 * The clicked option's label or the typed answer
 */
export type Answer = string | null;
/**
 * 补充追问, at most 2; server-owned (see module doc)
 */
export type Questions = DraftQuestion[];

export interface Draft {
  persons: Persons;
  facts: Facts;
  relationships: Relationships;
  feelings: Feelings;
  profile: Profile;
  questions: Questions;
}
/**
 * This interface was referenced by `Draft`'s JSON-Schema
 * via the `definition` "DraftPerson".
 */
export interface DraftPerson {
  id: Id;
  mention: Mention;
  match: PersonMatch;
  person_id?: PersonId;
  name?: Name;
  note?: Note;
  candidates?: Candidates;
}
/**
 * This interface was referenced by `Draft`'s JSON-Schema
 * via the `definition` "Candidate".
 */
export interface Candidate {
  person_id: PersonId1;
  name: Name1;
  note?: Note1;
}
/**
 * This interface was referenced by `Draft`'s JSON-Schema
 * via the `definition` "DraftFact".
 */
export interface DraftFact {
  id: Id1;
  subject: Subject;
  predicate: Predicate;
  object: Object;
  valid_at?: ValidAt;
  valid_to?: ValidTo;
  confidence: Confidence;
  conflict?: FactConflict | null;
}
/**
 * This interface was referenced by `Draft`'s JSON-Schema
 * via the `definition` "FactConflict".
 */
export interface FactConflict {
  old: Old;
  action: ConflictAction;
}
/**
 * This interface was referenced by `Draft`'s JSON-Schema
 * via the `definition` "DraftRelationship".
 */
export interface DraftRelationship {
  id: Id2;
  pair: Pair;
  types: Types;
  met_at?: MetAt;
  origin?: Origin;
  introduced_by?: IntroducedBy;
  status?: RelationshipStatus | null;
  confidence: Confidence;
}
/**
 * This interface was referenced by `Draft`'s JSON-Schema
 * via the `definition` "DraftRelationshipType".
 */
export interface DraftRelationshipType {
  category: Category;
  subtype: Subtype;
  original: Original;
}
/**
 * This interface was referenced by `Draft`'s JSON-Schema
 * via the `definition` "ClosenessFeeling".
 */
export interface ClosenessFeeling {
  id: Id3;
  from: From;
  to: To;
  confidence: Confidence;
  dimension: Dimension;
  level: ClosenessLevel;
}
/**
 * This interface was referenced by `Draft`'s JSON-Schema
 * via the `definition` "AffinityFeeling".
 */
export interface AffinityFeeling {
  id: Id4;
  from: From1;
  to: To1;
  confidence: Confidence;
  dimension: Dimension1;
  level: AffinityLevel;
}
/**
 * This interface was referenced by `Draft`'s JSON-Schema
 * via the `definition` "TrustFeeling".
 */
export interface TrustFeeling {
  id: Id5;
  from: From2;
  to: To2;
  confidence: Confidence;
  dimension: Dimension2;
  level: TrustLevel;
}
/**
 * This interface was referenced by `Draft`'s JSON-Schema
 * via the `definition` "DraftProfileItem".
 */
export interface DraftProfileItem {
  id: Id6;
  person: Person;
  field: ProfileField;
  value: Value;
  confidence: Confidence;
}
/**
 * This interface was referenced by `Draft`'s JSON-Schema
 * via the `definition` "DraftQuestion".
 */
export interface DraftQuestion {
  id: Id7;
  field: QuestionField;
  pair?: Pair1;
  prompt: Prompt;
  options: Options;
  answered?: Answered;
  answer?: Answer;
}
/**
 * This interface was referenced by `Draft`'s JSON-Schema
 * via the `definition` "DraftQuestionOption".
 */
export interface DraftQuestionOption {
  label: Label;
  patch: QuestionPatch;
}
/**
 * The change one answer makes. Only the keys of the question's field may be set:
 * ``types`` (relationship_type); ``met_at`` and / or ``origin`` (met); ``occurred`` (the
 * Entry's 发生日期, re-timing the Draft's dates anchored on it).
 *
 * This interface was referenced by `Draft`'s JSON-Schema
 * via the `definition` "QuestionPatch".
 */
export interface QuestionPatch {
  types?: Types1;
  met_at?: MetAt1;
  origin?: Origin1;
  occurred?: Occurred;
}
