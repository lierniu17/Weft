/**
 * 发生日期 with precision: an Entry's date may be known only to the year or month.
 * `today` is always injected so callers (and tests) control the clock.
 */
export type DatePrecision = "year" | "month" | "day";

export type OccurredOn =
  | { precision: "year"; year: number }
  | { precision: "month"; year: number; month: number }
  | { precision: "day"; year: number; month: number; day: number };

const pad = (n: number) => String(n).padStart(2, "0");

/** Display text: 「2015 年」「2026 年 11 月」「今天」「03-05」「2024-12-31」. */
export function formatOccurredOn(value: OccurredOn, today: Date): string {
  switch (value.precision) {
    case "year":
      return `${value.year} 年`;
    case "month":
      return `${value.year} 年 ${value.month} 月`;
    case "day": {
      const sameYear = value.year === today.getFullYear();
      if (sameYear && value.month === today.getMonth() + 1 && value.day === today.getDate()) {
        return "今天";
      }
      const md = `${pad(value.month)}-${pad(value.day)}`;
      return sameYear ? md : `${value.year}-${md}`;
    }
  }
}

/** True when the earliest moment the value can denote is after `today`. */
export function isFuture(value: OccurredOn, today: Date): boolean {
  const ty = today.getFullYear();
  const tm = today.getMonth() + 1;
  const td = today.getDate();
  if (value.year !== ty) return value.year > ty;
  if (value.precision === "year") return false;
  if (value.month !== tm) return value.month > tm;
  if (value.precision === "month") return false;
  return value.day > td;
}

/** Today as a day-precision value. */
export function todayOccurredOn(today: Date): OccurredOn {
  return {
    precision: "day",
    year: today.getFullYear(),
    month: today.getMonth() + 1,
    day: today.getDate(),
  };
}
