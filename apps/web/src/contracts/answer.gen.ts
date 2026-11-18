/* GENERATED from apps/api/contracts/answer.schema.json by scripts/contracts.ts — do not edit; run `pnpm contracts`. */

/**
 * This interface was referenced by `Answer`'s JSON-Schema
 * via the `definition` "AnswerKind".
 */
export type AnswerKind = "text" | "path" | "list" | "stat" | "no_answer";
export type Text = string;
/**
 * Indices of the citations backing this piece of text
 */
export type Citations = number[];
export type Segments = AnswerSegment[];
export type Index = number;
export type EntryId = string;
/**
 * Quote of the source Entry (记录原文)
 */
export type EntryExcerpt = string;
/**
 * The Entry's 发生日期, with precision
 */
export type OccurredOn = string;
/**
 * This interface was referenced by `Answer`'s JSON-Schema
 * via the `definition` "Confidence".
 */
export type Confidence = "witnessed" | "self_told" | "hearsay" | "inferred";
/**
 * Who said it, for 转述 (「据老张说」)
 */
export type ToldBy = string | null;
/**
 * The relationship this claim is about, for 「查看…的关系」
 */
export type Pair = [PersonRef, PersonRef] | null;
export type PersonId = string;
export type Name = string;
/**
 * 本人: rendered as 「我」
 */
export type IsSelf = boolean;
/**
 * Quotes 我的评价 (AC-23: 「你的评价」)
 */
export type IsOpinion = boolean;
export type Citations1 = Citation[];
/**
 * Related persons, shown as chips (never Self)
 */
export type Persons = PersonRef[];
/**
 * kind = path: ordered chain from the first person to the last
 */
export type Path = PersonRef[] | null;
/**
 * kind = list
 */
export type Items = AnswerListItem[] | null;
export type PersonId1 = string;
export type Name1 = string;
/**
 * 本人: rendered as 「我」
 */
export type IsSelf1 = boolean;
/**
 * e.g. 同学 / 客户
 */
export type Subtitle = string | null;
export type Citations2 = number[];
export type Count = number;
export type Persons1 = PersonRef[];
/**
 * 追问建议, e.g. 「他俩什么时候认识的？」
 */
export type FollowUps = string[];

export interface Answer {
  kind: AnswerKind;
  segments: Segments;
  citations: Citations1;
  persons: Persons;
  path?: Path;
  items?: Items;
  /**
   * kind = stat
   */
  stat?: AnswerStat | null;
  follow_ups: FollowUps;
}
/**
 * This interface was referenced by `Answer`'s JSON-Schema
 * via the `definition` "AnswerSegment".
 */
export interface AnswerSegment {
  text: Text;
  citations?: Citations;
}
/**
 * This interface was referenced by `Answer`'s JSON-Schema
 * via the `definition` "Citation".
 */
export interface Citation {
  index: Index;
  entry_id: EntryId;
  entry_excerpt: EntryExcerpt;
  occurred_on: OccurredOn;
  confidence: Confidence;
  told_by?: ToldBy;
  pair?: Pair;
  is_opinion?: IsOpinion;
}
/**
 * This interface was referenced by `Answer`'s JSON-Schema
 * via the `definition` "PersonRef".
 */
export interface PersonRef {
  person_id: PersonId;
  name: Name;
  is_self?: IsSelf;
}
/**
 * This interface was referenced by `Answer`'s JSON-Schema
 * via the `definition` "AnswerListItem".
 */
export interface AnswerListItem {
  person_id: PersonId1;
  name: Name1;
  is_self?: IsSelf1;
  subtitle?: Subtitle;
  citations: Citations2;
}
/**
 * This interface was referenced by `Answer`'s JSON-Schema
 * via the `definition` "AnswerStat".
 */
export interface AnswerStat {
  count: Count;
  persons: Persons1;
}
