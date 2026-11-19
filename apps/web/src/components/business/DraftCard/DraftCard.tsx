import { type CSSProperties, useEffect, useRef, useState } from "react";
import type { Draft, DraftPerson, DraftStatus } from "../../../contracts/draft.ts";
import { SELF_ID } from "../../../contracts/draft.ts";
import { cx } from "../../../lib/cx.ts";
import { draftItems, draftQuestionLine, draftSummary, itemSentence } from "../../../lib/draft.ts";
import { motionMs, staggerDelayMs } from "../../../lib/motion.ts";
import { useReducedMotion } from "../../../lib/useMediaQuery.ts";
import { Button } from "../../basics/Button/Button.tsx";
import { Chip } from "../../basics/Chip/Chip.tsx";
import { Skeleton } from "../../basics/Skeleton/Skeleton.tsx";
import { ConfidenceBadge } from "../ConfidenceBadge/ConfidenceBadge.tsx";

export type DraftCardProps = {
  status: DraftStatus;
  /**
   * The card region's accessible name. Every card in a feed is a region, so each needs its
   * own name (axe landmark-unique); the chat passes 「草稿 · <发生日期> · <记录开头>」.
   */
  label?: string;
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
        {p.mention} 是谁？需选择
      </Chip>
    );
  }
  if (p.match === "new") {
    return (
      <Chip key={p.id} avatar={p.mention}>
        {p.mention} · 新人物
      </Chip>
    );
  }
  const name = p.person_id === SELF_ID ? "我" : (p.name ?? p.mention);
  return (
    <Chip key={p.id} avatar={name}>
      {p.mention === name ? name : `${p.mention} 是 ${name}`}
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
      return `已入图谱 · ${items} 条信息${unverified ? ` · ${unverified} 条待核实` : ""}`;
    }
  }
}

/** The green check of 已入图谱; its stroke is drawn (stroke-dashoffset) when `draw`. */
function Check({ draw }: { draw: boolean }) {
  return (
    <svg
      aria-hidden="true"
      data-draft-check=""
      viewBox="0 0 20 20"
      className="size-[20px] shrink-0"
    >
      <circle cx="10" cy="10" r="10" className="fill-status-success-graphic" />
      <path
        d="M5.8 10.4l2.8 2.7 5.6-5.8"
        fill="none"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="14"
        className={cx(
          "stroke-on-primary",
          // after the review sheet has left (motion.sheet-exit), a beat later than the fold
          draw &&
            "animate-check-draw [animation-delay:calc(var(--motion-sheet-exit)+var(--motion-fast))]",
        )}
      />
    </svg>
  );
}

/** How long the fold of a just-confirmed card takes: it waits for the sheet to leave. */
const FOLD_MS = motionMs("sheet-exit") + motionMs("emphasis");

/**
 * The draft card in the chat: one per Entry, its status changes in place — the same DOM
 * node from 抽取中 → 待确认 → 已入图谱 (or 失败 / 已放弃). The title is a polite live region
 * so each change is announced, not only shown (AC-UI-9, AC-UI-10).
 *
 * 补充追问 (conversation-context AC-5): while 待确认, the first unanswered question is one
 * grey line under the summary — 「还差一点：小李是你的同事还是同学？」 — answered in the sheet.
 *
 * Confirming (style refresh AC-14): once the review sheet has left, the card folds its
 * preview away (grid-template-rows 1fr → 0fr) and settles on bg-subtle (motion.emphasis),
 * the green check is drawn, and the persons now in the graph pop in once. A card that was
 * already confirmed when it mounted shows the settled state without any of that; with
 * 「减少动态效果」 every step is a direct switch, the check shown drawn.
 */
