import type { HTMLAttributes, ReactNode, Ref } from "react";
import { cx } from "../../../lib/cx.ts";

export type CardVariant = "plain" | "outlined" | "highlighted";

export type CardProps = HTMLAttributes<HTMLElement> & {
  variant?: CardVariant;
  /** Rendered element; `section` / `article` when the card is a landmark of its own. */
  as?: "div" | "section" | "article" | "li";
  children: ReactNode;
  ref?: Ref<HTMLElement>;
};

/**
 * Content container, only where DESIGN.md allows one (a draft card, a floating person card):
 * answers and lists are never boxed. bg-container, rounded.md, padding spacing.md, no shadow.
 * plain = no border; outlined = a thin divider border; highlighted = ink border (the draft
 * being reviewed in the side panel — a selected state).
 */
const VARIANTS: Record<CardVariant, string> = {
  plain: "border-transparent",
  outlined: "border-neutral-divider",
  highlighted: "border-primary-6",
};

export function Card({
  variant = "outlined",
  as = "div",
  className,
  children,
  ...rest
}: CardProps) {
  const Tag = as;
  return (
    <Tag
      data-card={variant}
      className={cx(
        "rounded-md border bg-neutral-bg-container p-md text-neutral-text-primary",
        VARIANTS[variant],
        className,
      )}
      {...(rest as HTMLAttributes<HTMLElement>)}
    >
      {children}
    </Tag>
  );
}
