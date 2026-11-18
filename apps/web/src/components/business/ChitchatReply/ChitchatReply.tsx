import { cx } from "../../../lib/cx.ts";
import type { MessageAction, MessageActionTarget } from "../../../lib/messages.ts";
import { MessageActions } from "../MessageActions/MessageActions.tsx";

export type ChitchatReplyProps = {
  /** The short reply; when 拿不准 it is 「我没确定你是想记下来还是查询」. */
  reply: string;
  /** 记下来 / 帮我查 (lib/messages `messageActions(...).reply`). */
  actions: MessageAction[];
  onAction: (target: MessageActionTarget) => void;
  pending?: MessageActionTarget | null;
  className?: string;
};

/**
 * Weft's answer to a 无关 message (AC-6): one plain sentence on the page (like answers, never
 * boxed), then 记下来 / 帮我查 so the user can have the message recorded or asked after all.
 * Nothing was recorded, asked or counted.
 */
export function ChitchatReply({
  reply,
  actions,
  onAction,
  pending,
  className,
}: ChitchatReplyProps) {
  return (
    <div data-chitchat-reply="" className={cx("flex flex-col items-start gap-xs", className)}>
      <p className="text-body-md text-neutral-text-primary">{reply}</p>
      <MessageActions
        label="怎么处理这条消息"
        actions={actions}
        onAction={onAction}
        pending={pending}
        className="-ml-md"
      />
    </div>
  );
}
