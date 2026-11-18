import { cx } from "../../../lib/cx.ts";

export type SkeletonProps = {
  variant?: "text" | "avatar" | "card";
  /** text: CSS width, default 100%. */
  width?: string;
  /** avatar: matches Avatar sizes. */
  size?: "sm" | "md" | "lg";
  /** card: CSS height, default 96px. */
  height?: string;
  className?: string;
};

const AVATAR = { sm: "size-[24px]", md: "size-[36px]", lg: "size-[56px]" } as const;

/**
 * Loading placeholder tracing the shape of what will load. Hidden from assistive
 * tech: the loading region itself should carry aria-busy / a status label.
 */
export function Skeleton(props: SkeletonProps) {
  // Soft light / dark cycle (motion.skeleton); still under 「减少动态效果」.
  const base =
    "block animate-skeleton bg-neutral-bg-muted bg-[linear-gradient(90deg,var(--color-neutral-bg-muted),var(--color-neutral-bg-subtle),var(--color-neutral-bg-muted))] bg-[length:200%_100%]";

  if (props.variant === "avatar") {
    return (
      <span
        aria-hidden="true"
        data-skeleton="avatar"
        className={cx(base, "rounded-full", AVATAR[props.size ?? "md"], props.className)}
      />
    );
  }
  if (props.variant === "card") {
    return (
      <span
        aria-hidden="true"
        data-skeleton="card"
        style={{ height: props.height ?? "96px" }}
        className={cx(base, "w-full rounded-md", props.className)}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      data-skeleton="text"
      style={{ width: props.width ?? "100%" }}
      className={cx(base, "h-[12px] rounded-full", props.className)}
    />
  );
}
