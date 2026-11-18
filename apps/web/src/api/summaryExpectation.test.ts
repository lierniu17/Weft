import { afterEach, describe, expect, it } from "vitest";
import {
  expectSummariesForAll,
  expectSummary,
  resetSummaryExpectations,
  summaryExpected,
} from "./summaryExpectation.ts";

afterEach(() => resetSummaryExpectations());

describe("summaryExpected", () => {
  it("is false when nothing changed (seeded people, failed summaries)", () => {
    expect(summaryExpected("p1", 1_000)).toBe(false);
  });

  it("is true for the edited person within a minute, and only for them", () => {
    expectSummary("p1", 0);
    expect(summaryExpected("p1", 59_999)).toBe(true);
    expect(summaryExpected("p2", 1_000)).toBe(false);
    expect(summaryExpected("p1", 60_000)).toBe(false);
  });

  it("is true for everyone within a minute after a draft is confirmed", () => {
    expectSummariesForAll(0);
    expect(summaryExpected("anyone", 30_000)).toBe(true);
    expect(summaryExpected("anyone", 60_001)).toBe(false);
  });
});
