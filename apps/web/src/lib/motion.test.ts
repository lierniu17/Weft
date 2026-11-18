import { describe, expect, it } from "vitest";
import { tokens } from "../tokens.gen.ts";
import {
  motionMs,
  PRESS_SCALE,
  parseDurationMs,
  STAGGER_MAX,
  staggerDelayMs,
  staggerStyle,
} from "./motion.ts";

describe("motion tokens in script (AC-12, AC-13, AC-15)", () => {
  it("parses CSS durations", () => {
    expect(parseDurationMs("120ms")).toBe(120);
    expect(parseDurationMs("1.6s")).toBe(1600);
    expect(() => parseDurationMs("fast")).toThrow();
  });

  it("reads the DESIGN.md timings", () => {
    expect(motionMs("fast")).toBe(120);
    expect(motionMs("base")).toBe(200);
    expect(motionMs("exit")).toBe(150);
    expect(motionMs("sheet")).toBe(250);
    expect(motionMs("sheet-exit")).toBe(200);
    expect(motionMs("emphasis")).toBe(300);
    expect(motionMs("stagger")).toBe(30);
    expect(motionMs("skeleton")).toBe(1600);
    expect(PRESS_SCALE).toBe(0.98);
    expect(STAGGER_MAX).toBe(6);
    expect(tokens.motion["easing-decelerate"]).toBe("cubic-bezier(0, 0, 0, 1)");
  });

  it("staggers list items 30ms apart, at most 6 steps", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 20].map(staggerDelayMs)).toEqual([
      0, 30, 60, 90, 120, 150, 150, 150,
    ]);
    expect(staggerDelayMs(-1)).toBe(0);
    expect(staggerStyle(2).animationDelay).toBe("60ms");
  });
});
