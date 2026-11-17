import { cx } from "../../../lib/cx.ts";

export type DividerProps = {
  /** `inset` indents by spacing.md, for separators inside a list group. */
  variant?: "full" | "inset";
  className?: string;
};

/** Thin separator inside a group; groups themselves are separated by spacing.lg. */
export function Divider({ variant = "full", className }: DividerProps) {
  return (
    <hr
      className={cx(
        "h-px border-0 bg-neutral-divider",
        variant === "inset" ? "ml-md" : "ml-[0]",
        className,
      )}
    />
  );
}
