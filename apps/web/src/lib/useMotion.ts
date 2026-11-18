import { useEffect, useRef, useState } from "react";
import { type MotionDuration, motionMs } from "./motion.ts";
import { useReducedMotion } from "./useMediaQuery.ts";

export type PresenceState = "open" | "closed";

/**
 * Keeps something mounted for its exit animation: `open` → mounted + "open"; `open` false →
 * "closed" for the exit duration, then unmounted. With 「减少动态效果」 it unmounts at once.
 * Pair `state` with `data-state` and `data-[state=closed]:animate-*-out` classes.
 */
export function usePresence(
  open: boolean,
  exit: MotionDuration = "exit",
): { mounted: boolean; state: PresenceState } {
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    if (reduced) {
      setMounted(false);
      return;
    }
    const timer = setTimeout(() => setMounted(false), motionMs(exit));
    return () => clearTimeout(timer);
  }, [open, reduced, exit]);
  return { mounted: open || mounted, state: open ? "open" : "closed" };
}

/**
 * Number roll (AC-15): returns a key that changes with the value (re-mounting the element
 * re-runs the animation) and the roll class, which is only applied after the first change
 * so a number does not animate on first paint.
 *
 *   const [key, roll] = useNumberRoll(used);
 *   <span key={key} className={roll}>{used}</span>
 */
export function useNumberRoll(value: number | string): [key: string, className: string] {
  const first = useRef(value);
  const changed = useRef(false);
  if (value !== first.current) changed.current = true;
  return [String(value), changed.current ? "motion-number-roll" : "tabular-nums"];
}
