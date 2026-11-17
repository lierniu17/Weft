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

/** 出处标记 [n] inside an answer: superscript caption in primary-6; opens the CitationSheet. */
export function CitationMark({ index, summary, onOpen, className }: CitationMarkProps) {
  const mark = (
    <button
      type="button"
      data-citation-mark={index}
      aria-label={`出处 ${index}`}
      onClick={() => onOpen(index)}
      className={cx(
        "motion-colors focus-ring mx-[1px] cursor-pointer rounded-sm px-[2px] align-super text-caption leading-[1] text-primary-6 hover:bg-primary-1",
        className,
      )}
    >
      [{index}]
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
