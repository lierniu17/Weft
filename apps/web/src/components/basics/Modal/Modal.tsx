import { AlertDialog } from "radix-ui";
import type { ReactNode } from "react";
import { useReturnFocus } from "../../../lib/useReturnFocus.ts";
import { Button } from "../Button/Button.tsx";

export type ModalVariant = "confirm" | "danger";

export type ModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  variant?: ModalVariant;
  /** Action button text (right). */
  actionText: string;
  /** Cancel button text (left). */
  cancelText?: string;
  onAction: () => void;
  /** Disables the action while it runs and shows a spinner. */
  actionLoading?: boolean;
  /** Optional extra content between description and buttons (e.g. a password Input). */
  children?: ReactNode;
};

/**
 * Centred dialog for a decision that needs to be explicit (删除人物, 放弃草稿).
 * Equal-width buttons, cancel left, action right; danger uses the outlined danger Button,
 * never a solid primary. Focus is trapped inside; Esc and 取消 both close it.
 */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  variant = "confirm",
  actionText,
  cancelText = "取消",
  onAction,
  actionLoading,
  children,
}: ModalProps) {
  const onCloseAutoFocus = useReturnFocus(open);
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-[0] z-40 bg-mask data-[state=closed]:animate-scrim-out data-[state=open]:animate-scrim-in" />
        <AlertDialog.Content
          onCloseAutoFocus={onCloseAutoFocus}
          // AC-13: scales 0.98 → 1 while fading in (motion.sheet, decelerate); reverse on close.
          className="fixed top-1/2 left-1/2 z-50 flex w-[min(320px,100vw-48px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-md rounded-lg bg-neutral-bg-container p-lg shadow-lg data-[state=closed]:animate-modal-out data-[state=open]:animate-modal-in"
          {...(description ? {} : { "aria-describedby": undefined })}
        >
          <AlertDialog.Title className="text-h3 text-neutral-text-primary">
            {title}
          </AlertDialog.Title>
          {description && (
            <AlertDialog.Description className="text-body-md text-neutral-text-secondary">
              {description}
            </AlertDialog.Description>
          )}
          {children}
          <div className="flex gap-sm">
            <AlertDialog.Cancel asChild>
              <Button variant="secondary" className="flex-1">
                {cancelText}
              </Button>
            </AlertDialog.Cancel>
            <Button
              variant={variant === "danger" ? "danger" : "primary"}
              className="flex-1"
              loading={actionLoading}
              onClick={onAction}
            >
              {actionText}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
