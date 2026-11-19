import { type FormEvent, useId, useState } from "react";
import type { DraftQuestion, QuestionAnswer } from "../../../contracts/draft.ts";
import { cx } from "../../../lib/cx.ts";
import { Button } from "../../basics/Button/Button.tsx";
import { Chip } from "../../basics/Chip/Chip.tsx";
import { Input } from "../../basics/Input/Input.tsx";

export type DraftQuestionItemProps = {
  /** An unanswered 补充追问 of the draft. */
  question: DraftQuestion;
  /** An option was clicked (its index), or a typed answer was sent (自己填). */
  onAnswer: (answer: QuestionAnswer) => void;
  /** This question's answer is being applied: its options wait and the input is read-only. */
  pending?: boolean;
  /** Another question's answer is in flight: nothing can be clicked here meanwhile. */
  disabled?: boolean;
  /** The typed answer was not understood (「没理解这个回答，可以直接在草稿里改」). */
  hint?: string | null;
  className?: string;
};

/**
 * 补充追问 in the review sheet (conversation-context AC-5, AC-6, AC-7): the question as one
 * plain sentence, its 2–4 candidates as chips (like the candidates of a 需选择 person), and
 * 「自己填」, which opens a single-line input in place; 确定 (or Enter) sends the typed answer.
 * A clicked candidate changes the draft at once; a typed one is read by the server, and when
 * it is not understood the hint stays under the input and nothing changes.
 */
export function DraftQuestionItem({
  question,
  onAnswer,
  pending = false,
  disabled = false,
  hint,
  className,
}: DraftQuestionItemProps) {
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState("");
  const inputId = useId();
  const busy = pending || disabled;
  const typed = text.trim();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (typed && !busy) onAnswer({ text: typed });
  };

  return (
    <li data-draft-question={question.id} className={cx("flex flex-col gap-sm py-sm", className)}>
      <p className="text-body-md text-neutral-text-primary">{question.prompt}</p>
      <fieldset
        aria-label={question.prompt}
        aria-busy={pending || undefined}
        className="m-[0] flex min-w-[0] flex-wrap gap-sm border-0 p-[0]"
      >
        {question.options.map((o, i) => (
          <Chip key={o.label} disabled={busy} onClick={() => onAnswer({ option: i })}>
            {o.label}
          </Chip>
        ))}
        <Chip
          variant={typing ? "selected" : "neutral"}
          aria-expanded={typing}
          disabled={busy && !typing}
          onClick={() => setTyping((t) => !t)}
        >
          自己填
        </Chip>
      </fieldset>
      {typing && (
        <form onSubmit={submit} className="flex items-start gap-sm">
          <Input
            id={inputId}
            aria-label={`自己填：${question.prompt}`}
            placeholder="用自己的话说"
            value={text}
            maxLength={200}
            readOnly={pending}
            error={hint ?? undefined}
            onChange={(e) => setText(e.target.value)}
            className="min-w-[0] flex-1"
            autoFocus
          />
          <Button
            type="submit"
            variant="secondary"
            size="md"
            loading={pending}
            disabled={!typed}
            className="h-[40px]!"
          >
            确定
          </Button>
        </form>
      )}
    </li>
  );
}
