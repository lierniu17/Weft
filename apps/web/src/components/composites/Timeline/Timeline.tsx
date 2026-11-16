import type { ReactNode } from "react";
import { cx } from "../../../lib/cx.ts";

export type TimelineVariant = "current" | "invalidated" | "unverified";

export type TimelineItem = {
  id: string;
  /** Time label, e.g. 「2012」「2026-11」. */
  time: ReactNode;
  content: ReactNode;
  variant?: TimelineVariant;
  /** Trailing extras (a ConfidenceBadge). */
  meta?: ReactNode;
};

export type TimelineProps = {
  items: TimelineItem[];
  "aria-label": string;
  className?: string;
};

const DOT: Record<TimelineVariant, string> = {
  current: "bg-primary-6",
  invalidated: "bg-neutral-text-disabled",
  unverified: "bg-status-warning-6",
};

/** The dot colour is a hint only; the state is also spelled out. */
const STATE_TEXT: Record<TimelineVariant, string | null> = {
  current: null,
  invalidated: "已失效",
  unverified: "待核实",
};

/** Vertical timeline: dot + time + content; dot colour marks current / invalidated / unverified. */
export function Timeline({ items, className, ...aria }: TimelineProps) {
  return (
    <ol {...aria} className={cx("flex flex-col", className)}>
      {items.map((item, i) => {
        const variant = item.variant ?? "current";
        const state = STATE_TEXT[variant];
        return (
          <li key={item.id} data-timeline-item={variant} className="relative flex gap-sm pb-md">
            {i < items.length - 1 && (
              <span
                aria-hidden="true"
                className="absolute top-[14px] bottom-[0] left-[4px] w-px bg-neutral-divider"
              />
            )}
            <span
              aria-hidden="true"
              data-timeline-dot=""
              className={cx("mt-[6px] size-[10px] shrink-0 rounded-full", DOT[variant])}
            />
            <span className="w-[72px] shrink-0 text-caption leading-[22px] text-neutral-text-secondary tabular-nums">
              {item.time}
            </span>
            <span className="flex min-w-[0] flex-1 flex-wrap items-center gap-xs">
              <span
                className={cx(
                  "text-body-sm leading-[22px]",
                  variant === "invalidated"
                    ? "text-neutral-text-secondary line-through"
                    : "text-neutral-text-primary",
                )}
              >
                {item.content}
              </span>
              {state && (
                <span
                  className={cx(
                    "text-caption",
                    variant === "unverified"
                      ? "text-status-warning-6"
                      : "text-neutral-text-secondary",
                  )}
                >
                  · {state}
                </span>
              )}
              {item.meta}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
