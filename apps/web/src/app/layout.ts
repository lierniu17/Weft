import { useSyncExternalStore } from "react";

/** DESIGN.md breakpoints: mobile < 768, tablet 768–1199, desktop >= 1200. */
export type Layout = "mobile" | "tablet" | "desktop";

const TABLET = "(min-width: 768px)";
const DESKTOP = "(min-width: 1200px)";

function current(): Layout {
  if (typeof window === "undefined" || !window.matchMedia) return "mobile";
  if (window.matchMedia(DESKTOP).matches) return "desktop";
  if (window.matchMedia(TABLET).matches) return "tablet";
  return "mobile";
}

function subscribe(onChange: () => void) {
  const lists = [window.matchMedia(TABLET), window.matchMedia(DESKTOP)];
  for (const l of lists) l.addEventListener("change", onChange);
  return () => {
    for (const l of lists) l.removeEventListener("change", onChange);
  };
}

export function useLayout(): Layout {
  return useSyncExternalStore(subscribe, current, () => "mobile");
}

/** Sheets are bottom sheets on mobile and a right panel from tablet up. */
export function useSheetVariant() {
  return useLayout() === "mobile" ? "bottom-sheet" : "side-panel";
}

/** The app's clock. Pages pass it to components as `today`. */
export function useToday(): Date {
  return new Date();
}
