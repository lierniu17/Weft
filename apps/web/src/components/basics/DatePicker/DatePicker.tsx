import { useState } from "react";
import { FiCalendar, FiChevronLeft, FiChevronRight } from "react-icons/fi";
import { cx } from "../../../lib/cx.ts";
import {
  type DatePrecision,
  formatOccurredOn,
  isFuture,
  type OccurredOn,
} from "../../../lib/datePrecision.ts";
import { Button } from "../Button/Button.tsx";
import { Chip } from "../Chip/Chip.tsx";
import { Drawer } from "../Drawer/Drawer.tsx";
import { IconButton } from "../IconButton/IconButton.tsx";
import { SegmentedControl } from "../SegmentedControl/SegmentedControl.tsx";

export type DatePickerProps = {
  value: OccurredOn;
  onChange: (value: OccurredOn) => void;
  /** Injected clock: decides what "today" and "future" mean. */
  today: Date;
  disabled?: boolean;
  /**
   * `chip` (default): a thin outlined pill 「发生日期：今天」. `line`: a quiet line of text
   * 「发生在：2015 年」 with a calendar icon, for the top of a sheet (DraftReviewSheet).
   */
  trigger?: "chip" | "line";
  /** What the trigger says before the date (also its accessible name). */
  prefix?: string;
  className?: string;
};

type Draft = { precision: DatePrecision; year: number; month: number; day: number };

const PRECISIONS = [
  { value: "year", label: "年" },
  { value: "month", label: "月" },
  { value: "day", label: "日" },
];
const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];
const YEARS_PER_PAGE = 12;

function toValue(d: Draft): OccurredOn {
  if (d.precision === "year") return { precision: "year", year: d.year };
  if (d.precision === "month") return { precision: "month", year: d.year, month: d.month };
  return { precision: "day", year: d.year, month: d.month, day: d.day };
}

function fromValue(v: OccurredOn): Draft {
  return {
    precision: v.precision,
    year: v.year,
    month: v.precision === "year" ? 1 : v.month,
    day: v.precision === "day" ? v.day : 1,
  };
}

function todayDraft(today: Date): Draft {
  return {
    precision: "day",
    year: today.getFullYear(),
    month: today.getMonth() + 1,
    day: today.getDate(),
  };
}

/** Monday-first column (1-7) of the 1st of the month. */
const firstColumn = (year: number, month: number) =>
  ((new Date(year, month - 1, 1).getDay() + 6) % 7) + 1;

const daysIn = (year: number, month: number) => new Date(year, month, 0).getDate();

const cell = (selected: boolean, emphasise: boolean) =>
  cx(
    "motion-colors focus-ring h-[36px] cursor-pointer text-body-sm",
    selected
      ? "bg-primary-6 font-semibold text-on-primary"
      : cx("enabled:hover:bg-neutral-bg-muted", emphasise ? "font-semibold text-primary-6" : ""),
    "disabled:cursor-not-allowed disabled:text-neutral-text-disabled",
  );

/**
 * 发生日期 picker: a Chip (or a line of text) opening a bottom sheet with year / month / day
 * precision. Future dates are never selectable.
 */
