/**
 * 问答的回答结构 (Answer), as the web app renders it.
 *
 * The contract is owned by the API: apps/api/contracts/answer.schema.json (weft.domain.answer),
 * projected into `answer.gen.ts` by `pnpm contracts`. Summary:
 *
 *   - `kind` picks the body: text | path (人脉路径) | list (条件筛选) | stat (聚合统计)
 *     | no_answer (图谱里没有相关信息, AC-38).
 *   - `segments` is the answer text split so that each piece may carry the citation
 *     indices that back it; the UI renders a CitationMark [n] after such a piece.
 *   - `citations` are numbered from 1; `index` is what segments and list items refer to.
 *     `occurred_on` is a partial date with precision: "2015" | "2015-06" | "2026-11-16".
 *   - 转述 / 推测 claims say so in the text itself (「据老张说」, AC-37); `told_by` lets
 *     the CitationSheet repeat it. `is_opinion` marks a quoted 我的评价 (AC-23).
 */
export type {
  Answer,
  AnswerKind,
  AnswerListItem,
  AnswerSegment,
  AnswerStat,
  Citation,
  PersonRef,
} from "./answer.gen.ts";
