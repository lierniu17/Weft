import { type KeyboardEvent, useRef } from "react";
import { cx } from "../../../lib/cx.ts";

export type SegmentedOption = { value: string; label: string };

export type SegmentedControlProps = {
  /** Names the radiogroup for assistive tech. */
  "aria-label": string;
  options: SegmentedOption[];
  value: string;
  onValueChange: (value: string) => void;
  size?: "sm" | "md";
  disabled?: boolean;
  className?: string;
};

const NEXT_KEYS = new Set(["ArrowRight", "ArrowDown"]);
const PREV_KEYS = new Set(["ArrowLeft", "ArrowUp"]);

/**
 * Two or three mutually exclusive options, exposed as a WAI-ARIA radiogroup:
 * one tab stop (the checked option), arrow keys move and select.
 */
export function SegmentedControl({
  options,
  value,
  onValueChange,
  size = "md",
  disabled,
  className,
  ...aria
}: SegmentedControlProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const checkedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = NEXT_KEYS.has(e.key) ? 1 : PREV_KEYS.has(e.key) ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (index + step + options.length) % options.length;
    onValueChange(options[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      {...aria}
      aria-disabled={disabled || undefined}
      className={cx(
        "inline-flex items-stretch rounded-full bg-neutral-bg-layout p-xs",
        size === "sm" ? "h-[28px]" : "h-[32px]",
        className,
      )}
    >
      {options.map((o, i) => {
        const checked = i === checkedIndex;
        return (
          // biome-ignore lint/a11y/useSemanticElements: WAI-ARIA APG radiogroup (roving tabindex); native radios cannot render as segments without being hidden
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            disabled={disabled}
            onClick={() => !checked && onValueChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cx(
              "motion-colors focus-ring flex cursor-pointer items-center rounded-full px-md",
              size === "sm" ? "text-caption" : "text-body-sm",
              checked
                ? "bg-neutral-bg-container font-semibold text-primary-6 shadow-card"
                : "text-neutral-text-secondary",
              "disabled:cursor-not-allowed disabled:text-neutral-text-disabled",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
