import { cx } from "../../../lib/cx.ts";
import type { PersonSummary } from "../../../lib/graph/scene.ts";
import { Button } from "../../basics/Button/Button.tsx";

export type GraphPersonCardProps = {
  summary: PersonSummary;
  /** 喜好前三项 (from the person's profile, when loaded). */
  likes?: string[];
  /** Starfield: the card sits on the dark graph. */
  dark?: boolean;
  /** 「查看人物页」; omitted for 我 / the page's own person. */
  onOpen?: () => void;
  /** Fits the page outline: 2 over the panorama, 3 under a section, 4 in the list view. */
  headingLevel?: 2 | 3 | 4;
  className?: string;
};

function Tag({ children, dark }: { children: string; dark?: boolean }) {
  return (
    <li
      className={cx(
        "inline-flex h-[20px] items-center rounded-full px-sm text-caption",
        dark
          ? "bg-graph-dark-panel-border text-graph-dark-text"
          : "bg-neutral-bg-layout text-neutral-text-secondary",
      )}
    >
      {children}
    </li>
  );
}

/**
 * 人物卡片 shown when a person is focused on the graph (graph-viz AC-10): name, relationship
 * types, closeness (both ways when they differ), 认识时间, 可信度, groups, top three likes and
 * their other relationships, with 「查看人物页」.
 */
export function GraphPersonCard({
  summary,
  likes,
  dark,
  onOpen,
  headingLevel = 3,
  className,
}: GraphPersonCardProps) {
  const Heading = `h${headingLevel}` as const;
  const meta = [summary.types.join("；"), summary.closeness, summary.met].filter(Boolean);
  return (
    <section
      aria-label={`${summary.name}的卡片`}
      data-graph-card={summary.id}
      className={cx(
        "flex flex-col gap-sm rounded-md border p-md shadow-card",
        dark
          ? "border-graph-dark-panel-border bg-graph-dark-panel text-graph-dark-text"
          : "border-neutral-divider bg-neutral-bg-container text-neutral-text-primary",
        className,
      )}
    >
      <div className="flex flex-col gap-xs">
        <Heading className="text-h3">{summary.name}</Heading>
        <p
          className={cx(
            "text-caption",
            dark ? "text-graph-dark-text-muted" : "text-neutral-text-secondary",
          )}
        >
          {meta.join(" · ")}
        </p>
      </div>
      <ul aria-label="标签" className="flex flex-wrap gap-xs">
        {summary.confidence && <Tag dark={dark}>{`可信度：${summary.confidence}`}</Tag>}
        {summary.status && <Tag dark={dark}>{`关系${summary.status}`}</Tag>}
        {summary.groups.map((g) => (
          <Tag key={g} dark={dark}>
            {g}
          </Tag>
        ))}
        {(likes ?? []).slice(0, 3).map((l) => (
          <Tag key={l} dark={dark}>{`喜欢${l}`}</Tag>
        ))}
      </ul>
      {summary.relations.length > 0 && (
        <p
          className={cx(
            "text-caption",
            dark ? "text-graph-dark-text-muted" : "text-neutral-text-secondary",
          )}
        >
          他的关系：{summary.relations.join("；")}
        </p>
      )}
      {onOpen && (
        <Button variant="secondary" size="sm" onClick={onOpen} className="self-start">
          查看人物页
        </Button>
      )}
    </section>
  );
}
