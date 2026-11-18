import type { RelationshipStatus } from "../../../contracts/draft.ts";
import { cx } from "../../../lib/cx.ts";
import { relationshipStatusLabel } from "../../../lib/labels.ts";

export type RelationStatusTagProps = {
  status: RelationshipStatus;
  className?: string;
};

/**
 * DESIGN.md RelationStatusTag (AC-3): status tags are the status-1 tint with status-6 text and
 * no outline — active = success, tense = error; distant = the neutral bg-muted tag;
 * lost (contract value `estranged`, 断联) = grey text in a dashed outline, no fill.
 */
const LOOKS: Record<RelationshipStatus, string> = {
  active: "bg-status-success-1 text-status-success-6 border-transparent",
  distant: "bg-neutral-bg-muted text-neutral-text-secondary border-transparent",
  tense: "bg-status-error-1 text-status-error-6 border-transparent",
  estranged: "bg-transparent text-neutral-text-secondary border-dashed border-neutral-border",
};

/** 关系当前状态：活跃 / 疏远 / 紧张 / 断联. */
export function RelationStatusTag({ status, className }: RelationStatusTagProps) {
  return (
    <span
      data-status={status}
      className={cx(
        "inline-flex h-[24px] shrink-0 items-center whitespace-nowrap rounded-full border px-sm text-caption",
        LOOKS[status],
        className,
      )}
    >
      <span className="sr-only">关系状态：</span>
      {relationshipStatusLabel(status)}
    </span>
  );
}
