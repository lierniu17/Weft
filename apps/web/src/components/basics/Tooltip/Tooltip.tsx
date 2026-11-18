import { Tooltip as RadixTooltip } from "radix-ui";
import type { ReactNode } from "react";

export type TooltipProps = {
  /** Full text / summary to reveal. */
  content: ReactNode;
  /** A single focusable trigger element. */
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  delayDuration?: number;
};

/** Hover / focus reveal for truncated names and citation summaries. Esc dismisses. */
export function Tooltip({ content, children, side = "top", delayDuration = 300 }: TooltipProps) {
  return (
    <RadixTooltip.Provider delayDuration={delayDuration}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content
            side={side}
            sideOffset={4}
            collisionPadding={8}
            className="z-50 max-w-[280px] animate-fade-in data-[state=closed]:animate-fade-out rounded-sm bg-neutral-text-primary px-sm py-xs text-caption text-neutral-bg-container shadow-md"
          >
            {content}
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
}
