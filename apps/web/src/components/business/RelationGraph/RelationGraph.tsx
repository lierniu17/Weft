import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { Schemas } from "../../../api/client.ts";
import { cx } from "../../../lib/cx.ts";
import type { AnswerHighlight } from "../../../lib/graph/answerHighlight.ts";
import { layoutGraph } from "../../../lib/graph/layout.ts";
import {
  type GraphThemeName,
  graphTheme,
  personSummary,
  withLocalAnchors,
} from "../../../lib/graph/scene.ts";
import { timeSlice } from "../../../lib/graph/timeline.ts";
import { useCompactViewport, useReducedMotion } from "../../../lib/useMediaQuery.ts";
import { Banner } from "../../basics/Banner/Banner.tsx";
import { SegmentedControl } from "../../basics/SegmentedControl/SegmentedControl.tsx";
import { GraphPersonCard } from "./GraphPersonCard.tsx";
import { GraphRenderer } from "./renderer.ts";
import type { GraphDebugState } from "./types.ts";

export type GraphView = Schemas["GraphOut"];
export type FilterMode = "fade" | "only";

/** Read-only access for tests and e2e (never assert pixels). */
export type GraphHandle = {
  state: () => GraphDebugState;
  /** Where a person is drawn, in client coordinates (e2e clicks there). */
  clientPosition: (id: string) => { x: number; y: number } | null;
  /** Person id by display name (「我」 for 本人), and back. */
  idOf: (name: string) => string | undefined;
  nameOf: (id: string) => string | undefined;
  zoomTo: (zoom: number) => void;
  /** Shown discs in container pixels (overlap checks). */
  screenNodes: () => { id: string; x: number; y: number; r: number }[];
};

export type RelationGraphProps = {
  /** local: a person's 1–2 hop neighbourhood; panorama: everyone around 本人. */
  variant: "local" | "panorama";
  data: GraphView;
  /** 图谱外观 (我的 → 图谱外观). */
  theme?: GraphThemeName;
  /** local only: 1 层 / 2 层. */
  hops?: 1 | 2;
  onHopsChange?: (hops: 1 | 2) => void;
  /** People left out by the 50-node cap (local). */
  truncatedCount?: number;
  /** 「查看人物页」 on the person card. */
  onOpenPerson: (id: string) => void;
  /** Controlled focus (shared with GraphListView); uncontrolled when undefined. */
  focusId?: string | null;
  onFocusChange?: (id: string | null) => void;
  /** 在图上查看: what an answer lights up. */
  highlight?: AnswerHighlight | null;
  /** Filter result: the people that match; null = no filter. */
  matching?: ReadonlySet<string> | null;
  filterMode?: FilterMode;
  /** Time point (fractional year): people met later fade out (between API snapshots). */
  year?: number;
  /** Likes of the focused person for the card (loaded by the page). */
  likes?: string[];
  /** Override media queries (stories, tests). */
  reducedMotion?: boolean;
  compact?: boolean;
  /** Extra controls over the graph, e.g. the panorama's 「筛选」. */
  toolbar?: ReactNode;
  /** Drawn inside the graph frame, bottom-left (the legend). */
  overlay?: ReactNode;
  onReady?: (graph: GraphHandle) => void;
  className?: string;
};

const HOPS = [
  { value: "1", label: "1 层" },
  { value: "2", label: "2 层" },
];

/** Local graphs are small: smaller nodes so two rings of neighbours fit. */
const LOCAL_SIZES = { nodeRadius: 8, selfRadius: 11 };

/**
 * 关系星图 (graph-viz): Sigma.js (WebGL) + graphology as a whole, positions from the pure
 * `layoutGraph` (concentric closeness rings × category sectors, no force layout), lines
 * encoded by `edgeStyle`, drawn by `GraphRenderer`. Click a person to focus them (others
 * fade, card appears); click them again, the background or press Esc to restore.
 */
