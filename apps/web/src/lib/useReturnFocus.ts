import { useLayoutEffect, useRef } from "react";

/**
 * Remembers what had focus when an overlay opened and returns focus there on close.
 * Radix only restores focus to its own Trigger; controlled overlays (opened from a
 * Chip, a card button, a keyboard shortcut) need this to meet AC-UI-9.
 * Pass the returned handler as `onCloseAutoFocus`.
 */
export function useReturnFocus(open: boolean) {
  const previous = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (open && document.activeElement instanceof HTMLElement) {
      previous.current = document.activeElement;
    }
  }, [open]);
  return (event: Event) => {
    const target = previous.current;
    if (target?.isConnected) {
      event.preventDefault();
      target.focus();
    }
  };
}
