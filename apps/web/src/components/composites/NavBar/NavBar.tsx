import type { ReactNode } from "react";
import { FiChevronLeft } from "react-icons/fi";
import { cx } from "../../../lib/cx.ts";
import { useTruncated } from "../../../lib/useTruncated.ts";
import { IconButton } from "../../basics/IconButton/IconButton.tsx";
import { Tooltip } from "../../basics/Tooltip/Tooltip.tsx";

export type NavBarVariant = "root" | "pushed";

export type NavBarProps = {
  title: string;
  subtitle?: ReactNode;
  /** root: no left button; pushed: IconButton.plain 「返回」. */
  variant?: NavBarVariant;
  onBack?: () => void;
  /** Right side: a text action (ghost Button) and / or a ⋯ IconButton. */
  actions?: ReactNode;
  className?: string;
};

/** Mobile top bar, 48px: title + optional subtitle, back on pushed screens, actions on the right. */
export function NavBar({
  title,
  subtitle,
  variant = "root",
  onBack,
  actions,
  className,
}: NavBarProps) {
  const [titleRef, truncated] = useTruncated<HTMLHeadingElement>();
  const heading = (
    <h1
      ref={titleRef}
      tabIndex={truncated ? 0 : undefined}
      className="focus-ring truncate text-h3 text-neutral-text-primary"
    >
      {title}
    </h1>
  );
  return (
    <header
      className={cx(
        "flex h-[48px] shrink-0 items-center gap-sm border-b border-neutral-divider bg-neutral-bg-container px-md",
        variant === "pushed" && "pl-xs",
        className,
      )}
    >
      {variant === "pushed" && (
        <IconButton aria-label="返回" icon={<FiChevronLeft />} size="md" onClick={onBack} />
      )}
      <div className="flex min-w-[0] flex-1 flex-col justify-center">
        {truncated ? <Tooltip content={title}>{heading}</Tooltip> : heading}
        {subtitle && (
          <p className="truncate text-caption text-neutral-text-secondary">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-xs">{actions}</div>}
    </header>
  );
}