export function DatePicker({
  value,
  onChange,
  today,
  disabled,
  trigger = "chip",
  prefix = "发生日期",
  className,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => fromValue(value));
  const [view, setView] = useState({ year: value.year, month: fromValue(value).month });
  const [yearPage, setYearPage] = useState(0);

  const ty = today.getFullYear();
  const tm = today.getMonth() + 1;
  const label = formatOccurredOn(value, today);

  const openSheet = () => {
    const d = fromValue(value);
    setDraft(d);
    setView({ year: d.year, month: d.month });
    setYearPage(Math.max(0, Math.floor((ty - d.year) / YEARS_PER_PAGE)));
    setOpen(true);
  };

  const update = (next: Draft) => {
    // Never let a precision switch or a year change leave the draft in the future.
    if (isFuture(toValue(next), today)) {
      const t = todayDraft(today);
      setDraft({ ...next, month: Math.min(next.month, t.month), day: t.day });
    } else {
      setDraft(next);
    }
  };

  const commit = () => {
    onChange(toValue(draft));
    setOpen(false);
  };

  const nav = (() => {
    if (draft.precision === "year") {
      const end = ty - yearPage * YEARS_PER_PAGE;
      return {
        title: `${end - YEARS_PER_PAGE + 1} – ${end}`,
        prev: { label: "更早", onClick: () => setYearPage((p) => p + 1), disabled: false },
        next: { label: "更晚", onClick: () => setYearPage((p) => p - 1), disabled: yearPage === 0 },
      };
    }
    if (draft.precision === "month") {
      return {
        title: `${view.year} 年`,
        prev: {
          label: "上一年",
          onClick: () => setView((v) => ({ ...v, year: v.year - 1 })),
          disabled: false,
        },
        next: {
          label: "下一年",
          onClick: () => setView((v) => ({ ...v, year: v.year + 1 })),
          disabled: view.year >= ty,
        },
      };
    }
    const shift = (delta: number) =>
      setView((v) => {
        const m = v.month + delta;
        return { year: v.year + Math.floor((m - 1) / 12), month: ((m - 1 + 12) % 12) + 1 };
      });
    return {
      title: `${view.year} 年 ${view.month} 月`,
      prev: { label: "上个月", onClick: () => shift(-1), disabled: false },
      next: {
        label: "下个月",
        onClick: () => shift(1),
        disabled: view.year > ty || (view.year === ty && view.month >= tm),
      },
    };
  })();

  return (
    <>
      {trigger === "line" ? (
        <button
          type="button"
          onClick={openSheet}
          disabled={disabled}
          aria-haspopup="dialog"
          data-date-line=""
          className={cx(
            "motion-colors focus-ring inline-flex cursor-pointer items-center gap-xs rounded-sm text-body-md text-neutral-text-primary",
            "enabled:hover:text-neutral-text-secondary disabled:cursor-not-allowed disabled:opacity-45",
            className,
          )}
        >
          <span>
            {prefix}：<span className="font-semibold">{label}</span>
          </span>
          <FiCalendar aria-hidden="true" className="text-neutral-text-tertiary" />
        </button>
      ) : (
        <Chip
          icon={<FiCalendar />}
          onClick={openSheet}
          disabled={disabled}
          aria-label={`${prefix}：${label}`}
          aria-haspopup="dialog"
          // DESIGN.md §2: a thin outlined pill, not a filled tag.
          className={cx("border-neutral-divider bg-transparent", className)}
        >
          {label}
        </Chip>
      )}
      <Drawer
        open={open}
        onOpenChange={setOpen}
        title="发生日期"
        footer={
          <>
            <Button
              variant="secondary"
              size="lg"
              className="flex-1"
              onClick={() => {
                const t = todayDraft(today);
                setDraft(t);
                setView({ year: t.year, month: t.month });
              }}
            >
              今天
            </Button>
            <Button
              size="lg"
              className="flex-1"
              disabled={isFuture(toValue(draft), today)}
              onClick={commit}
            >
              确定
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-md">
          <SegmentedControl
            aria-label="日期精度"
            options={PRECISIONS}
            value={draft.precision}
            onValueChange={(p) => update({ ...draft, precision: p as DatePrecision })}
            className="self-start"
          />

          <div className="flex items-center justify-between">
            <IconButton
              aria-label={nav.prev.label}
              icon={<FiChevronLeft />}
              size="sm"
              onClick={nav.prev.onClick}
              disabled={nav.prev.disabled}
            />
            <span className="text-body-md font-semibold" aria-live="polite">
              {nav.title}
            </span>
            <IconButton
              aria-label={nav.next.label}
              icon={<FiChevronRight />}
              size="sm"
              onClick={nav.next.onClick}
              disabled={nav.next.disabled}
            />
          </div>

          {draft.precision === "year" && (
            <div className="grid grid-cols-4 gap-xs">
              {Array.from({ length: YEARS_PER_PAGE }, (_, i) => {
                const y = ty - yearPage * YEARS_PER_PAGE - (YEARS_PER_PAGE - 1) + i;
                const selected = draft.year === y;
                return (
                  <button
                    key={y}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => update({ ...draft, year: y })}
                    className={cx(cell(selected, y === ty), "rounded-sm")}
                  >
                    {y} 年
                  </button>
                );
              })}
            </div>
          )}

          {draft.precision === "month" && (
            <div className="grid grid-cols-4 gap-xs">
              {Array.from({ length: 12 }, (_, i) => {
                const m = i + 1;
                const selected = draft.year === view.year && draft.month === m;
                return (
                  <button
                    key={m}
                    type="button"
                    aria-label={`${view.year} 年 ${m} 月`}
                    aria-pressed={selected}
                    disabled={isFuture({ precision: "month", year: view.year, month: m }, today)}
                    onClick={() => update({ ...draft, year: view.year, month: m })}
                    className={cx(cell(selected, view.year === ty && m === tm), "rounded-sm")}
                  >
                    {m} 月
                  </button>
                );
              })}
            </div>
          )}

          {draft.precision === "day" && (
            <div className="grid grid-cols-7 gap-xs">
              {WEEKDAYS.map((w) => (
                <span
                  key={w}
                  aria-hidden="true"
                  className="text-center text-caption text-neutral-text-secondary"
                >
                  {w}
                </span>
              ))}
              {Array.from({ length: daysIn(view.year, view.month) }, (_, i) => {
                const d = i + 1;
                const v: OccurredOn = {
                  precision: "day",
                  year: view.year,
                  month: view.month,
                  day: d,
                };
                const selected =
                  draft.year === view.year && draft.month === view.month && draft.day === d;
                const isToday = view.year === ty && view.month === tm && d === today.getDate();
                return (
                  <button
                    key={d}
                    type="button"
                    aria-label={`${view.year} 年 ${view.month} 月 ${d} 日`}
                    aria-pressed={selected}
                    disabled={isFuture(v, today)}
                    onClick={() => update({ ...draft, year: view.year, month: view.month, day: d })}
                    style={
                      d === 1 ? { gridColumnStart: firstColumn(view.year, view.month) } : undefined
                    }
                    className={cx(cell(selected, isToday), "rounded-full")}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </Drawer>
    </>
  );
}
