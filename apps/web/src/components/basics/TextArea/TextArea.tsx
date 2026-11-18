import { type Ref, type TextareaHTMLAttributes, useCallback, useLayoutEffect, useRef } from "react";
import { cx } from "../../../lib/cx.ts";

export type TextAreaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "rows"> & {
  /** DESIGN.md TextArea.min-rows */
  minRows?: number;
  /** DESIGN.md TextArea.max-rows — beyond this the box scrolls. */
  maxRows?: number;
  ref?: Ref<HTMLTextAreaElement>;
};

/** Multi-line input that grows with its content (1 → 6 rows, then scrolls). */
export function TextArea({
  minRows = 1,
  maxRows = 6,
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
        "motion-colors block w-full resize-none rounded-md border border-neutral-border bg-neutral-bg-container px-md py-sm text-body-md text-neutral-text-primary outline-none",
        "placeholder:text-neutral-text-disabled focus:border-neutral-text-tertiary",
        "disabled:cursor-not-allowed disabled:bg-neutral-bg-subtle disabled:text-neutral-text-disabled",
        className,
      )}
      {...rest}
    />
  );
}
