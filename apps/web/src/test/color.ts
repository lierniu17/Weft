import { tokens } from "../tokens.gen.ts";

/** "#4F46E5" -> "rgb(79, 70, 229)", the form getComputedStyle reports. */
export function rgb(hex: string): string {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

export type ColorToken = keyof typeof tokens.color;

/** A DESIGN.md colour token in computed-style form: token("primary-6") -> "rgb(24, 24, 27)". */
export function token(name: ColorToken): string {
  return rgb(tokens.color[name]);
}

/** What getComputedStyle reports for a transparent colour (no border, no background). */
export const TRANSPARENT = "rgba(0, 0, 0, 0)";
