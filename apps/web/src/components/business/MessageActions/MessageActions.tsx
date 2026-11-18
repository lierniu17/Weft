import { cx } from "../../../lib/cx.ts";
import type { MessageAction, MessageActionTarget } from "../../../lib/messages.ts";
import { Button } from "../../basics/Button/Button.tsx";

export type MessageActionsProps = {
  /** What the message offers (lib/messages `messageActions`); nothing renders when empty. */
  actions: MessageAction[];
  onAction: (target: MessageActionTarget) => void;
  /** The action in flight: its button spins and the row waits. */
  pending?: MessageActionTarget | null;
  /** The group's accessible name, e.g. 「纠正」「怎么处理」. */
  label: string;
  className?: string;
};

/**
 * The low-key text-button row of a chat message (intent routing AC-6, AC-10): 改为提问 /
 * 改为记录 under the user's bubble, 记下来 / 帮我查 under the reply to a 无关 message.
 * Neutral grey caption buttons (Button.ghost sm) — never coloured, never
 * louder than the message itself.
 */
export function MessageActions({
  actions,
  onAction,
  pending,
  label,
  className,
}: MessageActionsProps) {
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
          disabled={Boolean(pending) && pending !== a.target}
          onClick={() => onAction(a.target)}
        >
          {a.label}
        </Button>
      ))}
    </fieldset>
  );
}
