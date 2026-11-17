import { cx } from "../../../lib/cx.ts";

export type BadgeProps =
  | {
      variant: "dot";
      /** What the dot means, read by assistive tech (e.g. 「有待确认的草稿」). */
      label: string;
      className?: string;
    }
  | {
      variant: "count";
      count: number;
      /** Unit text after the number for assistive tech (e.g. 「条待确认」). */
      label: string;
      /** Above this the badge reads `${max}+`. */
      max?: number;
      className?: string;
    };

/** Unread dot or count indicator. A count of 0 renders nothing. */
export function Badge(props: BadgeProps) {
  if (props.variant === "dot") {
    return (
      <span
        role="img"
        aria-label={props.label}
        className={cx("inline-block size-[8px] rounded-full bg-status-error-6", props.className)}
      />
    );
  }

  const { count, label, max = 99, className } = props;
  if (count <= 0) return null;
  const shown = count > max ? `${max}+` : String(count);
  return (
    <span
      role="status"
      className={cx(
        "inline-flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-status-error-6 px-xs text-caption text-on-primary",
        className,
      )}
    >
      <span aria-hidden="true">{shown}</span>
      <span className="sr-only">{`${shown} ${label}`}</span>
    </span>
  );
}
