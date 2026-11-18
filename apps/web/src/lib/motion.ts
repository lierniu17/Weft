import type { CSSProperties } from "react";
import { tokens } from "../tokens.gen.ts";

/**
 * DESIGN.md `motion` tokens as numbers, for the few places that need a timing in script
 * (unmounting after an exit animation, list stagger delays). CSS reads the same tokens as
 * custom properties (`--motion-*`), so script and stylesheet cannot drift apart.
 */
export type MotionDuration =
  | "fast"
  | "base"
  | "exit"
  | "sheet"
  | "sheet-exit"
  | "emphasis"
  | "stagger"
  | "skeleton";

/** "120ms" → 120, "1.6s" → 1600. */
export function parseDurationMs(value: string): number {
  const m = value.trim().match(/^(\d+(?:\.\d+)?)(ms|s)$/);
  if (!m) throw new Error(`Not a CSS duration: "${value}"`);
  return m[2] === "s" ? Math.round(Number(m[1]) * 1000) : Number(m[1]);
}

export function motionMs(name: MotionDuration): number {
  return parseDurationMs(tokens.motion[name]);
}

export const PRESS_SCALE = Number(tokens.motion["press-scale"]);
export const STAGGER_MAX = Number(tokens.motion["stagger-max"]);

/**
 * Delay of the item at `index` (0-based) in a staggered list: motion.stagger apart, and from
 * the stagger-max-th item on they all share that item's delay (AC-12: 30ms, at most 6).
 */
export function staggerDelayMs(index: number): number {
  return Math.min(Math.max(index, 0), STAGGER_MAX - 1) * motionMs("stagger");
}

/** For list items that are not direct children of a `motion-stagger` container. */
export function staggerStyle(index: number): CSSProperties {
  return { animation: "var(--animate-page-enter)", animationDelay: `${staggerDelayMs(index)}ms` };
}
