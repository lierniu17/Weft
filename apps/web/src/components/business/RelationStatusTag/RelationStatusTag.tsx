import type { RelationshipStatus } from "../../../contracts/draft.ts";
import { cx } from "../../../lib/cx.ts";
import { relationshipStatusLabel } from "../../../lib/labels.ts";

export type RelationStatusTagProps = {
  status: RelationshipStatus;
  className?: string;
};

/**
 * DESIGN.md RelationStatusTag: active = green chip, distant = grey, tense = Chip.danger,
 * lost (contract value `estranged`, 断联) = grey with a dashed border.
 */
const LOOKS: Record<RelationshipStatus, string> = {
  active: "bg-status-success-1 text-status-success-6 border-status-success-1",
  distant: "bg-neutral-bg-layout text-neutral-text-secondary border-neutral-border",
  tense: "bg-status-error-1 text-status-error-6 border-status-error-6",
  estranged: "bg-neutral-bg-layout text-neutral-text-secondary border-dashed border-neutral-border",
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
