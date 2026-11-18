import { type KeyboardEvent, type ReactNode, useState } from "react";
import { FiArrowUp } from "react-icons/fi";
import { cx } from "../../../lib/cx.ts";
import type { OccurredOn } from "../../../lib/datePrecision.ts";
import { Banner } from "../../basics/Banner/Banner.tsx";
import { DatePicker } from "../../basics/DatePicker/DatePicker.tsx";
import { IconButton } from "../../basics/IconButton/IconButton.tsx";
import { SegmentedControl } from "../../basics/SegmentedControl/SegmentedControl.tsx";
import { TextArea } from "../../basics/TextArea/TextArea.tsx";

export type ComposerMode = "record" | "ask";

export type ComposerSubmit =
  | { mode: "record"; text: string; occurredOn: OccurredOn }
  | { mode: "ask"; text: string };

export type ChatComposerProps = {
  /** Controlled mode; omit to let the composer own it (starting at `defaultMode`). */
  mode?: ComposerMode;
  defaultMode?: ComposerMode;
  onModeChange?: (mode: ComposerMode) => void;
  /** Controlled text; omit to let the composer own it. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** 发生日期 of the next Entry (record mode only). */
  occurredOn: OccurredOn;
  onOccurredOnChange: (value: OccurredOn) => void;
  today: Date;
  onSubmit: (payload: ComposerSubmit) => void;
  /** The send button spins and refuses a second submit. */
  sending?: boolean;
  /** Per mode: the quota is used up; the message (with reset time) shows in a warning Banner. */
  exhausted?: Partial<Record<ComposerMode, ReactNode>>;
  className?: string;
};

const MODES = [
  { value: "record", label: "记录" },
  { value: "ask", label: "提问" },
];

const COPY: Record<ComposerMode, { placeholder: string; label: string }> = {
  record: { placeholder: "今天和谁发生了什么？", label: "记录内容" },
  ask: { placeholder: "想问关于谁的什么事？", label: "提问内容" },
};

/**
 * The chat input: 记录 | 提问 switch (the user decides, the system never guesses), the
 * 发生日期 chip in record mode only, an auto-growing box and send. After a question is
 * sent the composer switches back to 记录.
 */
export function ChatComposer({
  mode: modeProp,
  defaultMode = "record",
  onModeChange,
  value: valueProp,
  defaultValue = "",
  onValueChange,
  occurredOn,
  onOccurredOnChange,
  today,
  onSubmit,
  sending,
  exhausted,
  className,
}: ChatComposerProps) {
  const [modeState, setModeState] = useState<ComposerMode>(defaultMode);
  const [valueState, setValueState] = useState(defaultValue);
  const mode = modeProp ?? modeState;
  const value = valueProp ?? valueState;

  const setMode = (next: ComposerMode) => {
    setModeState(next);
    onModeChange?.(next);
  };
  const setValue = (next: string) => {
    setValueState(next);
    onValueChange?.(next);
  };

  const blocked = exhausted?.[mode];
  const canSend = !blocked && !sending && value.trim().length > 0;

  const submit = () => {
    if (!canSend) return;
    const text = value.trim();
    onSubmit(mode === "record" ? { mode, text, occurredOn } : { mode, text });
    setValue("");
    if (mode === "ask") setMode("record");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div data-composer="" className={cx("flex flex-col gap-sm px-md pt-sm pb-md", className)}>
      {blocked && <Banner variant="warning">{blocked}</Banner>}
      {/* The page's focal point (DESIGN.md §2): rounded.xl, a thin border, shadow.md → lg. */}
      <form
        data-composer-box=""
        className={cx(
          "flex flex-col gap-sm rounded-xl border border-neutral-border bg-neutral-bg-container py-sm pr-sm pl-md shadow-md",
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
          variant="bare"
          aria-label={COPY[mode].label}
          placeholder={COPY[mode].placeholder}
          value={value}
          disabled={Boolean(blocked)}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          className="pt-xs pr-sm"
        />
        <div className="flex items-center gap-sm">
          <SegmentedControl
            aria-label="输入类型"
            size="sm"
            options={MODES}
            value={mode}
            onValueChange={(v) => setMode(v as ComposerMode)}
          />
          {mode === "record" && (
            <DatePicker value={occurredOn} onChange={onOccurredOnChange} today={today} />
          )}
          <IconButton
            type="submit"
            aria-label="发送"
            variant="filled"
            size="md"
            icon={<FiArrowUp />}
            loading={sending}
            disabled={!canSend}
            className="ml-auto"
          />
        </div>
      </form>
    </div>
  );
}
