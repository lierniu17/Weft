import { Dialog } from "radix-ui";
import { type ReactNode, useRef } from "react";
import { FiX } from "react-icons/fi";
import { cx } from "../../../lib/cx.ts";
import { useReturnFocus } from "../../../lib/useReturnFocus.ts";
import { IconButton } from "../IconButton/IconButton.tsx";

export type DrawerVariant = "bottom-sheet" | "side-panel";

export type DrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Secondary line under the title, e.g. 「今天 · 确认后才会写进图谱」. */
  description?: ReactNode;
  variant?: DrawerVariant;
  children: ReactNode;
  /** Sticky bottom bar (e.g. 放弃 + 确认入图谱). */
  footer?: ReactNode;
  /** Hide the ✕ close button (Esc and the mask still close). */
  hideClose?: boolean;
  /**
   * `false` (side-panel only): the desktop right column of wireframe D1/D2. Rendered in
   * place in the page flow, no mask; the page beside it stays interactive. Focus still
   * moves in on open and back to the trigger on close; ✕ closes it, and so does Esc — but
   * only when focus is inside the panel (Esc in the page beside it keeps its own meaning).
   */
  modal?: boolean;
  /** Inline right column width: 360px, or 560px for a graph beside the chat. */
  width?: "default" | "wide";
  className?: string;
};

/** In the page flow next to the content it serves (no portal, no mask). */
const INLINE =
  "relative h-full max-w-full shrink-0 border-l border-neutral-divider data-[state=open]:animate-panel-in";
const INLINE_WIDTH = { default: "w-[360px]", wide: "w-[560px]" } as const;

const VARIANTS: Record<DrawerVariant, string> = {
  "bottom-sheet":
    "inset-x-[0] bottom-[0] max-h-[92vh] rounded-t-lg shadow-overlay data-[state=open]:animate-sheet-in data-[state=closed]:animate-sheet-out",
  "side-panel":
    "inset-y-[0] right-[0] w-[360px] max-w-full border-l border-neutral-divider data-[state=open]:animate-panel-in data-[state=closed]:animate-panel-out",
};

/**
 * Surface for work done in place: bottom sheet on mobile, right panel from tablet up.
 * Modal (default): focus is trapped inside, Esc / mask / ✕ close it, focus returns to the
 * trigger. `modal={false}` with `side-panel` is the desktop right column: same panel,
 * rendered in place, page left interactive, Esc closes it only from inside.
 */
export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  variant = "bottom-sheet",
  children,
  footer,
  hideClose,
  modal = true,
  width = "default",
  className,
}: DrawerProps) {
  const onCloseAutoFocus = useReturnFocus(open);
  const inline = !modal && variant === "side-panel";
  const contentRef = useRef<HTMLDivElement>(null);
  const panel = (
    <Dialog.Content
      ref={contentRef}
      onCloseAutoFocus={onCloseAutoFocus}
      // Inline: clicking or tabbing into the page beside the panel keeps it open, and Esc
      // only closes it when pressed from inside (Radix listens on the whole document).
      onInteractOutside={inline ? (e) => e.preventDefault() : undefined}
      onEscapeKeyDown={
        inline
          ? (e) => {
              if (!(e.target instanceof Node && contentRef.current?.contains(e.target))) {
                e.preventDefault();
              }
            }
          : undefined
      }
      className={cx(
        "flex flex-col bg-neutral-bg-container outline-none",
        inline ? cx(INLINE, INLINE_WIDTH[width]) : cx("fixed z-50", VARIANTS[variant]),
        className,
      )}
      {...(description ? {} : { "aria-describedby": undefined })}
    >
      {variant === "bottom-sheet" && (
        <span
          aria-hidden="true"
          data-drawer-handle=""
          className="mx-auto mt-sm block h-[4px] w-[36px] shrink-0 rounded-full bg-neutral-border"
        />
      )}
      <header className="flex shrink-0 items-start gap-sm px-md pt-sm pb-sm">
        <div className="min-w-[0] flex-1">
          <Dialog.Title className="text-h3 text-neutral-text-primary">{title}</Dialog.Title>
          {description && (
            <Dialog.Description className="text-caption text-neutral-text-secondary">
              {description}
            </Dialog.Description>
          )}
        </div>
        {!hideClose && (
          <Dialog.Close asChild>
            <IconButton aria-label="关闭" icon={<FiX />} variant="plain" size="sm" />
          </Dialog.Close>
        )}
      </header>
      <div className="min-h-[0] flex-1 overflow-y-auto px-md pb-md">{children}</div>
      {footer && (
        <footer className="flex shrink-0 gap-sm border-t border-neutral-divider px-md py-sm">
          {footer}
        </footer>
      )}
    </Dialog.Content>
  );
  if (inline) {
    return (
      <Dialog.Root open={open} onOpenChange={onOpenChange} modal={false}>
        {panel}
      </Dialog.Root>
    );
  }
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          data-drawer-mask=""
          className="fixed inset-[0] z-40 bg-mask data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in"
        />
        {panel}
      </Dialog.Portal>
    </Dialog.Root>
  );
}
