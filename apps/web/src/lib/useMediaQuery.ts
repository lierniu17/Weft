import { useSyncExternalStore } from "react";

/** A CSS media query's current match, live. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => (typeof window !== "undefined" && window.matchMedia?.(query).matches) || false,
    () => false,
  );
}

/** The system's 「减少动态效果」. */
export const useReducedMotion = () => useMediaQuery("(prefers-reduced-motion: reduce)");

/** DESIGN.md: phones are < 768px. */
export const useCompactViewport = () => useMediaQuery("(max-width: 767px)");
