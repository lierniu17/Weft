import { cx } from "../../../lib/cx.ts";
import type { ClarifyChoice } from "../../../lib/messages.ts";
import { MessageActions } from "../MessageActions/MessageActions.tsx";

export type ClarifyReplyProps = {
  /** The 反问: one concrete question about the 拿不准 message. */
  question: string;
  /**
   * Its options while it is open (lib/messages `messageActions(...).options`); empty once it
   * is resolved — the question stays, the buttons go.
   */
  options: ClarifyChoice[];
  /** An option was clicked: its index in `clarify.options`. */
  onOption: (index: number) => void;
  /** The option in flight: it spins, the others wait. */
  pending?: number | null;
  className?: string;
};

/**
 * Weft's 反问 to a 拿不准 message (intent clarify AC-1, AC-3): the question as one plain
 * sentence on the page (like ChitchatReply, never boxed), then its 1–3 options
 * (「记下：…」「查：…」) as low-key text buttons. The user clicks one or simply types an answer;
 * once resolved only the question is left. Asking back counts against no quota.
 */
export function ClarifyReply({
  question,
  options,
  onOption,
  pending,
  className,
}: ClarifyReplyProps) {
  return (
    <div data-clarify-reply="" className={cx("flex flex-col items-start gap-xs", className)}>
      <p className="text-body-md text-neutral-text-primary">{question}</p>
      <MessageActions
        label="选一个，或直接回答"
        actions={options}
        onAction={onOption}
        pending={pending}
        wrap
        className="-ml-md"
      />
    </div>
  );
}
