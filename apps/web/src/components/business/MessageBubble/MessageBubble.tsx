import type { ReactNode } from "react";
import { cx } from "../../../lib/cx.ts";
import { formatOccurredOn, type OccurredOn } from "../../../lib/datePrecision.ts";

/**
 * How the message was handled (intent routing): record (记录 · 发生日期), question (提问),
 * both (记录 · 发生日期 · 提问), plain (无关: no meta).
 */
export type MessageBubbleVariant = "record" | "question" | "both" | "plain";

export type MessageBubbleProps = {
  variant: MessageBubbleVariant;
  children: ReactNode;
  /** record / both: the Entry's 发生日期. */
  occurredOn?: OccurredOn;
  /** Injected clock for 「今天」. */
  today: Date;
  /** The low-key 纠正 row (MessageActions), at the end of the meta line. */
  actions?: ReactNode;
  className?: string;
};

function metaText(variant: MessageBubbleVariant, occurredOn: OccurredOn | undefined, today: Date) {
  const record = occurredOn ? `记录 · ${formatOccurredOn(occurredOn, today)}` : "记录";
  switch (variant) {
    case "question":
      return "提问";
    case "record":
      return record;
    case "both":
      return `${record} · 提问`;
    case "plain":
      return null;
  }
}

/**
 * The user's own message, right-aligned, with how it was handled underneath
 * (「记录 · 11-16」 / 「提问」) and, at the end of that line, the 纠正 buttons.
 */
export function MessageBubble({
  variant,
  children,
  occurredOn,
  today,
  actions,
  className,
}: MessageBubbleProps) {
  const meta = metaText(variant, occurredOn, today);
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
      {(meta || actions) && (
        <div className="flex min-h-[20px] items-center justify-end gap-xs">
          {meta && <p className="text-caption text-neutral-text-tertiary">{meta}</p>}
          {actions}
        </div>
      )}
    </div>
  );
}
