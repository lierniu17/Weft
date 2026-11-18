import { Fragment } from "react";
import { FiShare2 } from "react-icons/fi";
import type { Answer, AnswerListItem, Citation, PersonRef } from "../../../contracts/answer.ts";
import { confidenceLabel } from "../../../lib/confidence.ts";
import { cx } from "../../../lib/cx.ts";
import { formatPartialDate } from "../../../lib/datePrecision.ts";
import { answerHighlight } from "../../../lib/graph/answerHighlight.ts";
import { useTruncated } from "../../../lib/useTruncated.ts";
import { Button } from "../../basics/Button/Button.tsx";
import { Chip } from "../../basics/Chip/Chip.tsx";
import { Tooltip } from "../../basics/Tooltip/Tooltip.tsx";
import { CitationMark } from "../CitationMark/CitationMark.tsx";
import { PathChain } from "../PathChain/PathChain.tsx";

export type AnswerCardProps = {
  answer: Answer;
  /** Injected clock for citation summaries. */
  today: Date;
  onCitationOpen: (index: number) => void;
  onPersonClick: (person: PersonRef) => void;
  onFollowUp: (question: string) => void;
  /** no_answer: 「去记一笔」 puts the user back in the composer. */
  onRecord: () => void;
  /** 「在图上查看」 (graph-viz AC-16): shown when the answer is about people. */
  onShowOnGraph?: () => void;
  className?: string;
};

function summary(c: Citation | undefined, today: Date): string | undefined {
  if (!c) return undefined;
  const who = c.told_by ? ` · 据${c.told_by}说` : "";
  return `「${c.entry_excerpt}」· ${confidenceLabel(c.confidence)}${who} · ${formatPartialDate(c.occurred_on, today)}`;
}

function Marks({
  indices,
  answer,
  today,
  onOpen,
}: {
  indices: number[] | undefined;
  answer: Answer;
  today: Date;
  onOpen: (index: number) => void;
}) {
  return (
    <>
      {(indices ?? []).map((i) => (
        <CitationMark
          key={i}
          index={i}
          summary={summary(
            answer.citations.find((c) => c.index === i),
            today,
          )}
          onOpen={onOpen}
        />
      ))}
    </>
  );
}

function ListRow({
  item,
  answer,
  today,
  onPersonClick,
  onCitationOpen,
}: {
  item: AnswerListItem;
  answer: Answer;
  today: Date;
  onPersonClick: (p: PersonRef) => void;
  onCitationOpen: (i: number) => void;
}) {
  const [nameRef, truncated] = useTruncated<HTMLSpanElement>();
  const button = (
    <button
      type="button"
      onClick={() => onPersonClick(item)}
      className="motion-colors focus-ring flex min-w-[0] cursor-pointer items-baseline rounded-sm text-left text-body-md text-neutral-text-primary decoration-neutral-border underline-offset-4 hover:underline"
    >
      <span ref={nameRef} className="min-w-[0] truncate">
        {item.name}
      </span>
      {item.subtitle && (
        <span className="shrink-0 text-neutral-text-tertiary"> · {item.subtitle}</span>
      )}
    </button>
  );
  return (
    <li className="flex min-w-[0] items-baseline">
      {truncated ? <Tooltip content={item.name}>{button}</Tooltip> : button}
      <Marks indices={item.citations} answer={answer} today={today} onOpen={onCitationOpen} />
    </li>
  );
}

/**
 * 问答的回答, set straight on the white page — no card, border or shadow (style refresh
 * AC-4, AC-7): body text with CitationMarks, a kind-specific body (path / list / stat /
 * no-answer), then related person chips and follow-up suggestions.
 */
export function AnswerCard({
  answer,
  today,
  onCitationOpen,
  onPersonClick,
  onFollowUp,
  onRecord,
  onShowOnGraph,
  className,
}: AnswerCardProps) {
  const noAnswer = answer.kind === "no_answer";
  // 我 may be in the path chain, never a related-person chip
  const related = answer.persons.filter((p) => !p.is_self);
  const segments =
    noAnswer && answer.segments.length === 0 ? [{ text: "图谱里没有相关信息。" }] : answer.segments;

  return (
    <article
      aria-label="回答"
      data-answer-kind={answer.kind}
      className={cx("flex flex-col gap-md py-xs", className)}
    >
      <p className="text-body-md leading-[26px] text-neutral-text-primary">
        {segments.map((s, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: segments are an ordered, static split of one text
          <Fragment key={i}>
            {s.text}
            <Marks indices={s.citations} answer={answer} today={today} onOpen={onCitationOpen} />
          </Fragment>
        ))}
      </p>

      {answer.kind === "path" && answer.path && (
        <PathChain persons={answer.path} onPersonClick={onPersonClick} />
      )}

      {answer.kind === "list" && answer.items && (
        <ul aria-label="人物列表" className="flex flex-col gap-xs">
          {answer.items.map((item) => (
            <ListRow
              key={item.person_id}
              item={item}
              answer={answer}
              today={today}
              onPersonClick={onPersonClick}
              onCitationOpen={onCitationOpen}
            />
          ))}
        </ul>
      )}

      {answer.kind === "stat" && answer.stat && (
        <div className="flex flex-col gap-sm">
          <div className="flex items-baseline justify-between gap-sm">
            <span className="text-meta text-neutral-text-tertiary">人数</span>
            <span className="text-right">
              <span data-stat-count="" className="block text-right text-h1 tabular-nums">
                {answer.stat.count}
              </span>
            </span>
          </div>
          <ul aria-label="统计到的人物" className="flex flex-wrap gap-xs">
            {answer.stat.persons.map((p) => (
              <li key={p.person_id}>
                <Chip avatar={p.name} onClick={() => onPersonClick(p)}>
                  {p.name}
                </Chip>
              </li>
            ))}
          </ul>
        </div>
      )}

      {noAnswer && (
        <div className="flex flex-col items-start gap-sm">
          <p className="text-meta text-neutral-text-tertiary">
            知道的话，直接告诉我，我帮你记下来。
          </p>
          <Button variant="secondary" onClick={onRecord}>
            去记一笔
          </Button>
        </div>
      )}

      {related.length > 0 && (
        <ul aria-label="相关人物" className="flex flex-wrap gap-xs">
          {related.map((p) => (
            <li key={p.person_id}>
              <Chip avatar={p.name} onClick={() => onPersonClick(p)} aria-label={`查看${p.name}`}>
                {p.name}
              </Chip>
            </li>
          ))}
        </ul>
      )}

      {onShowOnGraph && answerHighlight(answer).kind !== "none" && (
        <Button variant="ghost" size="sm" onClick={onShowOnGraph} className="-ml-sm self-start">
          <FiShare2 aria-hidden="true" />
          在图上查看
        </Button>
      )}

      {answer.follow_ups.length > 0 && (
        <ul aria-label="追问建议" className="flex flex-col gap-xs">
          {answer.follow_ups.map((q) => (
            <li key={q}>
              <button
                type="button"
                onClick={() => onFollowUp(q)}
                className="motion-colors focus-ring cursor-pointer rounded-sm text-left text-body-sm text-neutral-text-secondary hover:text-neutral-text-primary"
              >
                相关问题：{q}
              </button>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
