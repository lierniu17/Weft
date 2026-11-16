/**
 * 问答的回答结构 (Answer), as the web app renders it.
 *
 * Owned by batch 2 (问答编排), which will publish a matching JSON Schema under
 * apps/api/contracts/; until then this file is the contract, kept minimal and derived
 * from the spec (「实现决策 → 问答」: 一段文字加一组说法，每个说法关联若干出处).
 *
 *   - `kind` picks the body: text | path (人脉路径) | list (条件筛选) | stat (聚合统计)
 *     | no_answer (图谱里没有相关信息, AC-38).
 *   - `segments` is the answer text split so that each piece may carry the citation
 *     indices that back it; the UI renders a CitationMark [n] after such a piece.
 *   - `citations` are numbered from 1; `index` is what segments and list items refer to.
 *     Dates use the draft schema's partial-date form: "2015" | "2015-06" | "2026-11-16".
 *   - 转述 / 推测 claims say so in the text itself (「据老张说」, AC-37); `told_by` lets
 *     the CitationSheet repeat it next to the ConfidenceBadge.
 */
import type { Confidence } from "./draft.ts";

export type AnswerKind = "text" | "path" | "list" | "stat" | "no_answer";

export type PersonRef = {
  person_id: string;
  name: string;
  /** 本人: rendered as 「我」 with Avatar.self. */
  is_self?: boolean;
};

export type AnswerSegment = {
  text: string;
  /** Citation indices backing this piece of text. */
  citations?: number[];
};

export type Citation = {
  index: number;
  entry_id: string;
  /** Quote of the source Entry (记录原文). */
  entry_excerpt: string;
  /** The Entry's 发生日期 with precision: "2015" | "2015-06" | "2026-11-16". */
  occurred_on: string;
  confidence: Confidence;
  /** Who said it, for 转述 (「老张」 → 「据老张说」). */
  told_by?: string | null;
  /** The relationship this claim is about, for 「查看张伟与李明的关系 ›」. */
  pair?: [PersonRef, PersonRef] | null;
};

export type AnswerListItem = PersonRef & {
  /** 「同学」「客户」… */
  subtitle?: string | null;
  citations: number[];
};

export type AnswerStat = {
  count: number;
  persons: PersonRef[];
};

export type Answer = {
  kind: AnswerKind;
  segments: AnswerSegment[];
  citations: Citation[];
  /** Related persons shown as chips under the answer. */
  persons: PersonRef[];
  /** kind = path: ordered chain from the first person to the last. */
  path?: PersonRef[] | null;
  /** kind = list */
  items?: AnswerListItem[] | null;
  /** kind = stat */
  stat?: AnswerStat | null;
  /** 追问建议, e.g. 「他俩什么时候认识的？」 */
  follow_ups: string[];
};
