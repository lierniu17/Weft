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

/**
 * Props for a page's right-side sheet (出处, 筛选 …): modal bottom sheet on mobile, modal
 * right drawer on tablet, and from 1200px the non-modal right column beside the page
 * (wireframe D1–D3) — the page must render the sheet inside its flex row for that.
 */
export function useSidePanel() {
  const layout = useLayout();
  return {
    variant: layout === "mobile" ? ("bottom-sheet" as const) : ("side-panel" as const),
    modal: layout !== "desktop",
  };
}

/** The app's clock. Pages pass it to components as `today`. */
export function useToday(): Date {
  return new Date();
}

/**
 * The page content column (style refresh AC-5): full width with spacing.md gutters on a
 * phone, at most 720px and centred from the desktop up. Every page puts its scrolling
 * content in one; the NavBar above it spans the main area.
 */
export const CONTENT_COLUMN = "mx-auto w-full max-w-[720px] px-md";

/** The desktop right column beside a page (chat: 当前人物 / review / 出处; person: graph). */
export const RIGHT_COLUMN = "w-[380px] shrink-0";
