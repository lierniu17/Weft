import type { ReactNode } from "react";
import { FiX } from "react-icons/fi";
import type { Confidence } from "../../../contracts/draft.ts";
import { cx } from "../../../lib/cx.ts";
import { IconButton } from "../../basics/IconButton/IconButton.tsx";
import { ConfidenceBadge } from "../ConfidenceBadge/ConfidenceBadge.tsx";

export type DraftFactItemVariant = "add" | "update" | "unverified";

export type DraftFactItemProps = {
  /** The item as a natural sentence, e.g. 「张伟喜欢钓鱼」 (lib/draft itemSentence). */
  title: string;
  variant?: DraftFactItemVariant;
  /** update / unverified: the value already in the graph. */
  conflictOld?: string;
  /** update: the incoming value (defaults to the end of the title). */
  newValue?: string;
  confidence: Confidence;
  /** Makes the whole line pickable: tapping it changes the confidence. */
  onConfidenceChange?: (level: Confidence) => void;
  /** Shows ✕ 「删除…」. */
  onRemove?: () => void;
  /** Extra content under the title (relationship type tags and picker). */
  children?: ReactNode;
  className?: string;
};

/**
 * One piece of information a draft will write, as a sentence with its confidence as
 * trailing grey meta: 「张伟喜欢钓鱼 · 本人说」 (style refresh AC-8). add / update
 * (「将更新：旧值 → 新值」) / unverified (conflicts with a more reliable value; kept as
 * 待核实, in warning text).
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
    <li data-draft-item={variant} className={cx("flex items-start gap-xs py-xs", className)}>
      <div className="flex min-w-[0] flex-1 flex-col gap-xs">
        <ConfidenceBadge level={confidence} onChange={onConfidenceChange} sentence={title} />
        {variant === "update" && conflictOld && (
          <p className="text-meta text-neutral-text-tertiary">
            将更新：{conflictOld} → {newValue ?? title}
          </p>
        )}
        {variant === "unverified" && (
          <p className="flex flex-wrap items-center gap-xs text-meta text-status-warning-6">
            <span className="inline-flex h-[20px] items-center rounded-full bg-status-warning-1 px-sm text-caption">
              待核实
            </span>
            {conflictOld ? `已有：${conflictOld} · ` : ""}与已有信息冲突且可信度更低
          </p>
        )}
        {children}
      </div>
      {onRemove && (
        <IconButton
          aria-label={`删除「${title}」`}
          icon={<FiX />}
          size="sm"
          onClick={onRemove}
          className="mt-[2px] shrink-0"
        />
      )}
    </li>
  );
}
