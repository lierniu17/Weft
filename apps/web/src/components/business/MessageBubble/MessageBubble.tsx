import type { ReactNode } from "react";
import { cx } from "../../../lib/cx.ts";
import { formatOccurredOn, type OccurredOn } from "../../../lib/datePrecision.ts";

export type MessageBubbleVariant = "record" | "question";

export type MessageBubbleProps = {
  variant: MessageBubbleVariant;
  children: ReactNode;
  /** record: the Entry's 发生日期. */
  occurredOn?: OccurredOn;
  /** Injected clock for 「今天」. */
  today: Date;
  className?: string;
};

/** The user's own message, right-aligned, with 「记录 · 11-16」 / 「提问」 underneath. */
export function MessageBubble({
  variant,
  children,
  occurredOn,
  today,
  className,
}: MessageBubbleProps) {
  const meta =
    variant === "question"
      ? "提问"
      : occurredOn
        ? `记录 · ${formatOccurredOn(occurredOn, today)}`
        : "记录";
  return (
    <div className={cx("flex flex-col items-end gap-xs", className)}>
      <div className="flex w-full justify-end">
        <p
          data-bubble={variant}
          className="max-w-[78%] whitespace-pre-wrap break-words rounded-bubble bg-neutral-bg-muted px-md py-sm text-body-md text-neutral-text-primary"
        >
          {children}
        </p>
      </div>
      <p className="text-caption text-neutral-text-tertiary">{meta}</p>
    </div>
  );
}
