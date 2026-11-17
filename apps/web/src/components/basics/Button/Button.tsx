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

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "border-transparent bg-primary-6 text-on-primary font-semibold enabled:hover:bg-primary-5 enabled:active:bg-primary-7",
  secondary:
    "bg-neutral-bg-container text-neutral-text-primary border-neutral-border enabled:hover:bg-neutral-bg-layout",
  ghost: "border-transparent bg-transparent text-primary-6 enabled:hover:bg-primary-1",
  danger:
    "bg-neutral-bg-container text-status-error-6 border-status-error-6 enabled:hover:bg-status-error-1",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-[28px] px-sm text-caption",
  md: "h-[36px] px-md text-body-md",
  lg: "h-[44px] px-lg text-body-lg",
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
        "motion-colors focus-ring inline-flex shrink-0 cursor-pointer items-center justify-center gap-xs whitespace-nowrap rounded-sm border",
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
