import { useLayoutEffect, useRef, useState } from "react";

/**
 * True while the referenced element's text overflows (single-line ellipsis or a line clamp).
 * Used to show a Tooltip with the full text only when something is actually cut off (AC-UI-8).
 */
export function useTruncated<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [truncated, setTruncated] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () =>
      setTruncated(el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  });
  return [ref, truncated] as const;
}
