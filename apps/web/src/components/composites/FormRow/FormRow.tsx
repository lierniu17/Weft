import type { ReactNode } from "react";
import { cx } from "../../../lib/cx.ts";

export type FormRowProps = {
  label: string;
  /** id of the control the label names. */
  htmlFor: string;
  children: ReactNode;
  className?: string;
};

/**
 * Form row: label right-aligned (max 96px) + control left-aligned, gap spacing.sm.
 * Below 360px of available width the label stacks above the control. A container query,
 * so the row adapts to the column it sits in, not just the viewport.
 */
export function FormRow({ label, htmlFor, children, className }: FormRowProps) {
  return (
    <div className={cx("@container", className)}>
      <div
        data-form-row=""
        className="flex items-start gap-sm @max-[359px]:flex-col @max-[359px]:items-stretch @max-[359px]:gap-xs"
      >
        <label
          htmlFor={htmlFor}
          className="w-[96px] max-w-[96px] shrink-0 pt-sm text-right text-body-sm text-neutral-text-secondary @max-[359px]:w-auto @max-[359px]:pt-[0] @max-[359px]:text-left"
        >
          {label}
        </label>
        <div className="min-w-[0] flex-1">{children}</div>
      </div>
    </div>
  );
}
