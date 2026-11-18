import { cx } from "../../../lib/cx.ts";

export type AvatarVariant = "initial" | "self";
export type AvatarSize = "sm" | "md" | "lg";

export type AvatarProps = {
  /** Full name; the first character is shown when there is no photo. */
  name: string;
  variant?: AvatarVariant;
  size?: AvatarSize;
  /** Optional photo. */
  src?: string;
  className?: string;
};

const SIZES: Record<AvatarSize, string> = {
  sm: "size-[24px] text-caption",
  md: "size-[36px] text-body-md",
  lg: "size-[56px] text-h2",
};

/** Neutral: a bg-muted circle with the ink initial; 本人 reads 「我」 (and 「（我）」 to AT). */
const VARIANTS: Record<AvatarVariant, string> = {
  initial: "bg-neutral-bg-muted text-neutral-text-primary",
  self: "bg-neutral-bg-muted text-neutral-text-primary",
};

/** Person avatar: photo, or the first character of the name. 本人 shows 「我」. */
export function Avatar({ name, variant = "initial", size = "md", src, className }: AvatarProps) {
  const label = variant === "self" ? `${name}（我）` : name;
  const glyph = variant === "self" ? "我" : (Array.from(name)[0] ?? "?");
  return (
    <span
      role="img"
      aria-label={label}
      className={cx(
        "inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-semibold",
        SIZES[size],
        VARIANTS[variant],
        className,
      )}
    >
      {src ? (
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        <span aria-hidden="true">{glyph}</span>
      )}
    </span>
  );
}
