import { describe, expect, it } from "vitest";
import {
  CONFIDENCE_LEVELS,
  compareConfidence,
  confidenceLabel,
  isAtLeast,
  sortByConfidence,
} from "./confidence.ts";

describe("可信度 (AC-16)", () => {
  it("has exactly four levels with full Chinese labels", () => {
    expect(CONFIDENCE_LEVELS.map(confidenceLabel)).toEqual(["亲历", "本人说", "转述", "推测"]);
  });

  it("treats 亲历 and 本人说 as the same rank", () => {
    expect(compareConfidence("witnessed", "self-told")).toBe(0);
    expect(compareConfidence("self-told", "witnessed")).toBe(0);
  });

  it("orders 本人说 > 转述 > 推测", () => {
    expect(compareConfidence("self-told", "hearsay")).toBeGreaterThan(0);
    expect(compareConfidence("hearsay", "inferred")).toBeGreaterThan(0);
    expect(compareConfidence("witnessed", "inferred")).toBeGreaterThan(0);
    expect(compareConfidence("inferred", "hearsay")).toBeLessThan(0);
  });

  it("isAtLeast: 亲历 is not lower than 本人说 on conflict, 转述 is lower", () => {
    expect(isAtLeast("witnessed", "self-told")).toBe(true);
    expect(isAtLeast("self-told", "witnessed")).toBe(true);
    expect(isAtLeast("hearsay", "self-told")).toBe(false);
    expect(isAtLeast("inferred", "inferred")).toBe(true);
  });

  it("sorts from most to least reliable, keeping equal ranks stable", () => {
    expect(sortByConfidence(["inferred", "self-told", "hearsay", "witnessed"])).toEqual([
      "self-told",
      "witnessed",
      "hearsay",
      "inferred",
    ]);
  });
});
