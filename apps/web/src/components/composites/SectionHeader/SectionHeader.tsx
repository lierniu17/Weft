import type { ReactNode } from "react";
import { cx } from "../../../lib/cx.ts";

export type SectionHeaderProps = {
  title: string;
  /** Shown as 「至交 · 2」. */
  count?: number;
  /** Optional trailing action (a ghost Button, a 「历史 ›」 link). */
  action?: ReactNode;
  /** Heading level for the document outline. */
  level?: 2 | 3 | 4;
  id?: string;
  className?: string;
};

/** Section title for a list or page area: caption, text-secondary, optional action. */
export function SectionHeader({
  title,
  count,
  action,
  level = 2,
  id,
  className,
}: SectionHeaderProps) {
  const Heading = `h${level}` as const;
  return (
    <div className={cx("flex min-h-[24px] items-center gap-sm", className)}>
      <Heading
        id={id}
        className="min-w-[0] flex-1 truncate text-caption font-regular text-neutral-text-secondary"
      >
        {title}
        {count !== undefined && ` · ${count}`}
      </Heading>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
