import { type ReactNode, useId, useState } from "react";
import { FiChevronDown } from "react-icons/fi";
import { cx } from "../../../lib/cx.ts";
import { CATEGORY_TOKEN, DASH } from "../../../lib/graph/edgeStyle.ts";
import { type GraphThemeName, graphTheme, withAlpha } from "../../../lib/graph/scene.ts";
import { CATEGORIES, categoryLabel } from "../../../lib/labels.ts";
import { Chip } from "../../basics/Chip/Chip.tsx";

export type GraphLegendProps = {
  theme?: GraphThemeName;
  /** Phones start collapsed. */
  defaultCollapsed?: boolean;
  className?: string;
};

function Line({
  color,
  width = 2,
  dash = [],
  taper,
}: {
  color: string;
  width?: number;
  dash?: number[];
  taper?: boolean;
}) {
  return (
    <svg width="28" height="10" viewBox="0 0 28 10" aria-hidden="true" className="shrink-0">
      {taper ? (
        <polygon points="1,2.5 27,4.4 27,5.6 1,7.5" fill={color} />
      ) : (
        <line
          x1="1"
          y1="5"
          x2="27"
          y2="5"
          stroke={color}
          strokeWidth={width}
          strokeDasharray={dash.length ? dash.join(" ") : undefined}
        />
      )}
    </svg>
  );
}

/**
 * 图例 (graph-viz AC-9): what line width, colour, dashes, red, a tapered line and a halo
 * mean. Collapses to a 「图例」 chip.
 */
export function GraphLegend({ theme = "light", defaultCollapsed, className }: GraphLegendProps) {
  const [collapsed, setCollapsed] = useState(Boolean(defaultCollapsed));
  const id = useId();
  const t = graphTheme(theme);
  const dark = theme === "starfield";
  const line = t.categories.social;

  if (collapsed) {
    return (
      <Chip
        onClick={() => setCollapsed(false)}
        aria-label="展开图例"
        className={cx(
          dark && "border-graph-dark-panel-border bg-graph-dark-panel text-graph-dark-text",
          className,
        )}
      >
        图例
      </Chip>
    );
  }
  const rows: { key: string; sample: ReactNode; label: string }[] = [
    {
      key: "width",
      sample: (
        <span className="flex flex-col">
          <Line color={line} width={4} />
          <Line color={line} width={1.2} />
        </span>
      ),
      label: "线粗 = 亲密度（越粗越亲近）",
    },
    { key: "solid", sample: <Line color={line} />, label: "实线 = 亲历 / 本人说" },
    { key: "dashed", sample: <Line color={line} dash={DASH.dashed} />, label: "虚线 = 转述" },
    { key: "dotted", sample: <Line color={line} dash={DASH.dotted} />, label: "点线 = 推测" },
    { key: "tense", sample: <Line color={t.tense} />, label: "红色 = 关系紧张" },
    { key: "taper", sample: <Line color={line} taper />, label: "两端粗细不同 = 双方感受不对称" },
    {
      key: "halo",
      sample: (
        <span
          aria-hidden="true"
          className="block size-[14px] shrink-0 rounded-full"
          style={{
            background: `radial-gradient(circle, ${withAlpha(line, 0.45)}, ${withAlpha(line, 0)})`,
          }}
        />
      ),
      label: "光晕 = 群体（家人、同事、同学）",
    },
  ];

  return (
    <section
      aria-labelledby={id}
      data-graph-legend=""
      className={cx(
        "flex flex-col gap-xs rounded-md border p-sm text-caption shadow-md",
        dark
          ? "border-graph-dark-panel-border bg-graph-dark-panel text-graph-dark-text"
          : "border-neutral-divider bg-neutral-bg-container text-neutral-text-secondary",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-sm">
        <h2
          id={id}
          className={cx("text-caption font-semibold", dark ? "" : "text-neutral-text-primary")}
        >
          图例
        </h2>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          aria-label="收起图例"
          className="focus-ring inline-flex cursor-pointer items-center rounded-sm"
        >
          <FiChevronDown aria-hidden="true" />
        </button>
      </header>
      <ul aria-label="颜色 = 关系大类" className="flex flex-wrap gap-x-sm gap-y-xs">
        {CATEGORIES.map((c) => (
          <li key={c} className="inline-flex items-center gap-xs">
            <span
              aria-hidden="true"
              className="inline-block size-[8px] rounded-full"
              style={{ background: t.categories[CATEGORY_TOKEN[c]] }}
            />
            {categoryLabel(c)}
          </li>
        ))}
      </ul>
      <ul className="flex flex-col gap-xs">
        {rows.map((r) => (
          <li key={r.key} data-legend-item={r.key} className="flex items-center gap-sm">
            {r.sample}
            <span>{r.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