export function RelationGraph({
  variant,
  data,
  theme = "light",
  hops = 1,
  onHopsChange,
  truncatedCount,
  onOpenPerson,
  focusId: focusProp,
  onFocusChange,
  highlight = null,
  matching = null,
  filterMode = "fade",
  year,
  likes,
  reducedMotion: reducedProp,
  compact: compactProp,
  toolbar,
  overlay,
  onReady,
  className,
}: RelationGraphProps) {
  const container = useRef<HTMLDivElement>(null);
  const renderer = useRef<GraphRenderer | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [ownFocus, setOwnFocus] = useState<string | null>(null);
  const [hover, setHover] = useState<{ name: string; x: number; y: number } | null>(null);
  const systemReduced = useReducedMotion();
  const systemCompact = useCompactViewport();
  const reducedMotion = reducedProp ?? systemReduced;
  const compact = compactProp ?? systemCompact;
  const focusId = focusProp === undefined ? ownFocus : focusProp;
  const setFocus = (id: string | null) => {
    if (focusProp === undefined) setOwnFocus(id);
    onFocusChange?.(id);
  };
  const handlers = useRef({ setFocus, focusId, data, onReady });
  handlers.current = { setFocus, focusId, data, onReady };

  const prepared = useMemo(
    () => (variant === "local" ? withLocalAnchors(data) : data),
    [variant, data],
  );
  const center = prepared.center_id;

  const visible = useMemo(() => {
    const base =
      year === undefined
        ? new Set(prepared.nodes.map((n) => n.id))
        : timeSlice(prepared, year).visible;
    if (matching && filterMode === "only") {
      for (const id of [...base]) if (id !== center && !matching.has(id)) base.delete(id);
    }
    return base;
  }, [prepared, year, matching, filterMode, center]);

  const layout = useMemo(() => {
    if (!size) return null;
    const hidden = new Set(prepared.nodes.map((n) => n.id).filter((id) => !visible.has(id)));
    return layoutGraph(prepared, size, {
      hidden,
      ...(variant === "local" ? LOCAL_SIZES : {}),
    });
  }, [prepared, size, visible, variant]);

  // Sigma owns the canvas; created once, killed on unmount.
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const r = new GraphRenderer(el, {
      onNodeClick: (id) => {
        const { focusId: f, data: d } = handlers.current;
        const self = d.nodes.find((n) => n.id === id)?.is_self;
        handlers.current.setFocus(self || f === id ? null : id);
      },
      onStageClick: () => handlers.current.setFocus(null),
      onHover: (h) => setHover(h),
    });
    renderer.current = r;
    const observer = new ResizeObserver(() => {
      const w = Math.round(el.clientWidth / 8) * 8;
      const h = Math.round(el.clientHeight / 8) * 8;
      setSize((s) => (s && s.width === w && s.height === h ? s : { width: w, height: h }));
      r.resize();
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      renderer.current = null;
      r.kill();
    };
  }, []);

  // a focused person that left the graph (filter, time point) is no longer focused
  useEffect(() => {
    if (focusId && !visible.has(focusId)) handlers.current.setFocus(null);
  }, [focusId, visible]);

  // Esc restores (AC-10)
  useEffect(() => {
    if (!focusId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) handlers.current.setFocus(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusId]);

  const themeParams = graphTheme(theme);
  useEffect(() => {
    const r = renderer.current;
    if (!r || !layout) return;
    r.update({
      data: prepared,
      layout,
      visible,
      matching: filterMode === "fade" ? matching : null,
      focusId,
      highlight: focusId ? null : highlight,
      theme: themeParams,
      compact,
      reducedMotion,
    });
    handlers.current.onReady?.({
      state: () => r.state(),
      clientPosition: (id) => r.clientPosition(id),
      idOf: (name) =>
        handlers.current.data.nodes.find((n) => (n.is_self ? "我" : n.name) === name)?.id,
      nameOf: (id) => {
        const n = handlers.current.data.nodes.find((x) => x.id === id);
        return n ? (n.is_self ? "我" : n.name) : undefined;
      },
      zoomTo: (z) => r.zoomTo(z),
      screenNodes: () => r.screenNodes(),
    });
  }, [
    prepared,
    layout,
    visible,
    matching,
    filterMode,
    focusId,
    highlight,
    themeParams,
    compact,
    reducedMotion,
  ]);

  const centerNode = prepared.nodes.find((n) => n.id === center);
  const label =
    variant === "panorama"
      ? `全景图，共 ${visible.size} 人`
      : `${centerNode?.is_self ? "我" : (centerNode?.name ?? "")}的关系图，共 ${visible.size} 人`;
  const dark = theme === "starfield";
  const focused = focusId && prepared.nodes.some((n) => n.id === focusId) ? focusId : null;
  const focusedNode = prepared.nodes.find((n) => n.id === focused);
  const card = focused ? (
    <GraphPersonCard
      summary={personSummary(prepared, focused)}
      likes={likes}
      dark={dark && variant === "panorama"}
      headingLevel={variant === "panorama" ? 2 : 3}
      onOpen={focusedNode?.is_self || focused === center ? undefined : () => onOpenPerson(focused)}
      className={
        variant === "panorama"
          ? cx("absolute top-sm z-10", compact ? "right-sm left-sm" : "right-sm w-[260px]")
          : undefined
      }
    />
  ) : null;

  return (
    <div className={cx("flex flex-col gap-sm", variant === "panorama" && "h-full", className)}>
      {truncatedCount ? (
        <Banner variant="info">已省略 {truncatedCount} 人，仅显示亲密度最高的 50 人</Banner>
      ) : null}
      <div
        data-graph-frame={variant}
        data-graph-theme={theme}
        className={cx(
          "relative overflow-hidden rounded-md border",
          dark ? "border-graph-dark-panel-border" : "border-neutral-divider",
          variant === "local" ? (compact ? "h-[200px]" : "h-[280px]") : "min-h-[320px] flex-1",
        )}
        style={{ background: themeParams.background[1] }}
      >
        <div
          ref={container}
          role="img"
          aria-label={label}
          data-relation-graph={variant}
          className="absolute inset-[0]"
        />
        {hover && (
          <div
            role="tooltip"
            className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-sm bg-neutral-text-primary px-sm py-xs text-caption text-neutral-bg-container shadow-md"
            style={{ left: hover.x, top: hover.y - 14 }}
          >
            {hover.name}
          </div>
        )}
        {
          <ul
            aria-label="图中的人物"
            className="sr-only focus-within:not-sr-only focus-within:absolute focus-within:top-sm focus-within:left-sm focus-within:z-10 focus-within:flex focus-within:flex-wrap focus-within:gap-xs"
          >
            {[...prepared.nodes]
              .filter((n) => visible.has(n.id))
              .map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    aria-pressed={focused === n.id}
                    onClick={() => setFocus(focused === n.id ? null : n.id)}
                    className="focus-ring cursor-pointer rounded-full border border-neutral-border bg-neutral-bg-container px-sm text-caption text-neutral-text-primary"
                  >
                    {n.is_self ? "我" : n.name}
                  </button>
                </li>
              ))}
          </ul>
        }
        {variant === "panorama" && card}
        {overlay && <div className="absolute bottom-sm left-sm z-10 max-w-[70%]">{overlay}</div>}
        {toolbar && (
          <div className="absolute top-sm right-sm z-10 flex items-center gap-xs">{toolbar}</div>
        )}
        {variant === "local" && onHopsChange && (
          <SegmentedControl
            aria-label="层数"
            size="sm"
            options={HOPS}
            value={String(hops)}
            onValueChange={(v) => onHopsChange(v === "2" ? 2 : 1)}
            className="absolute right-sm bottom-sm z-10"
          />
        )}
      </div>
      {variant === "local" && card}
    </div>
  );
}
