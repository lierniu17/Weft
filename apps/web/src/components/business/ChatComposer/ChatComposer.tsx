import { type KeyboardEvent, type ReactNode, type Ref, useState } from "react";
import { FiArrowUp } from "react-icons/fi";
import { cx } from "../../../lib/cx.ts";
import { Banner } from "../../basics/Banner/Banner.tsx";
import { IconButton } from "../../basics/IconButton/IconButton.tsx";
import { TextArea } from "../../basics/TextArea/TextArea.tsx";

export type ChatComposerProps = {
  /** Controlled text; omit to let the composer own it. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** The trimmed text; the box is cleared. */
  onSubmit: (text: string) => void;
  /** The send button spins and refuses a second submit. */
  sending?: boolean;
  /** Sending is impossible (both quotas used up): input and send disabled, warning Banner. */
  blocked?: ReactNode;
  /** One quota is used up: a warning Banner; sending still works (the other kind may be fine). */
  notice?: ReactNode;
  inputRef?: Ref<HTMLTextAreaElement>;
  className?: string;
};

/**
 * The chat input (intent routing, ADR 0005): one auto-growing box and send. There is no
 * 记录 / 提问 switch and no date: what a message is, and when it happened, is read from
 * the message itself.
 */
export function ChatComposer({
  value: valueProp,
  defaultValue = "",
  onValueChange,
  onSubmit,
  sending,
  blocked,
  notice,
  inputRef,
  className,
}: ChatComposerProps) {
  const [valueState, setValueState] = useState(defaultValue);
  const value = valueProp ?? valueState;

  const setValue = (next: string) => {
    setValueState(next);
    onValueChange?.(next);
  };

  const canSend = !blocked && !sending && value.trim().length > 0;

  const submit = () => {
    if (!canSend) return;
    onSubmit(value.trim());
    setValue("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const banner = blocked ?? notice;
  return (
    <div data-composer="" className={cx("flex flex-col gap-sm px-md pt-sm pb-md", className)}>
      {banner && <Banner variant="warning">{banner}</Banner>}
      {/* The page's focal point (DESIGN.md §2): rounded.xl, a thin border, shadow.md → lg. */}
      <form
        data-composer-box=""
        className={cx(
          "flex items-end gap-sm rounded-xl border border-neutral-border bg-neutral-bg-container py-sm pr-sm pl-md shadow-md",
          "transition-[box-shadow,border-color] duration-[var(--motion-base)] ease-[var(--motion-easing-standard)]",
          "focus-within:border-neutral-text-disabled focus-within:shadow-lg",
          Boolean(blocked) && "bg-neutral-bg-subtle",
        )}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <TextArea
          ref={inputRef}
          variant="bare"
          aria-label="消息内容"
          placeholder="记点什么，或问点什么……"
          value={value}
          disabled={Boolean(blocked)}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          className="flex-1 self-center py-xs pr-sm"
        />
        <IconButton
          type="submit"
          aria-label="发送"
          variant="filled"
          size="md"
          icon={<FiArrowUp />}
          loading={sending}
          disabled={!canSend}
        />
      </form>
    </div>
  );
}
