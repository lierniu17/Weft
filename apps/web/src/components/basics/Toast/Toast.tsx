import { type ReactNode, useEffect } from "react";
import { FiAlertCircle, FiCheck } from "react-icons/fi";
import { cx } from "../../../lib/cx.ts";

export type ToastVariant = "info" | "success" | "error";

export type ToastProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  variant?: ToastVariant;
  /** Auto-dismiss delay; DESIGN.md: 2 seconds. */
  duration?: number;
  className?: string;
};

const ICONS: Record<ToastVariant, ReactNode> = {
  info: null,
  success: <FiCheck />,
  error: <FiAlertCircle />,
};

/**
 * Lightweight result feedback (已复制, 已删除). Announced politely (role="status"),
 * errors assertively (role="alert"); closes itself after `duration`.
 */
export function Toast({
  open,
  onOpenChange,
  children,
  variant = "info",
  duration = 2000,
  className,
}: ToastProps) {
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => onOpenChange(false), duration);
    return () => clearTimeout(timer);
  }, [open, duration, onOpenChange]);

  if (!open) return null;
  const icon = ICONS[variant];
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={cx(
        "fixed bottom-xxl left-1/2 z-50 flex -translate-x-1/2 animate-fade-in items-center gap-sm rounded-sm bg-neutral-text-primary px-md py-sm text-body-sm text-neutral-bg-container shadow-card",
        className,
      )}
    >
      {icon && <span aria-hidden="true">{icon}</span>}
      <span>{children}</span>
    </div>
  );
}
