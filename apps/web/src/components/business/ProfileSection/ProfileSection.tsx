import { type ReactNode, useId, useState } from "react";
import { FiChevronRight, FiX } from "react-icons/fi";
import { cx } from "../../../lib/cx.ts";
import { formatPeriod, parsePartialDate } from "../../../lib/datePrecision.ts";
import { useTruncated } from "../../../lib/useTruncated.ts";
import { Button } from "../../basics/Button/Button.tsx";
import { Chip } from "../../basics/Chip/Chip.tsx";
import { IconButton } from "../../basics/IconButton/IconButton.tsx";
import { Input } from "../../basics/Input/Input.tsx";
import { SectionHeader } from "../../composites/SectionHeader/SectionHeader.tsx";

export type ProfileSectionVariant = "roles" | "tags" | "notes" | "opinion" | "summary";

export type ProfileItem = {
  id: string;
  /** Organization / tag / note / opinion text. */
  text: string;
  /** roles: kind such as 学校 / 城市 (shown after the name). */
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
  /** Injected clock for periods. */
  today: Date;
  /** Opens the item's citation (AC-25). */
  onItemOpen?: (id: string) => void;
  /** In-place editing (tags: removable chips + add; notes / opinion: inputs). */
  editing?: boolean;
  onItemChange?: (id: string, text: string) => void;
  onItemRemove?: (id: string) => void;
  onItemAdd?: (text: string) => void;
  className?: string;
};

const DEFAULT_TITLE: Partial<Record<ProfileSectionVariant, string>> = {
  roles: "社会角色",
  opinion: "我的评价",
  summary: "综合描述",
};

const ROW =
  "motion-colors focus-ring flex w-full cursor-pointer items-center gap-sm rounded-sm py-sm text-left text-body-md text-neutral-text-primary hover:bg-neutral-bg-layout";

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
      <FiChevronRight aria-hidden="true" className="shrink-0 text-neutral-text-secondary" />
    </button>
  );
}

function Summary({ text, generatedAt }: { text: string; generatedAt: string }) {
  const [expanded, setExpanded] = useState(false);
  const [ref, clamped] = useTruncated<HTMLParagraphElement>();
  return (
    <div data-summary="" className="flex flex-col gap-xs rounded-md bg-neutral-bg-layout p-md">
      <p
        ref={ref}
        className={cx("text-body-sm text-neutral-text-primary", !expanded && "line-clamp-3")}
      >
        {text}
      </p>
      <div className="flex items-center justify-between gap-sm">
        <span className="text-caption text-neutral-text-secondary">
          {generatedLabel(generatedAt)}
        </span>
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

function AddTag({ title, onAdd }: { title: string; onAdd: (text: string) => void }) {
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
 * Empty sections stay visible with 「还没有记录」 (AC-21).
 */
export function ProfileSection({
  variant,
  title,
  items,
  summary,
  today,
  onItemOpen,
  editing,
  onItemChange,
  onItemRemove,
  onItemAdd,
  className,
}: ProfileSectionProps) {
  const headingId = useId();
  const [historyOpen, setHistoryOpen] = useState(false);
  const name = title ?? DEFAULT_TITLE[variant] ?? "";
  const empty = variant === "summary" ? !summary : items.length === 0;

  const role = (item: ProfileItem) => (
    <ItemRow key={item.id} item={item} onOpen={onItemOpen}>
      {item.text}
      {item.note && ` · ${item.note}`}
      {item.start && (
        <span className="text-neutral-text-secondary">
          {" · "}
          {formatPeriod(item.start, item.end, today)}
        </span>
      )}
    </ItemRow>
  );

  let body: ReactNode;
  if (empty && !(variant === "tags" && editing)) {
    body = <p className="py-sm text-body-sm text-neutral-text-secondary">还没有记录</p>;
  } else if (variant === "summary" && summary) {
    body = <Summary text={summary.text} generatedAt={summary.generatedAt} />;
  } else if (variant === "roles") {
    const current = items.filter((i) => !i.end);
    const history = items.filter((i) => i.end);
    body = (
      <>
        {current.map(role)}
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
        {editing && onItemAdd && <AddTag title={name} onAdd={onItemAdd} />}
      </div>
    );
  } else if (editing) {
    body = items.map((item, i) => (
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
  } else if (variant === "opinion") {
    body = items.map((item) => (
      <ItemRow key={item.id} item={item} onOpen={onItemOpen}>
        <span
          data-opinion=""
          className="block border-l-[3px] border-secondary-6 pl-sm text-neutral-text-primary italic"
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
      <SectionHeader id={headingId} title={name} level={3} />
      {body}
    </section>
  );
}
