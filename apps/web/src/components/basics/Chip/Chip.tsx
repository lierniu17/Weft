import type { ReactNode, Ref } from "react";
import { FiChevronRight, FiX } from "react-icons/fi";
import { cx } from "../../../lib/cx.ts";

export type ChipVariant = "neutral" | "selected" | "danger" | "warning";

export type ChipProps = {
  children: ReactNode;
  variant?: ChipVariant;
  /** Leading decorative icon. */
  icon?: ReactNode;
  /** Makes the whole chip a button (selectable / openable). */
  onClick?: () => void;
  /** Toggle chips: exposed as aria-pressed on the button. */
  pressed?: boolean;
  /** `link` option: trailing ›, the whole chip navigates. */
  href?: string;
  /** `removable` option: trailing ✕ button, named 「移除 …」. */
  onRemove?: () => void;
  /** Accessible name of the remove button's target; defaults to the text children. */
  removeLabel?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  "aria-haspopup"?: "dialog" | "listbox" | "menu" | boolean;
  ref?: Ref<HTMLButtonElement>;
};

const VARIANTS: Record<ChipVariant, string> = {
  neutral: "bg-neutral-bg-container text-neutral-text-primary border-neutral-border",
  selected: "bg-primary-1 text-primary-7 border-primary-6",
  danger: "bg-status-error-1 text-status-error-6 border-status-error-6",
  warning: "bg-status-warning-1 text-status-warning-6 border-transparent",
};

const HOVER: Record<ChipVariant, string> = {
  neutral: "hover:bg-neutral-bg-layout",
  selected: "",
  danger: "",
  warning: "",
};

const BASE =
  "motion-colors inline-flex h-[24px] max-w-full shrink-0 items-center gap-xs whitespace-nowrap rounded-full border px-sm text-caption";

/** Compact label or pickable option: person chips, filters, tags, candidates. */
export function Chip({
  children,
  variant = "neutral",
  icon,
  onClick,
  pressed,
  href,
  onRemove,
  removeLabel,
  disabled,
  className,
  ref,
  ...aria
}: ChipProps) {
  const look = cx(BASE, VARIANTS[variant], className);
  const lead = icon ? <span aria-hidden="true">{icon}</span> : null;
  const text = <span className="truncate">{children}</span>;

  if (href) {
    return (
      <a href={href} {...aria} className={cx(look, HOVER[variant], "focus-ring no-underline")}>
        {lead}
        {text}
        <FiChevronRight aria-hidden="true" />
      </a>
    );
  }

  if (onRemove) {
    const name = removeLabel ?? (typeof children === "string" ? children : "");
    return (
      <span className={cx(look, "pr-xs")}>
        {lead}
        {text}
        <button
          type="button"
          aria-label={`移除 ${name}`.trim()}
          disabled={disabled}
          onClick={onRemove}
          className="focus-ring inline-flex cursor-pointer items-center rounded-full disabled:cursor-not-allowed"
        >
          <FiX aria-hidden="true" />
        </button>
      </span>
    );
  }

  if (onClick) {
    return (
      <button
        ref={ref}
        type="button"
        {...aria}
        aria-pressed={pressed}
        disabled={disabled}
        onClick={onClick}
        className={cx(
          look,
          HOVER[variant],
          "focus-ring cursor-pointer disabled:cursor-not-allowed disabled:opacity-45",
        )}
      >
        {lead}
        {text}
      </button>
    );
  }

  return (
    <span {...aria} className={look}>
      {lead}
      {text}
    </span>
  );
}
