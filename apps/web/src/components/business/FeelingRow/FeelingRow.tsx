import { useId, useState } from "react";
import { FiChevronDown } from "react-icons/fi";
import type { Confidence, FeelingDimension } from "../../../contracts/draft.ts";
import { cx } from "../../../lib/cx.ts";
import { comparePartialDate, formatPartialDate } from "../../../lib/datePrecision.ts";
import { feelingDimensionLabel, feelingLevelLabel } from "../../../lib/labels.ts";
import { Timeline } from "../../composites/Timeline/Timeline.tsx";
import { ConfidenceBadge } from "../ConfidenceBadge/ConfidenceBadge.tsx";

export type FeelingChange = {
  id: string;
  level: string;
  /** Contract partial date of the Entry that recorded the change. */
  occurred_on: string;
  confidence: Confidence;
};

export type FeelingDimensionValue = {
  dimension: FeelingDimension;
  /** Current level (the latest change). */
  level: string;
  confidence: Confidence;
  history?: FeelingChange[];
};

export type FeelingRowProps = {
  /** Who feels. */
  from: string;
  /** Whom the feeling is about. */
  to: string;
  /** Only recorded dimensions; an empty list renders 「（未记录）」. */
  dimensions: FeelingDimensionValue[];
  today: Date;
  defaultExpanded?: boolean;
  className?: string;
};

const ORDER: FeelingDimension[] = ["closeness", "affinity", "trust"];

/** 「疏远」「反感」「信任高」: trust keeps its dimension name so 高 / 中 / 低 read clearly. */
function levelText(d: FeelingDimension, level: string) {
  const label = feelingLevelLabel(d, level);
  return d === "trust" ? `${feelingDimensionLabel(d)}${label}` : label;
}

/** One direction of 感受 (A → B): current levels, with the change history on demand (AC-30). */
export function FeelingRow({
  from,
  to,
  dimensions,
  today,
  defaultExpanded = false,
  className,
}: FeelingRowProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const historyId = useId();
  const direction = `${from} → ${to}`;
  const sorted = ORDER.flatMap((d) => dimensions.filter((x) => x.dimension === d));
  const changes = sorted
    .flatMap((d) => (d.history ?? []).map((h) => ({ ...h, dimension: d.dimension })))
    .sort((a, b) => comparePartialDate(a.occurred_on, b.occurred_on));

  return (
    <div data-feeling-row="" className={cx("flex flex-col gap-sm py-sm", className)}>
      <div className="flex items-center gap-sm">
        <p className="min-w-[0] flex-1 text-body-md text-neutral-text-primary">
          <span className="font-semibold">{direction}</span>：
          {sorted.length === 0 ? (
            <span className="text-neutral-text-secondary">（未记录）</span>
          ) : (
            sorted.map((d) => levelText(d.dimension, d.level)).join(" · ")
          )}
        </p>
        {changes.length > 0 && (
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={historyId}
            onClick={() => setExpanded((v) => !v)}
            className="motion-colors focus-ring flex shrink-0 cursor-pointer items-center gap-xs rounded-sm px-xs text-caption text-neutral-text-secondary hover:bg-neutral-bg-muted hover:text-neutral-text-primary"
          >
            历史
            <FiChevronDown
              aria-hidden="true"
              className={cx("motion-colors", expanded && "rotate-180")}
            />
          </button>
        )}
      </div>
      {expanded && changes.length > 0 && (
        <div id={historyId}>
          <Timeline
            aria-label={`${direction} 的感受变化`}
            items={changes.map((c) => ({
              id: c.id,
              time: formatPartialDate(c.occurred_on, today),
              content: `${feelingDimensionLabel(c.dimension)} ${feelingLevelLabel(c.dimension, c.level)}`,
              meta: <ConfidenceBadge level={c.confidence} />,
            }))}
          />
        </div>
      )}
    </div>
  );
}
