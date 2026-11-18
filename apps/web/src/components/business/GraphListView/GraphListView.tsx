import { useId } from "react";
import type { Schemas } from "../../../api/client.ts";
import type { Category } from "../../../contracts/draft.ts";
import { cx } from "../../../lib/cx.ts";
import type { AnswerHighlight } from "../../../lib/graph/answerHighlight.ts";
import { layoutGraph, RING_LABELS, SECTOR_ORDER } from "../../../lib/graph/layout.ts";
import { personSummary } from "../../../lib/graph/scene.ts";
import { categoryLabel } from "../../../lib/labels.ts";
import { GraphPersonCard } from "../RelationGraph/GraphPersonCard.tsx";

export type GraphListViewProps = {
  data: Schemas["GraphOut"];
  /** People shown on the graph (time point, 只显示符合的人); default everyone. */
  visible?: ReadonlySet<string>;
  /** Filter result in 淡化 mode: the rest are marked 不符合筛选. */
  matching?: ReadonlySet<string> | null;
  focusId: string | null;
  onFocusChange: (id: string | null) => void;
  highlight?: AnswerHighlight | null;
  onOpenPerson: (id: string) => void;
  likes?: string[];
  className?: string;
};

/** Any viewport: only rings and sectors are used, not coordinates. */
const VIEW = { width: 1000, height: 1000 };

/**
 * 列表视图 (graph-viz AC-20): the graph's people grouped by ring (closeness) and sector
 * (category), as buttons — keyboard and screen reader friendly. Focus and answer highlight
 * show here exactly as on the graph.
 */
export function GraphListView({
  data,
  visible,
  matching,
  focusId,
  onFocusChange,
  highlight,
  onOpenPerson,
  likes,
  className,
}: GraphListViewProps) {
  const baseId = useId();
  const layout = layoutGraph(data, VIEW);
  const center = data.center_id;
  const lit = highlight && highlight.kind !== "none" ? new Set(highlight.persons) : null;
  const shown = data.nodes.filter((n) => n.id !== center && (!visible || visible.has(n.id)));
  const rings = RING_LABELS.map((label, i) => {
    const ring = i + 1;
    const members = shown.filter((n) => layout.nodes[n.id]?.ring === ring);
    const sectors = [...SECTOR_ORDER, null].map((cat: Category | null) => ({
      cat,
      people: members.filter((n) => (layout.nodes[n.id]?.sector ?? null) === cat),
    }));
    return { ring, label, members, sectors };
  }).filter((r) => r.members.length > 0);

  return (
    <div
      data-graph-list=""
      className={cx("flex flex-col gap-md overflow-y-auto bg-neutral-bg-container p-md", className)}
    >
      <h2 className="sr-only">列表视图</h2>
      {rings.map((r) => (
        <section
          key={r.ring}
          aria-labelledby={`${baseId}-${r.ring}`}
          className="flex flex-col gap-sm"
        >
          <h3 id={`${baseId}-${r.ring}`} className="text-h3 text-neutral-text-primary">
            {r.label}
            <span className="ml-sm text-caption text-neutral-text-secondary">
              {r.members.length} 人
            </span>
          </h3>
          {r.sectors
            .filter((s) => s.people.length)
            .map((s) => (
              <div key={s.cat ?? "none"} className="flex flex-col gap-xs">
                <h4 className="text-caption text-neutral-text-secondary">
                  {s.cat ? categoryLabel(s.cat) : "其他"}
                </h4>
                <ul
                  aria-label={`${r.label} · ${s.cat ? categoryLabel(s.cat) : "其他"}`}
                  className="flex flex-col"
                >
                  {s.people.map((n) => {
                    const summary = personSummary(data, n.id);
                    const focused = focusId === n.id;
                    const isLit = lit?.has(n.id) ?? false;
                    const unmatched = matching ? !matching.has(n.id) : false;
                    const dim = (lit && !isLit) || unmatched;
                    return (
                      <li key={n.id} className="flex flex-col gap-xs" data-list-person={n.id}>
                        <button
                          type="button"
                          aria-pressed={focused}
                          onClick={() => onFocusChange(focused ? null : n.id)}
                          className={cx(
                            "motion-colors focus-ring flex min-h-[44px] cursor-pointer items-center gap-sm rounded-sm px-sm text-left",
                            focused ? "bg-neutral-bg-muted" : "hover:bg-neutral-bg-subtle",
                          )}
                        >
                          <span className="flex min-w-[0] flex-1 flex-col">
                            <span
                              className={cx(
                                "truncate text-body-md",
                                dim ? "text-neutral-text-secondary" : "text-neutral-text-primary",
                              )}
                            >
                              {summary.name}
                            </span>
                            <span className="truncate text-caption text-neutral-text-secondary">
                              {[summary.types.join("；") || summary.closeness, summary.met]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </span>
                          {isLit && (
                            <span className="shrink-0 rounded-full bg-status-warning-1 px-sm text-caption text-status-warning-7">
                              回答涉及
                            </span>
                          )}
                          {unmatched && (
                            <span className="shrink-0 text-caption text-neutral-text-secondary">
                              不符合筛选
                            </span>
                          )}
                        </button>
                        {focused && (
                          <GraphPersonCard
                            summary={summary}
                            likes={likes}
                            onOpen={() => onOpenPerson(n.id)}
                            headingLevel={4}
                          />
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
        </section>
      ))}
    </div>
  );
}
