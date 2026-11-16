import { cx } from "../../../lib/cx.ts";

/** Decorative spinner; the owning control carries aria-busy. */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "inline-block size-[1em] shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent",
        className,
      )}
    />
  );
}
