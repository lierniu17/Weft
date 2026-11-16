import { FiCheck } from "react-icons/fi";
import type { Draft, DraftPerson, DraftStatus } from "../../../contracts/draft.ts";
import { SELF_ID } from "../../../contracts/draft.ts";
import { cx } from "../../../lib/cx.ts";
import { describeItem, draftItems, draftSummary } from "../../../lib/draft.ts";
import { Button } from "../../basics/Button/Button.tsx";
import { Chip } from "../../basics/Chip/Chip.tsx";
import { Skeleton } from "../../basics/Skeleton/Skeleton.tsx";
import { ConfidenceBadge } from "../ConfidenceBadge/ConfidenceBadge.tsx";

export type DraftCardProps = {
  status: DraftStatus;
  /** pending / confirmed: the draft's content. */
  draft?: Draft;
  /** confirmed: the persons now in the graph, as links to their pages. */
  persons?: { person_id: string; name: string }[];
  /** confirmed: aliases learned by this confirmation (「小李 = 李明」). */
  learnedAliases?: { alias: string; name: string }[];
  onReview?: () => void;
  onRetry?: () => void;
  retrying?: boolean;
  onPersonClick?: (personId: string) => void;
  className?: string;
};

const PREVIEW = 3;

function personChip(p: DraftPerson) {
  if (p.match === "ambiguous") {
    return (
      <Chip key={p.id} variant="danger">
        {p.mention} → ？需选择
      </Chip>
    );
  }
  if (p.match === "new") {
    return (
      <Chip key={p.id} variant="selected">
        {p.mention} · 新人物
      </Chip>
    );
  }
  const name = p.person_id === SELF_ID ? "我" : (p.name ?? p.mention);
  return (
    <Chip key={p.id} variant="selected" icon={<FiCheck />}>
      {p.mention === name ? name : `${p.mention} → ${name}`}
    </Chip>
  );
}

const unverifiedCount = (draft?: Draft) =>
  draft?.facts.filter((f) => f.conflict?.action === "unverified").length ?? 0;

function title(status: DraftStatus, draft?: Draft): string {
  switch (status) {
    case "extracting":
      return "正在整理人物和关系…";
    case "failed":
      return "整理失败，原文已保存";
    case "discarded":
      return "已放弃";
    case "pending": {
      const s = draft ? draftSummary(draft) : { persons: 0, items: 0 };
      return `草稿 · ${s.persons} 个人物 · ${s.items} 条信息`;
    }
    case "confirmed": {
      const items = draft ? draftSummary(draft).items : 0;
      const unverified = unverifiedCount(draft);
      return `✓ 已入图谱 · ${items} 条信息${unverified ? ` · ${unverified} 条待核实` : ""}`;
    }
  }
}

/**
 * The draft card in the chat: one per Entry, its status changes in place
 * (抽取中 → 待确认 → 已入图谱, or 失败 / 已放弃). The title is a polite live region so
 * each change is announced, not only shown (AC-UI-9, AC-UI-10).
 */
export function DraftCard({
  status,
  draft,
  persons = [],
  learnedAliases = [],
  onReview,
  onRetry,
  retrying,
  onPersonClick,
  className,
}: DraftCardProps) {
  const items = draft ? draftItems(draft) : [];
  const more = items.length - PREVIEW;
  return (
    <section
      aria-label="草稿"
      aria-busy={status === "extracting" || undefined}
      data-draft-card={status}
      className={cx(
        "flex max-w-[88%] flex-col gap-sm rounded-md border p-md",
        status === "failed"
          ? "border-status-error-6 bg-status-error-1"
          : "border-neutral-divider bg-neutral-bg-container shadow-card",
        className,
      )}
    >
      <p
        role="status"
        aria-live="polite"
        className={cx(
          "text-body-md",
          status === "failed" && "text-status-error-6",
          status === "discarded" && "text-neutral-text-secondary",
          status === "extracting" && "text-neutral-text-secondary",
          (status === "pending" || status === "confirmed") &&
            "font-semibold text-neutral-text-primary",
        )}
      >
        {title(status, draft)}
      </p>

      {status === "extracting" && (
        <div className="flex flex-col gap-sm">
          <Skeleton width="80%" />
          <Skeleton width="60%" />
          <Skeleton width="70%" />
        </div>
      )}

      {status === "failed" && (
        <>
          <p className="text-caption text-status-error-6">可能是网络或模型繁忙，可以重试</p>
          <Button
            variant="secondary"
            size="sm"
            className="self-start"
            onClick={onRetry}
            loading={retrying}
          >
            重试
          </Button>
        </>
      )}

      {status === "pending" && draft && (
        <>
          <div className="flex flex-wrap gap-xs">{draft.persons.map(personChip)}</div>
          <ul className="flex flex-col gap-xs">
            {items.slice(0, PREVIEW).map((item) => {
              const unverified = "conflict" in item && item.conflict?.action === "unverified";
              return (
                <li
                  key={item.id}
                  data-draft-line=""
                  className={cx(
                    "flex items-center gap-xs text-body-sm",
                    unverified ? "text-status-warning-6" : "text-neutral-text-secondary",
                  )}
                >
                  <span className="min-w-[0] truncate">{describeItem(draft, item)}</span>
                  <ConfidenceBadge level={item.confidence} />
                  {unverified && <span className="shrink-0 text-caption">待核实</span>}
                </li>
              );
            })}
          </ul>
          {more > 0 && <p className="text-caption text-neutral-text-secondary">还有 {more} 条</p>}
          <Button className="self-start" onClick={onReview}>
            查看并确认
          </Button>
        </>
      )}

      {status === "confirmed" && (
        <>
          {persons.length > 0 && (
            <div className="flex flex-wrap gap-xs">
              {persons.map((p) => (
                <Chip
                  key={p.person_id}
                  aria-label={p.name}
                  onClick={() => onPersonClick?.(p.person_id)}
                >
                  {p.name} ›
                </Chip>
              ))}
            </div>
          )}
          {learnedAliases.length > 0 && (
            <p className="text-caption text-neutral-text-secondary">
              学到别名：{learnedAliases.map((a) => `${a.alias} = ${a.name}`).join("，")}
            </p>
          )}
        </>
      )}
    </section>
  );
}
