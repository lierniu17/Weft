import type { Category } from "../../../contracts/draft.ts";
import { cx } from "../../../lib/cx.ts";
import { categoryLabel } from "../../../lib/labels.ts";

export type RelationshipTypeTagProps = {
  category: Category;
  subtype: string;
  /** The Entry's own wording (「铁哥们」); shown when it differs from the subtype. */
  original?: string | null;
  /** A user-defined subtype (自定义小类): carries a small 「自定义」 mark. */
  custom?: boolean;
  className?: string;
};

/** 关系类型：大类 · 小类, with the original wording. Looks like Chip.neutral. */
export function RelationshipTypeTag({
  category,
  subtype,
  original,
  custom,
  className,
}: RelationshipTypeTagProps) {
  const quote = original && original !== subtype ? original : null;
  return (
    <span
      data-relationship-type=""
      className={cx(
        "inline-flex h-[24px] max-w-full shrink-0 items-center gap-xs whitespace-nowrap rounded-full border border-neutral-border bg-neutral-bg-container px-sm text-caption text-neutral-text-primary",
        className,
      )}
    >
      <span className="truncate">
        {categoryLabel(category)} · {subtype}
        {quote && <span className="text-neutral-text-secondary"> · “{quote}”</span>}
      </span>
      {custom && (
        <span className="rounded-full bg-neutral-bg-container px-xs text-neutral-text-secondary">
          自定义
        </span>
      )}
    </span>
  );
}
