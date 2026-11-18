import { useId } from "react";
import { cx } from "../../../lib/cx.ts";
import { type QuotaLevel, quotaLevel } from "../../../lib/quota.ts";
import { useNumberRoll } from "../../../lib/useMotion.ts";

export type QuotaUsage = { used: number; limit: number };

export type QuotaMeterProps = {
  record: QuotaUsage;
  ask: QuotaUsage;
  /** e.g. 「北京时间 0 点重置」 */
  resetHint?: string;
  className?: string;
};

const COLOR: Record<QuotaLevel, string> = {
  normal: "text-neutral-text-primary",
  low: "text-status-warning-6",
  exhausted: "text-status-error-6",
};

const NOTE: Record<QuotaLevel, string | null> = {
  normal: null,
  low: "即将用完",
  exhausted: "已用完",
};

/** The used count; it rolls in from below when it changes (style refresh AC-15). */
function Used({ value }: { value: number }) {
  const [key, roll] = useNumberRoll(value);
  return (
    <span key={key} data-quota-used="" className={roll}>
      {value}
    </span>
  );
}

/**
 * 今日额度: 记录 x / 50, 提问 x / 100 as list rows — numbers right-aligned in tabular figures,
 * 「/ 50」 in meta grey; warning under 10%, error when used up.
 */
export function QuotaMeter({ record, ask, resetHint, className }: QuotaMeterProps) {
  const titleId = useId();
  const rows = [
    { kind: "record", label: "记录", usage: record },
    { kind: "ask", label: "提问", usage: ask },
  ];
  return (
    <section aria-labelledby={titleId} className={cx("flex flex-col", className)}>
      <h2 id={titleId} className="px-md pb-sm text-section text-neutral-text-tertiary">
        今日额度
      </h2>
      <dl className="flex flex-col divide-y divide-neutral-divider">
        {rows.map(({ kind, label, usage }) => {
          const level = quotaLevel(usage.used, usage.limit);
          const note = NOTE[level];
          return (
            <div
              key={kind}
              data-quota={kind}
              data-level={level}
              className="flex min-h-[56px] items-center gap-sm px-md"
            >
              <dt className="flex-1 text-body-md text-neutral-text-primary">
                {label}
                {note && <span className={cx("ml-sm text-meta", COLOR[level])}>{note}</span>}
              </dt>
              <dd
                data-quota-value=""
                className={cx("text-right text-body-md tabular-nums", COLOR[level])}
              >
                <Used value={usage.used} />{" "}
                <span className="text-meta text-neutral-text-tertiary">/ {usage.limit}</span>
              </dd>
            </div>
          );
        })}
      </dl>
      {resetHint && <p className="px-md pt-xs text-meta text-neutral-text-tertiary">{resetHint}</p>}
    </section>
  );
}
