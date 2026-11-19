import { cx } from "../../../lib/cx.ts";
import { Button } from "../../basics/Button/Button.tsx";

export type FollowsLineProps = {
  /** The earlier question the answer was read with (lib/messages `followedQuestion`). */
  question: string;
  /** 「不接上文」: answer the question again on its own (one more ask). */
  onDrop: () => void;
  /** The re-answer is running: the button spins. */
  pending?: boolean;
  className?: string;
};

/**
 * 连续追问 (conversation-context AC-10): one low-key line right above an answer that was read
 * with the 上文 — 「接着：老张在哪上班？」 in grey meta text, then 「不接上文」 as a quiet text
 * button (the same as the 纠正 buttons). Never louder than the answer under it.
 */
export function FollowsLine({ question, onDrop, pending, className }: FollowsLineProps) {
  return (
    <div
      data-follows-line=""
      className={cx("flex min-w-[0] flex-wrap items-center gap-x-xs", className)}
    >
      <p className="min-w-[0] text-meta text-neutral-text-tertiary">接着：{question}</p>
      <Button variant="ghost" size="sm" loading={pending} onClick={onDrop} className="-ml-xs">
        不接上文
      </Button>
    </div>
  );
}
