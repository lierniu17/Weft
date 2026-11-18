import type { ReactNode } from "react";
import { FiAlertCircle, FiAlertTriangle, FiInfo } from "react-icons/fi";
import { cx } from "../../../lib/cx.ts";

export type BannerVariant = "warning" | "error" | "info";

export type BannerProps = {
  variant?: BannerVariant;
  children: ReactNode;
  /** Optional trailing action, e.g. a ghost Button 「重试」. */
  action?: ReactNode;
  className?: string;
};

const VARIANTS: Record<BannerVariant, string> = {
  warning: "bg-status-warning-1 text-status-warning-6",
  error: "bg-status-error-1 text-status-error-6",
  info: "bg-status-info-1 text-status-info-6",
};

/** Icons are graphics: the status `graphic` tone (≥ 3:1); text stays status-6 (≥ 4.5:1). */
const ICON_TONE: Record<BannerVariant, string> = {
  warning: "text-status-warning-graphic",
  error: "text-status-error-graphic",
  info: "text-status-info-graphic",
};

const ICONS: Record<BannerVariant, ReactNode> = {
  warning: <FiAlertTriangle />,
  error: <FiAlertCircle />,
  info: <FiInfo />,
};

/**
 * In-page status banner (quota exhausted, network error).
 * error → role="alert" (assertive); warning / info → role="status" (polite).
 */
export function Banner({ variant = "info", children, action, className }: BannerProps) {
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={cx(
        "flex items-start gap-sm rounded-md px-md py-sm text-body-sm",
        VARIANTS[variant],
        className,
      )}
    >
      <span aria-hidden="true" className={cx("mt-xs shrink-0", ICON_TONE[variant])}>
        {ICONS[variant]}
      </span>
      <div className="min-w-[0] flex-1">{children}</div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
