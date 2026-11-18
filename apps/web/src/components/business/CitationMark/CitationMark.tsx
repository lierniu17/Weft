import { cx } from "../../../lib/cx.ts";
import { Tooltip } from "../../basics/Tooltip/Tooltip.tsx";

export type CitationMarkProps = {
  /** 1-based citation number shown as [n]. */
  index: number;
  /** Short summary revealed on hover / focus (excerpt · confidence · date). */
  summary?: string;
  onOpen: (index: number) => void;
  className?: string;
};

/** 出处标记 inside an answer: a small bg-muted square with the number; opens the CitationSheet. */
export function CitationMark({ index, summary, onOpen, className }: CitationMarkProps) {
  const mark = (
    <button
      type="button"
      data-citation-mark={index}
      aria-label={`出处 ${index}`}
      onClick={() => onOpen(index)}
      className={cx(
        "motion-colors focus-ring mx-[2px] inline-flex h-[18px] min-w-[18px] cursor-pointer items-center justify-center rounded-[6px] bg-neutral-bg-muted px-xs align-[2px] text-caption leading-[1] text-neutral-text-secondary hover:bg-neutral-border hover:text-neutral-text-primary",
        className,
      )}
    >
      {index}
    </button>
  );
  return summary ? (
    <Tooltip content={summary} delayDuration={150}>
      {mark}
    </Tooltip>
  ) : (
    mark
  );
}
