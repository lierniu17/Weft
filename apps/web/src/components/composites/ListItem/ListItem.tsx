import type { ReactNode } from "react";
import { FiChevronRight } from "react-icons/fi";
import { cx } from "../../../lib/cx.ts";
import { useTruncated } from "../../../lib/useTruncated.ts";
import { Skeleton } from "../../basics/Skeleton/Skeleton.tsx";
import { Tooltip } from "../../basics/Tooltip/Tooltip.tsx";

export type ListItemVariant = "default" | "with-avatar" | "navigational" | "value";

export type ListItemProps = {
  title: string;
  /** Extra text after the title that is never truncated away first (e.g. 「（我）」). */
  titleSuffix?: string;
  subtitle?: ReactNode;
  /** Leading avatar or icon. */
  leading?: ReactNode;
  /** Trailing text or control; `navigational` adds ›, `value` right-aligns `value`. */
  trailing?: ReactNode;
  /** `value` variant: a number shown right-aligned in tabular figures. */
  value?: ReactNode;
  variant?: ListItemVariant;
  /** Whole row is a button. */
  onClick?: () => void;
  /** Whole row is a link. */
  href?: string;
  /** Skeleton placeholder in the row's shape (first load, AC-UI-3). */
  loading?: boolean;
  "aria-current"?: "page" | boolean;
  className?: string;
};

const ROW = "flex min-h-[56px] w-full items-center gap-sm px-md py-sm text-left";

/**
 * List row: leading + title + subtitle + trailing. The whole row is clickable and
 * highlights on hover. A title cut off by the single-line ellipsis reveals its full
 * text in a Tooltip on hover / focus (AC-UI-8).
 */
export function ListItem({
  title,
  titleSuffix,
  subtitle,
  leading,
  trailing,
  value,
  variant = "default",
  onClick,
  href,
  loading,
  className,
  ...aria
}: ListItemProps) {
  const [titleRef, truncated] = useTruncated<HTMLSpanElement>();

  if (loading) {
    return (
      <div aria-hidden="true" data-list-item="loading" className={cx(ROW, className)}>
        {variant === "with-avatar" && <Skeleton variant="avatar" />}
        <div className="flex flex-1 flex-col gap-sm">
          <Skeleton width="40%" />
          <Skeleton width="65%" />
        </div>
      </div>
    );
  }

  const interactive = Boolean(onClick || href);
  const fullTitle = titleSuffix ? `${title}${titleSuffix}` : title;

  const body = (
    <>
      {leading && <span className="flex shrink-0 items-center">{leading}</span>}
      <span className="flex min-w-[0] flex-1 flex-col">
        <span className="flex min-w-[0] items-baseline text-body-md text-neutral-text-primary">
          <span ref={titleRef} data-list-item-title="" className="min-w-[0] truncate">
            {title}
          </span>
          {titleSuffix && <span className="shrink-0">{titleSuffix}</span>}
        </span>
        {subtitle && (
          <span className="truncate text-caption text-neutral-text-secondary">{subtitle}</span>
        )}
      </span>
      {variant === "value" && value !== undefined && (
        <span className="shrink-0 text-right text-body-md text-neutral-text-primary tabular-nums">
          {value}
        </span>
      )}
      {trailing && (
        <span className="flex shrink-0 items-center text-caption text-neutral-text-secondary">
          {trailing}
        </span>
      )}
      {variant === "navigational" && (
        <FiChevronRight aria-hidden="true" className="shrink-0 text-neutral-text-secondary" />
      )}
    </>
  );

  const look = cx(
    ROW,
    interactive &&
      "motion-colors focus-ring cursor-pointer hover:bg-neutral-bg-layout no-underline",
    className,
  );

  const row = href ? (
    <a href={href} data-list-item={variant} className={look} {...aria}>
      {body}
    </a>
  ) : onClick ? (
    <button type="button" data-list-item={variant} onClick={onClick} className={look} {...aria}>
      {body}
    </button>
  ) : (
    // A static row whose title is cut off still needs a focus stop for the Tooltip.
    <div data-list-item={variant} className={look} tabIndex={truncated ? 0 : undefined}>
      {body}
    </div>
  );

  return truncated ? <Tooltip content={fullTitle}>{row}</Tooltip> : row;
}
