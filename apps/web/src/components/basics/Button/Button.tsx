import type { ButtonHTMLAttributes, Ref } from "react";
import { cx } from "../../../lib/cx.ts";
import { Spinner } from "./Spinner.tsx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Spinner + original text; the button is disabled while loading. */
  loading?: boolean;
  ref?: Ref<HTMLButtonElement>;
};

/**
 * DESIGN.md Button: primary is the only ink-filled button (one per screen); secondary is a
 * thin outline; ghost is a neutral text button (links are never coloured); danger is an
 * outline with red text, as quiet as 「取消」 beside it.
 */
const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "border-primary-6 bg-primary-6 text-on-primary enabled:hover:border-primary-5 enabled:hover:bg-primary-5 enabled:active:border-primary-7 enabled:active:bg-primary-7",
  secondary:
    "border-neutral-border bg-neutral-bg-container text-neutral-text-primary enabled:hover:bg-neutral-bg-subtle",
  ghost:
    "border-transparent bg-transparent text-neutral-text-secondary enabled:hover:bg-neutral-bg-muted enabled:hover:text-neutral-text-primary",
  danger:
    "border-neutral-border bg-neutral-bg-container text-status-error-6 enabled:hover:bg-status-error-1",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-[28px] px-md text-caption",
  md: "h-[36px] px-md text-body-sm",
  lg: "h-[44px] px-lg text-body-md",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  type = "button",
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        "motion-press focus-ring inline-flex shrink-0 cursor-pointer items-center justify-center gap-xs whitespace-nowrap rounded-full border font-semibold",
        "disabled:cursor-not-allowed disabled:opacity-45",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}
