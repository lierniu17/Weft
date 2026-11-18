import { cx } from "../../../lib/cx.ts";
import type { MessageActionTarget } from "../../../lib/messages.ts";
import { Button } from "../../basics/Button/Button.tsx";

export type MessageActionsProps<T extends string | number = MessageActionTarget> = {
  /** What the message offers (lib/messages `messageActions`); nothing renders when empty. */
  actions: { target: T; label: string }[];
  onAction: (target: T) => void;
  /** The action in flight: its button spins and the row waits. */
  pending?: T | null;
  /** The group's accessible name, e.g. 「纠正」「怎么处理」. */
  label: string;
  /** Long labels (反问 options) wrap instead of running off a phone screen. */
  wrap?: boolean;
  className?: string;
};

/**
 * The low-key text-button row of a chat message (intent routing AC-6, AC-10): 改为提问 /
 * 改为记录 under the user's bubble, 记下来 / 帮我查 under the reply to a 无关 message, the
 * options of a 反问 (intent clarify AC-1).
 * Neutral grey caption buttons (Button.ghost sm) — never coloured, never
 * louder than the message itself.
 */
export function MessageActions<T extends string | number = MessageActionTarget>({
  actions,
  onAction,
  pending,
  label,
  wrap = false,
  className,
}: MessageActionsProps<T>) {
  if (actions.length === 0) return null;
  return (
    <fieldset
      aria-label={label}
      data-message-actions=""
      className={cx("m-[0] flex min-w-[0] flex-wrap items-center gap-xs border-0 p-[0]", className)}
    >
      {actions.map((a) => (
        <Button
          key={a.target}
          variant="ghost"
          size="sm"
          loading={pending === a.target}
          disabled={pending != null && pending !== a.target}
          onClick={() => onAction(a.target)}
          className={
            wrap
              ? "h-auto! min-h-[28px] max-w-full shrink! py-[4px] text-left whitespace-normal!"
              : undefined
          }
        >
          {a.label}
        </Button>
      ))}
    </fieldset>
  );
}
