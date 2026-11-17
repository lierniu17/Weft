import { type ReactNode, useId } from "react";
import type { Category, Confidence, RelationshipStatus } from "../../../contracts/draft.ts";
import { cx } from "../../../lib/cx.ts";
import { formatPartialDate } from "../../../lib/datePrecision.ts";
import { ConfidenceBadge } from "../ConfidenceBadge/ConfidenceBadge.tsx";
import { PersonRow } from "../PersonRow/PersonRow.tsx";
import { RelationStatusTag } from "../RelationStatusTag/RelationStatusTag.tsx";
import { RelationshipTypeTag } from "../RelationshipTypeTag/RelationshipTypeTag.tsx";

export type RelationshipOverviewProps = {
  /** self-pair: 「我和他」; third-party: 「A 与 B」 with a ConfidenceBadge. */
  variant: "self-pair" | "third-party";
  a: string;
  b: string;
  types: { category: Category; subtype: string; original?: string | null; custom?: boolean }[];
  status?: RelationshipStatus | null;
  /** 认识时间, contract partial date ("2012" | "2012-09" | "2012-09-01"). */
  metAt?: string | null;
  /** 认识途径 */
  origin?: string | null;
  /** 介绍人, a link to their page. */
  introducedBy?: { id: string; name: string } | null;
  summary?: string | null;
  confidence?: Confidence | null;
  /** Injected clock for date display. */
  today: Date;
  onIntroducerClick?: (id: string) => void;
  className?: string;
};

function Missing() {
  return <span className="text-neutral-text-secondary">未记录</span>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-[0] items-baseline gap-sm py-xs">
      <dt className="w-[72px] shrink-0 text-caption text-neutral-text-secondary">{label}</dt>
      <dd className="min-w-[0] flex-1 break-words text-body-sm text-neutral-text-primary">
        {children}
      </dd>
    </div>
  );
}

/**
 * 关系页顶部的关系概览 (AC-28): relationship types (several allowed, with the original
 * words), current status, 认识时间 / 认识途径 / 介绍人 and a summary; a third-party
 * relationship carries its confidence. Missing fields read 「未记录」, never hidden.
 */
export function RelationshipOverview({
  variant,
  a,
  b,
  types,
  status,
  metAt,
  origin,
  introducedBy,
  summary,
  confidence,
  today,
  onIntroducerClick,
  className,
}: RelationshipOverviewProps) {
  const headingId = useId();
  const title = variant === "self-pair" ? "我和他" : `${a} 与 ${b}`;
  return (
    <section
      aria-labelledby={headingId}
      data-relationship-overview={variant}
      className={cx("flex min-w-[0] flex-col gap-sm px-md py-md", className)}
    >
      <div className="flex min-w-[0] items-center gap-sm">
        <h2 id={headingId} className="min-w-[0] flex-1 truncate text-h3 text-neutral-text-primary">
          {title}
        </h2>
        {variant === "third-party" && confidence && <ConfidenceBadge level={confidence} />}
      </div>
      <div className="flex min-w-[0] flex-wrap gap-xs">
        {types.map((t) => (
          <RelationshipTypeTag key={`${t.category}-${t.subtype}`} {...t} />
        ))}
        {status ? <RelationStatusTag status={status} /> : null}
        {types.length === 0 && !status && (
          <span className="text-body-sm text-neutral-text-secondary">关系类型未记录</span>
        )}
      </div>
      <dl className="flex flex-col">
        <Field label="认识时间">{metAt ? formatPartialDate(metAt, today) : <Missing />}</Field>
        <Field label="认识途径">{origin || <Missing />}</Field>
        <Field label="介绍人">
          {introducedBy ? (
            <PersonRow
              person={{ id: introducedBy.id, name: introducedBy.name }}
              onClick={onIntroducerClick}
            />
          ) : (
            <Missing />
          )}
        </Field>
        <Field label="总结">{summary || <Missing />}</Field>
      </dl>
    </section>
  );
}
