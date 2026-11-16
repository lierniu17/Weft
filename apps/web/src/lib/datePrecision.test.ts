import { describe, expect, it } from "vitest";
import { formatOccurredOn, isFuture, type OccurredOn } from "./datePrecision.ts";

// Clock injected, never read from Date.now(): the fixed date must stay meaningful forever.
const today = new Date(2026, 10, 16); // 2026-11-16

describe("发生日期的精度显示 (AC-7)", () => {
  it("year precision shows 「2015 年」", () => {
    expect(formatOccurredOn({ precision: "year", year: 2015 }, today)).toBe("2015 年");
  });

  it("month precision shows 「2026 年 11 月」", () => {
    expect(formatOccurredOn({ precision: "month", year: 2026, month: 11 }, today)).toBe(
      "2026 年 11 月",
    );
  });

  it("day precision shows 「今天」 for today", () => {
    expect(formatOccurredOn({ precision: "day", year: 2026, month: 11, day: 16 }, today)).toBe(
      "今天",
    );
  });

  it("day precision in the current year shows 「MM-DD」", () => {
    expect(formatOccurredOn({ precision: "day", year: 2026, month: 3, day: 5 }, today)).toBe(
      "03-05",
    );
  });

  it("day precision in another year shows the full date", () => {
    expect(formatOccurredOn({ precision: "day", year: 2024, month: 12, day: 31 }, today)).toBe(
      "2024-12-31",
    );
  });
});

describe("未来日期不可选 (AC-7)", () => {
  const cases: [OccurredOn, boolean][] = [
    [{ precision: "day", year: 2026, month: 11, day: 16 }, false],
    [{ precision: "day", year: 2026, month: 11, day: 17 }, true],
    [{ precision: "month", year: 2026, month: 11 }, false],
    [{ precision: "month", year: 2026, month: 12 }, true],
    [{ precision: "year", year: 2026 }, false],
    [{ precision: "year", year: 2027 }, true],
    [{ precision: "day", year: 2015, month: 1, day: 1 }, false],
  ];
  it.each(cases)("%o in the future: %s", (value, expected) => {
    expect(isFuture(value, today)).toBe(expected);
  });
});
