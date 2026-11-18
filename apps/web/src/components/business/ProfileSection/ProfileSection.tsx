import { type ReactNode, useId, useState } from "react";
import { FiChevronRight, FiX } from "react-icons/fi";
import { cx } from "../../../lib/cx.ts";
import { formatPeriod, parsePartialDate } from "../../../lib/datePrecision.ts";
import { useTruncated } from "../../../lib/useTruncated.ts";
import { Button } from "../../basics/Button/Button.tsx";
import { Chip } from "../../basics/Chip/Chip.tsx";
import { IconButton } from "../../basics/IconButton/IconButton.tsx";
import { Input } from "../../basics/Input/Input.tsx";
import { Skeleton } from "../../basics/Skeleton/Skeleton.tsx";
import { SectionHeader } from "../../composites/SectionHeader/SectionHeader.tsx";

export type ProfileSectionVariant = "roles" | "tags" | "notes" | "opinion" | "summary";

export type ProfileItem = {
  id: string;
  /** Organization / tag / note / opinion text. */
  text: string;
  /** roles: the second line after the period — a relation (同事 / 同学) or kind (学校 / 城市). */
  note?: string | null;
  /** roles: period start and end, contract partial dates; no end = 至今 (current). */
  start?: string | null;
  end?: string | null;
  /** 待核实 (AC-15). */
  unverified?: boolean;
};

export type ProfileSectionProps = {
  variant: ProfileSectionVariant;
  /** Defaults: roles 社会角色, opinion 我的评价, summary 综合描述. */
  title?: string;
  items: ProfileItem[];
  /** summary variant. */
  summary?: { text: string; generatedAt: string } | null;
  /** summary variant: none yet but one is being generated — a text skeleton holds its place. */
  summaryPending?: boolean;
  /** Injected clock for periods. */
  today: Date;
  /** Opens the item's citation (AC-25). */
  onItemOpen?: (id: string) => void;
  /** In-place editing (tags: removable chips + add; notes / opinion: inputs). */
  editing?: boolean;
  onItemChange?: (id: string, text: string) => void;
  onItemRemove?: (id: string) => void;
  onItemAdd?: (text: string) => void;
  /** Editing: focus the 添加 input when it appears (entered from 「还可以补充」). */
  focusAdd?: boolean;
  className?: string;
};

const DEFAULT_TITLE: Partial<Record<ProfileSectionVariant, string>> = {
  roles: "社会角色",
  opinion: "我的评价",
  summary: "综合描述",
};

const ROW =
  "motion-colors focus-ring flex w-full cursor-pointer items-center gap-sm rounded-sm py-sm text-left text-body-md text-neutral-text-primary hover:bg-neutral-bg-subtle";

const pad = (n: number) => String(n).padStart(2, "0");

function generatedLabel(value: string): string {
  const d = parsePartialDate(value);
  return d.precision === "day" ? `${pad(d.month)}-${pad(d.day)} 生成` : `${value} 生成`;
}

function Unverified() {
  return <span className="shrink-0 text-caption text-status-warning-6">待核实</span>;
}

function ItemRow({
  item,
  onOpen,
  children,
}: {
  item: ProfileItem;
  onOpen?: (id: string) => void;
  children: ReactNode;
}) {
  const content = (
    <>
      <span className="min-w-[0] flex-1">{children}</span>
      {item.unverified && <Unverified />}
    </>
  );
  if (!onOpen) return <div className="flex items-center gap-sm py-sm text-body-md">{content}</div>;
  return (
    <button type="button" onClick={() => onOpen(item.id)} className={ROW}>
      {content}
      <FiChevronRight aria-hidden="true" className="shrink-0 text-neutral-text-disabled" />
    </button>
  );
}

function Summary({ text, generatedAt }: { text: string; generatedAt: string }) {
  const [expanded, setExpanded] = useState(false);
  const [ref, clamped] = useTruncated<HTMLParagraphElement>();
  return (
    <div data-summary="" className="flex flex-col gap-xs rounded-md bg-neutral-bg-subtle p-md">
      <p
        ref={ref}
        className={cx(
          "text-body-md leading-[26px] text-neutral-text-primary",
          !expanded && "line-clamp-3",
        )}
      >
        {text}
      </p>
      <div className="flex items-center justify-between gap-sm">
        <span className="text-meta text-neutral-text-tertiary">{generatedLabel(generatedAt)}</span>
        {(clamped || expanded) && (
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "收起" : "展开"}
          </Button>
        )}
      </div>
    </div>
  );
}

function AddTag({
  title,
  onAdd,
  autoFocus,
}: {
  title: string;
  onAdd: (text: string) => void;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState("");
  const submit = () => {
    const text = value.trim();
    if (!text) return;
    onAdd(text);
    setValue("");
  };
  return (
    <form
      className="flex items-start gap-sm"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Input
        aria-label={`添加${title}`}
        placeholder={`添加${title}`}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => setValue(e.target.value)}
        className="flex-1"
      />
      <Button type="submit" variant="secondary" disabled={!value.trim()}>
        添加
      </Button>
    </form>
  );
}

/**
 * One area of a person's 画像. Every item opens its citation; editing works in place.
 * An empty section renders nothing (style refresh AC-9): the page lists what is missing in
 * one 「还可以补充：……」 line (ProfileSectionFold) instead of repeating 「还没有记录」.
 * While editing, an empty section shows so something can be added.
 */
