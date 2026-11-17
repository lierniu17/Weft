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

const VARIANTS: Record<AvatarVariant, string> = {
  initial: "bg-secondary-1 text-secondary-7",
  self: "bg-primary-1 text-primary-7 ring-2 ring-primary-6",
};

/** Person avatar: photo, or the first character of the name. 本人 shows 「我」 with a ring. */
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