export function DraftCard({
  status,
  label = "草稿",
  draft,
  persons = [],
  learnedAliases = [],
  onReview,
  onRetry,
  retrying,
  onPersonClick,
  className,
}: DraftCardProps) {
  const reduced = useReducedMotion();
  const sawPending = useRef(status === "pending");
  if (status === "pending") sawPending.current = true;
  // Confirmed in front of the user (not on page load): play the 入图谱 moment once.
  const celebrate = status === "confirmed" && sawPending.current;
  const [folded, setFolded] = useState(false);
  useEffect(() => {
    if (!celebrate) return;
    if (reduced) {
      setFolded(true);
      return;
    }
    const timer = setTimeout(() => setFolded(true), FOLD_MS);
    return () => clearTimeout(timer);
  }, [celebrate, reduced]);

  const items = draft ? draftItems(draft) : [];
  const more = items.length - PREVIEW;
  const asking = draftQuestionLine(draft, status);
  // The preview stays mounted while it folds away, so the fold is a transition.
  const preview = status === "pending" || (celebrate && !folded);
  const settled = status === "confirmed";

  return (
    <section
      aria-label={label}
      aria-busy={status === "extracting" || undefined}
      data-draft-card={status}
      className={cx(
        "flex w-full flex-col overflow-hidden rounded-md border",
        "transition-[background-color,border-color] duration-[var(--motion-emphasis)] ease-[var(--motion-easing-standard)]",
        celebrate && "delay-[var(--motion-sheet-exit)]",
        status === "failed" && "border-transparent bg-status-error-1",
        settled && "border-transparent bg-neutral-bg-subtle",
        !settled && status !== "failed" && "border-neutral-divider bg-neutral-bg-container",
        className,
      )}
    >
      <p
        role="status"
        aria-live="polite"
        className={cx(
          "flex items-center gap-sm px-md pt-md text-body-sm",
          !preview && status !== "extracting" && status !== "failed" && "pb-md",
          status === "failed" && "text-status-error-6",
          (status === "discarded" || status === "extracting") && "text-neutral-text-secondary",
          (status === "pending" || settled) && "font-semibold text-neutral-text-primary",
        )}
      >
        {settled && <Check draw={celebrate && !reduced} />}
        {title(status, draft)}
      </p>

      {status === "extracting" && (
        <div className="flex flex-col gap-sm px-md pt-sm pb-md">
          <Skeleton width="80%" />
          <Skeleton width="60%" />
          <Skeleton width="70%" />
        </div>
      )}

      {status === "failed" && (
        <div className="flex flex-col items-start gap-sm px-md pt-xs pb-md">
          <p className="text-meta text-status-error-6">可能是网络或模型繁忙，可以重试</p>
          <Button variant="secondary" size="sm" onClick={onRetry} loading={retrying}>
            重试
          </Button>
        </div>
      )}

      {preview && draft && (
        <div
          data-draft-preview=""
          aria-hidden={settled || undefined}
          inert={settled || undefined}
          className={cx(
            "grid transition-[grid-template-rows,opacity] duration-[var(--motion-emphasis)] ease-[var(--motion-easing-standard)]",
            settled
              ? "grid-rows-[0fr] opacity-0 delay-[var(--motion-sheet-exit)]"
              : "grid-rows-[1fr]",
          )}
        >
          <div className="min-h-[0] overflow-hidden">
            <div className="flex flex-col gap-sm px-md pt-sm pb-md">
              <div className="flex flex-wrap gap-xs">{draft.persons.map(personChip)}</div>
              <ul className="flex flex-col">
                {items.slice(0, PREVIEW).map((item) => {
                  const s = itemSentence(draft, item);
                  const unverified = "conflict" in item && item.conflict?.action === "unverified";
                  return (
                    <li key={item.id} data-draft-line="" className="text-body-sm leading-[24px]">
                      <ConfidenceBadge
                        level={item.confidence}
                        sentence={s.text}
                        subject={s.subject}
                        className="text-body-sm text-neutral-text-secondary"
                      />
                      {unverified && (
                        <span className="ml-xs text-meta text-status-warning-6">待核实</span>
                      )}
                    </li>
                  );
                })}
              </ul>
              {more > 0 && <p className="text-meta text-neutral-text-tertiary">还有 {more} 条</p>}
              {asking && (
                <p data-draft-question-line="" className="text-body-sm text-neutral-text-secondary">
                  {asking}
                </p>
              )}
              {status === "pending" && (
                <Button className="self-start" onClick={onReview}>
                  查看并确认
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {settled && (persons.length > 0 || learnedAliases.length > 0) && (
        <div className="flex flex-col gap-sm px-md pb-md">
          {persons.length > 0 && (
            <div className="flex flex-wrap gap-xs">
              {persons.map((p, i) => (
                // a person who just entered the graph pops in once (0.9 → 1.04 → 1)
                <span
                  key={p.person_id}
                  data-draft-person=""
                  className={cx(
                    "inline-flex",
                    celebrate && "animate-pop [animation-fill-mode:both]",
                  )}
                  style={
                    celebrate
                      ? ({
                          animationDelay: `calc(var(--motion-sheet-exit) + ${staggerDelayMs(i)}ms)`,
                        } as CSSProperties)
                      : undefined
                  }
                >
                  <Chip avatar={p.name} onClick={() => onPersonClick?.(p.person_id)}>
                    {p.name}
                  </Chip>
                </span>
              ))}
            </div>
          )}
          {learnedAliases.length > 0 && (
            <p className="text-meta text-neutral-text-tertiary">
              学到别名：{learnedAliases.map((a) => `${a.alias} = ${a.name}`).join("，")}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
