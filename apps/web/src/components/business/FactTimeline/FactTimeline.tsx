import type { Confidence } from "../../../contracts/draft.ts";
import { comparePartialDate, formatPartialDate } from "../../../lib/datePrecision.ts";
import { Timeline, type TimelineVariant } from "../../composites/Timeline/Timeline.tsx";
import { ConfidenceBadge } from "../ConfidenceBadge/ConfidenceBadge.tsx";

export type TimelineFact = {
  id: string;
  /** Contract partial date: "2012" | "2012-09" | "2025-03-01". */
  occurred_on: string;
  text: string;
  /** current / invalidated (superseded, kept as history) / unverified (待核实). */
  status: TimelineVariant;
  confidence: Confidence;
};

export type FactTimelineProps = {
  facts: TimelineFact[];
  /** Injected clock for date display. */
  today: Date;
  /** Opens the fact's citation (出处). */
  onFactOpen?: (id: string) => void;
  className?: string;
};

/**
 * Facts between two people on a Timeline, sorted by occurred date (AC-29). Reuses the
 * Timeline current / invalidated / unverified variants; every fact carries its confidence.
 */
export function FactTimeline({ facts, today, onFactOpen, className }: FactTimelineProps) {
  if (facts.length === 0) {
    return <p className="text-body-sm text-neutral-text-secondary">还没有记录</p>;
  }
  const sorted = [...facts].sort((a, b) => comparePartialDate(a.occurred_on, b.occurred_on));
  return (
    <Timeline
      aria-label="事实时间线"
      className={className}
      items={sorted.map((f) => ({
        id: f.id,
        variant: f.status,
        time: formatPartialDate(f.occurred_on, today),
        content: onFactOpen ? (
          <button
            type="button"
            onClick={() => onFactOpen(f.id)}
            className="motion-colors focus-ring cursor-pointer rounded-sm text-left hover:text-primary-6"
          >
            <span data-fact-text="">{f.text}</span>
          </button>
        ) : (
          <span data-fact-text="">{f.text}</span>
        ),
        meta: <ConfidenceBadge level={f.confidence} />,
      }))}
    />
  );
}
