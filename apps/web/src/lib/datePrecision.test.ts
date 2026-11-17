import { describe, expect, it } from "vitest";
import {
  comparePartialDate,
  formatOccurredOn,
  formatPartialDate,
  formatPeriod,
  isFuture,
  type OccurredOn,
  parsePartialDate,
} from "./datePrecision.ts";

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

describe("契约里的带精度日期字符串", () => {
  it("parses YYYY / YYYY-MM / YYYY-MM-DD", () => {
    expect(parsePartialDate("2015")).toEqual({ precision: "year", year: 2015 });
    expect(parsePartialDate("2015-06")).toEqual({ precision: "month", year: 2015, month: 6 });
    expect(parsePartialDate("2026-11-16")).toEqual({
      precision: "day",
      year: 2026,
      month: 11,
      day: 16,
    });
  });

  it("formats a contract date for display", () => {
    expect(formatPartialDate("2026-11-16", today)).toBe("今天");
    expect(formatPartialDate("2015", today)).toBe("2015 年");
  });

  it("orders dates by their earliest moment; a year sorts before its months", () => {
    const sorted = ["2026-11", "2012", "2025-03-01", "2012-09"].sort(comparePartialDate);
    expect(sorted).toEqual(["2012", "2012-09", "2025-03-01", "2026-11"]);
  });

  it("formats a period: 「2023 年 – 至今」 or 「2023 年 – 2026 年 10 月」", () => {
    expect(formatPeriod("2023", null, today)).toBe("2023 年 – 至今");
    expect(formatPeriod("2023", "2026-10", today)).toBe("2023 年 – 2026 年 10 月");
  });
});