export function ProfileSection({
  variant,
  title,
  items,
  summary,
  summaryPending,
  today,
  onItemOpen,
  editing,
  onItemChange,
  onItemRemove,
  onItemAdd,
  focusAdd,
  className,
}: ProfileSectionProps) {
  const headingId = useId();
  const [historyOpen, setHistoryOpen] = useState(false);
  const name = title ?? DEFAULT_TITLE[variant] ?? "";
  const empty = variant === "summary" ? !summary && !summaryPending : items.length === 0;

  const role = (item: ProfileItem) => {
    // Two lines like 方案 A: 「字节跳动」 over 「2018 年 3 月 – 至今 · 同事」.
    const sub = [item.start ? formatPeriod(item.start, item.end, today) : null, item.note]
      .filter(Boolean)
      .join(" · ");
    return (
      <ItemRow key={item.id} item={item} onOpen={onItemOpen}>
        <span data-role-title="" className="block">
          {item.text}
        </span>
        {sub && (
          <span data-role-sub="" className="block text-meta text-neutral-text-tertiary">
            {sub}
          </span>
        )}
      </ItemRow>
    );
  };

  if (empty && !(editing && onItemAdd)) return null;

  const add = editing && onItemAdd && (
    <AddTag title={name} onAdd={onItemAdd} autoFocus={focusAdd} />
  );
  let body: ReactNode;
  if (variant === "summary" && !summary) {
    body = (
      <div
        data-summary-pending=""
        role="status"
        aria-busy="true"
        aria-label="正在生成综合描述"
        className="flex flex-col gap-sm rounded-md bg-neutral-bg-subtle p-md"
      >
        <Skeleton />
        <Skeleton />
        <Skeleton width="60%" />
      </div>
    );
  } else if (variant === "summary" && summary) {
    body = <Summary text={summary.text} generatedAt={summary.generatedAt} />;
  } else if (variant === "roles") {
    const current = items.filter((i) => !i.end);
    const history = items.filter((i) => i.end);
    body = (
      <>
        {current.map(role)}
        {add && <div className="py-xs">{add}</div>}
        {history.length > 0 && (
          <div className="flex flex-col">
            <button
              type="button"
              aria-expanded={historyOpen}
              onClick={() => setHistoryOpen((v) => !v)}
              className="focus-ring self-start rounded-sm py-xs text-caption text-neutral-text-secondary"
            >
              历史（{history.length}）
            </button>
            {historyOpen && <div className="flex flex-col">{history.map(role)}</div>}
          </div>
        )}
      </>
    );
  } else if (variant === "tags") {
    body = (
      <div className="flex flex-col gap-sm py-sm">
        {items.length > 0 && (
          <ul className="flex flex-wrap gap-xs">
            {items.map((item) => (
              <li key={item.id}>
                {editing ? (
                  <Chip onRemove={() => onItemRemove?.(item.id)}>{item.text}</Chip>
                ) : (
                  <Chip
                    variant={item.unverified ? "warning" : "neutral"}
                    onClick={onItemOpen ? () => onItemOpen(item.id) : undefined}
                  >
                    {item.unverified ? `${item.text} · 待核实` : item.text}
                  </Chip>
                )}
              </li>
            ))}
          </ul>
        )}
        {add}
      </div>
    );
  } else if (editing) {
    const rows = items.map((item, i) => (
      <div key={item.id} className="flex items-start gap-xs py-xs">
        <Input
          aria-label={`${name} ${i + 1}`}
          defaultValue={item.text}
          onChange={(e) => onItemChange?.(item.id, e.target.value)}
          className="flex-1"
        />
        <IconButton
          aria-label={`删除 ${item.text}`}
          icon={<FiX />}
          onClick={() => onItemRemove?.(item.id)}
        />
      </div>
    ));
    body = (
      <>
        {rows}
        {add && <div className="py-xs">{add}</div>}
      </>
    );
  } else if (variant === "opinion") {
    body = items.map((item) => (
      <ItemRow key={item.id} item={item} onOpen={onItemOpen}>
        <span
          data-opinion=""
          className="block border-l-[3px] border-neutral-text-secondary pl-sm text-neutral-text-primary italic"
        >
          {item.text}
        </span>
      </ItemRow>
    ));
  } else {
    body = items.map((item) => (
      <ItemRow key={item.id} item={item} onOpen={onItemOpen}>
        {item.text}
      </ItemRow>
    ));
  }

  return (
    <section
      aria-labelledby={headingId}
      data-profile-section={variant}
      className={cx("flex flex-col", className)}
    >
      <SectionHeader id={headingId} title={name} level={2} />
      {body}
    </section>
  );
}

export type ProfileGap = { key: string; label: string };

export type ProfileSectionFoldProps = {
  /** What has nothing yet: identity fields and empty sections, in page order. */
  gaps: ProfileGap[];
  /** Opens that one in place (the identity form, a section's 添加 input). */
  onPick?: (key: string) => void;
  className?: string;
};

/**
 * ProfileSection's empty state (style refresh AC-9): every empty area folded into one line,
 * 「还可以补充：生日、籍贯、相处之道」; each item opens its in-place edit.
 */
export function ProfileSectionFold({ gaps, onPick, className }: ProfileSectionFoldProps) {
  if (gaps.length === 0) return null;
  return (
    <p
      data-profile-fold=""
      className={cx("py-sm text-body-sm text-neutral-text-tertiary", className)}
    >
      还可以补充：
      {gaps.map((g, i) => (
        <span key={g.key}>
          {i > 0 && "、"}
          {onPick ? (
            <button
              type="button"
              onClick={() => onPick(g.key)}
              className="motion-colors focus-ring cursor-pointer rounded-sm font-medium text-neutral-text-primary underline decoration-neutral-border underline-offset-[3px] hover:decoration-neutral-text-tertiary"
            >
              {g.label}
            </button>
          ) : (
            g.label
          )}
        </span>
      ))}
    </p>
  );
}
