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
 * Content container: bg-container, rounded.md, padding spacing.md.
 * plain = no border; outlined = divider border + card shadow (final.html .card);
 * highlighted = primary-6 border (e.g. the draft being reviewed in the side panel).
 */
const VARIANTS: Record<CardVariant, string> = {
  plain: "border-transparent",
  outlined: "border-neutral-divider shadow-card",
  highlighted: "border-primary-6 shadow-card",
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
