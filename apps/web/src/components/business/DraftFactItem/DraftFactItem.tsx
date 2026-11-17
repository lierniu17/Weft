import type { ReactNode } from "react";
import { FiX } from "react-icons/fi";
import type { Confidence } from "../../../contracts/draft.ts";
import { cx } from "../../../lib/cx.ts";
import { IconButton } from "../../basics/IconButton/IconButton.tsx";
import { ConfidenceBadge } from "../ConfidenceBadge/ConfidenceBadge.tsx";

export type DraftFactItemVariant = "add" | "update" | "unverified";

export type DraftFactItemProps = {
  /** One line, e.g. 「张伟 · 喜欢 钓鱼」. */
  title: string;
  variant?: DraftFactItemVariant;
  /** update / unverified: the value already in the graph. */
  conflictOld?: string;
  /** update: the incoming value (defaults to the end of the title). */
  newValue?: string;
  confidence: Confidence;
  /** Makes the ConfidenceBadge pickable. */
  onConfidenceChange?: (level: Confidence) => void;
  /** Shows ✕ 「删除…」. */
  onRemove?: () => void;
  /** Extra content under the title (relationship type tags and picker). */
  children?: ReactNode;
  className?: string;
};

/**
 * One piece of information a draft will write: add / update (「将更新：旧值 → 新值」) /
 * unverified (conflicts with a more reliable value; kept as 待核实, warning accent).
 */
export function DraftFactItem({
  title,
  variant = "add",
  conflictOld,
  newValue,
  confidence,
  onConfidenceChange,
  onRemove,
  children,
  className,
}: DraftFactItemProps) {
  return (
    <li
      data-draft-item={variant}
      className={cx(
        "flex items-start gap-sm border-b border-neutral-divider py-sm",
        variant === "unverified" && "border-l-[3px] border-l-status-warning-6 pl-sm",
        className,
      )}
    >
      <div className="flex min-w-[0] flex-1 flex-col gap-xs">
        <p className="flex flex-wrap items-center gap-xs text-body-sm text-neutral-text-primary">
          <span className="min-w-[0] break-words">{title}</span>
          {variant === "unverified" && (
            <span className="rounded-full bg-status-warning-1 px-sm text-caption text-status-warning-6">
              待核实
            </span>
          )}
        </p>
        {variant === "update" && conflictOld && (
          <p className="text-caption text-neutral-text-secondary">
            将更新：{conflictOld} → {newValue ?? title.split(" ").pop()}
          </p>
        )}
        {variant === "unverified" && (
          <p className="text-caption text-status-warning-6">
            {conflictOld ? `已有：${conflictOld} · ` : ""}与已有信息冲突且可信度更低，标为待核实
          </p>
        )}
        {children}
      </div>
      <div className="flex shrink-0 items-center gap-xs">
        <ConfidenceBadge level={confidence} onChange={onConfidenceChange} />
        {onRemove && (
          <IconButton aria-label={`删除「${title}」`} icon={<FiX />} size="sm" onClick={onRemove} />
        )}
      </div>
    </li>
  );
}
