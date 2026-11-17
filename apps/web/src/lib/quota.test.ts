import { describe, expect, it } from "vitest";
import { quotaLevel } from "./quota.ts";

describe("额度档位 (QuotaMeter)", () => {
  it("normal while 10% or more remains", () => {
    expect(quotaLevel(12, 50)).toBe("normal");
    expect(quotaLevel(45, 50)).toBe("normal"); // 5 left = exactly 10%
  });
  it("low when less than 10% remains", () => {
    expect(quotaLevel(46, 50)).toBe("low");
    expect(quotaLevel(91, 100)).toBe("low");
  });
  it("exhausted at or beyond the limit", () => {
    expect(quotaLevel(50, 50)).toBe("exhausted");
    expect(quotaLevel(51, 50)).toBe("exhausted");
  });
});
