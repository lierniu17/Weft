import { type Ref, type TextareaHTMLAttributes, useCallback, useLayoutEffect, useRef } from "react";
import { cx } from "../../../lib/cx.ts";

export type TextAreaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "rows"> & {
  /** DESIGN.md TextArea.min-rows */
  minRows?: number;
  /** DESIGN.md TextArea.max-rows — beyond this the box scrolls. */
  maxRows?: number;
  /**
   * `bare`: no box of its own — for a composer that draws the box around it (ChatComposer:
   * rounded.xl + shadow.md around the textarea and its controls).
   */
  variant?: "default" | "bare";
  ref?: Ref<HTMLTextAreaElement>;
};

const LOOKS = {
  default:
    "rounded-md border border-neutral-border bg-neutral-bg-container px-md py-sm focus:border-neutral-text-tertiary disabled:bg-neutral-bg-subtle",
  bare: "border-0 bg-transparent p-[0]",
};

/** Multi-line input that grows with its content (1 → 6 rows, then scrolls). */
export function TextArea({
  minRows = 1,
  maxRows = 6,
  variant = "default",
  className,
  onInput,
  value,
  ref,
  ...rest
}: TextAreaProps) {
  const inner = useRef<HTMLTextAreaElement | null>(null);

  const resize = useCallback(() => {
    const el = inner.current;
    if (!el) return;
    const style = getComputedStyle(el);
    const line = Number.parseFloat(style.lineHeight);
    const border =
      Number.parseFloat(style.borderTopWidth) + Number.parseFloat(style.borderBottomWidth);
    const padding = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
    el.style.height = "auto";
    const min = line * minRows + padding + border;
    const max = line * maxRows + padding + border;
    const wanted = el.scrollHeight + border;
    el.style.height = `${Math.min(Math.max(wanted, min), max)}px`;
    el.style.overflowY = wanted > max ? "auto" : "hidden";
  }, [minRows, maxRows]);

  // Controlled value changes (e.g. cleared after send) resize too.
  // biome-ignore lint/correctness/useExhaustiveDependencies: value is the trigger
  useLayoutEffect(resize, [resize, value]);

  return (
    <textarea
      ref={(el) => {
        inner.current = el;
        if (typeof ref === "function") ref(el);
        else if (ref) ref.current = el;
      }}
      rows={minRows}
      value={value}
      onInput={(e) => {
        resize();
        onInput?.(e);
      }}
      className={cx(
        "motion-colors block w-full resize-none text-body-md text-neutral-text-primary outline-none",
        LOOKS[variant],
        "placeholder:text-neutral-text-disabled",
        "disabled:cursor-not-allowed disabled:text-neutral-text-disabled",
        className,
      )}
      {...rest}
    />
  );
}
