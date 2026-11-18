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

/**
 * Contract dates carry their precision in their length: "2015" | "2015-06" | "2026-11-16"
 * (apps/api PartialDate). Throws on anything else; the API validates the pattern.
 */
export function parsePartialDate(value: string): OccurredOn {
  const m = value.match(/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/);
  if (!m) throw new Error(`Not a partial date: "${value}"`);
  const year = Number(m[1]);
  if (!m[2]) return { precision: "year", year };
  const month = Number(m[2]);
  if (!m[3]) return { precision: "month", year, month };
  return { precision: "day", year, month, day: Number(m[3]) };
}

/** Display text for a contract date, same rules as `formatOccurredOn`. */
export function formatPartialDate(value: string, today: Date): string {
  return formatOccurredOn(parsePartialDate(value), today);
}

/** Sort comparator by earliest moment; a coarser date sorts before its finer ones. */
export function comparePartialDate(a: string, b: string): number {
  const key = (v: OccurredOn) => [
    v.year,
    v.precision === "year" ? 0 : v.month,
    v.precision === "day" ? v.day : 0,
    v.precision === "year" ? 0 : v.precision === "month" ? 1 : 2,
  ];
  const ka = key(parsePartialDate(a));
  const kb = key(parsePartialDate(b));
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] !== kb[i]) return ka[i] - kb[i];
  }
  return 0;
}

/** A time span: 「2023 年 – 至今」 or 「2023 年 – 2026 年 10 月」; day dates show in full. */
export function formatPeriod(start: string, end: string | null | undefined, today: Date): string {
  const show = (v: string) => {
    const d = parsePartialDate(v);
    return d.precision === "day"
      ? `${d.year}-${pad(d.month)}-${pad(d.day)}`
      : formatOccurredOn(d, today);
  };
  return `${show(start)} – ${end ? show(end) : "至今"}`;
}
