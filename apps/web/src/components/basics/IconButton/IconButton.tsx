import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { cx } from "../../../lib/cx.ts";
import { Spinner } from "../Button/Spinner.tsx";

export type IconButtonVariant = "filled" | "plain";
export type IconButtonSize = "sm" | "md" | "lg";

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  /** Required: an icon-only button has no other accessible name. */
  "aria-label": string;
  icon: ReactNode;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  /** Shows a spinner in place of the icon (ChatComposer `sending`). */
  loading?: boolean;
  ref?: Ref<HTMLButtonElement>;
};

/** filled = the round ink send button; plain = neutral grey icon, bg-muted on hover. */
const VARIANTS: Record<IconButtonVariant, string> = {
  filled: "bg-primary-6 text-on-primary enabled:hover:bg-primary-5 enabled:active:bg-primary-7",
  plain:
    "bg-transparent text-neutral-text-secondary enabled:hover:bg-neutral-bg-muted enabled:hover:text-neutral-text-primary",
};

/** Disabled: the filled send button fades to 25% (DESIGN.md §2); plain icons go grey. */
const DISABLED: Record<IconButtonVariant, string> = {
  filled: "disabled:cursor-not-allowed disabled:opacity-25",
  plain: "disabled:cursor-not-allowed disabled:text-neutral-text-disabled",
};

const SIZES: Record<IconButtonSize, string> = {
  sm: "size-[28px] text-body-sm",
  md: "size-[36px] text-body-lg",
  lg: "size-[44px] text-h2",
};

export function IconButton({
  icon,
  variant = "plain",
  size = "md",
  loading = false,
  disabled,
  type = "button",
  className,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        "motion-press focus-ring inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full",
        VARIANTS[variant],
        SIZES[size],
        !loading && DISABLED[variant],
        loading && "cursor-progress",
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner /> : <span aria-hidden="true">{icon}</span>}
    </button>
  );
}
