import cytoscape, { type Core, type ElementDefinition } from "cytoscape";
import { type ReactNode, useEffect, useRef } from "react";
import type { ClosenessLevel } from "../../../contracts/draft.ts";
import { cx } from "../../../lib/cx.ts";
import { Banner } from "../../basics/Banner/Banner.tsx";
import { SegmentedControl } from "../../basics/SegmentedControl/SegmentedControl.tsx";
import {
  avatarImage,
  DEFAULT_EDGE_WIDTH,
  EDGE_WIDTH,
  graphStyle,
  type NodeKind,
} from "./graphTheme.ts";

export type GraphNode = { id: string; name: string; is_self?: boolean };
export type GraphEdge = {
  id: string;
  source: string;
  target: string;
  /** Closeness of the pair; drives the edge width. */
  closeness?: ClosenessLevel | null;
};

export type RelationGraphProps = {
  /** local: a person's 1–2 hop neighbourhood (200px); panorama: everyone around 本人. */
  variant: "local" | "panorama";
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** local: the person the page is about. panorama: defaults to 本人. */
  centerId?: string;
  /** local only: 1 层 / 2 层. */
  hops?: 1 | 2;
  onHopsChange?: (hops: 1 | 2) => void;
  /** Tap on a person (canvas or accessible list) → open their page. */
  onNodeClick: (id: string) => void;
  /** People left out by the 50-node cap (AC-33). */
  truncatedCount?: number;
  /** Extra controls over the graph, e.g. the panorama's 「筛选」. */
  toolbar?: ReactNode;
  /** Receives the Cytoscape instance once created (tests, page-level controls). */
  onReady?: (cy: Core) => void;
  className?: string;
};

const HOPS = [
  { value: "1", label: "1 层" },
  { value: "2", label: "2 层" },
];

/** Undirected BFS depth from the centre; unreachable nodes go one ring further out. */
function depths(nodes: GraphNode[], edges: GraphEdge[], center: string) {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    adj.set(e.source, [...(adj.get(e.source) ?? []), e.target]);
    adj.set(e.target, [...(adj.get(e.target) ?? []), e.source]);
  }
  const depth = new Map([[center, 0]]);
  const queue = [center];
  while (queue.length) {
    const id = queue.shift() as string;
    for (const n of adj.get(id) ?? []) {
      if (!depth.has(n)) {
        depth.set(n, (depth.get(id) ?? 0) + 1);
        queue.push(n);
      }
    }
  }
  const max = Math.max(0, ...depth.values());
  for (const n of nodes) if (!depth.has(n.id)) depth.set(n.id, max + 1);
  return depth;
}

function toElements(nodes: GraphNode[], edges: GraphEdge[], center: string): ElementDefinition[] {
  const self = nodes.find((n) => n.is_self)?.id;
  return [
    ...nodes.map((n) => {
      const kind: NodeKind = n.is_self ? "self" : n.id === center ? "center" : "person";
      const label = n.is_self ? "我" : n.name;
      const glyph = n.is_self ? "我" : (Array.from(n.name)[0] ?? "?");
      return {
        group: "nodes" as const,
        data: { id: n.id, label, kind, center: n.id === center, avatar: avatarImage(glyph, kind) },
      };
    }),
    ...edges.map((e) => ({
      group: "edges" as const,
      data: {
        id: e.id,
        source: e.source,
        target: e.target,
        width: e.closeness ? EDGE_WIDTH[e.closeness] : DEFAULT_EDGE_WIDTH,
        toCenter: Boolean(self) && (e.source === self || e.target === self),
      },
    })),
  ];
}

/** Lay out rings by distance from the centre, then zoom so the centre sits mid-viewport. */
function layout(cy: Core, nodes: GraphNode[], edges: GraphEdge[], center: string) {
  const depth = depths(nodes, edges, center);
  const max = Math.max(...depth.values());
  cy.layout({
    name: "concentric",
    concentric: (n) => max - (depth.get(n.id()) ?? max),
    levelWidth: () => 1,
    minNodeSpacing: 36,
    animate: false,
    fit: false,
  }).run();
  frame(cy, center);
}

/** Zoom so every ring fits, with the centre person in the middle of the viewport. */
function frame(cy: Core, center: string) {
  cy.resize();
  const c = cy.$id(center);
  if (c.empty()) {
    cy.fit(undefined, 24);
    return;
  }
  const { x, y } = c.position();
  const reach = Math.max(
    40,
    ...cy.nodes().map((n) => Math.hypot(n.position("x") - x, n.position("y") - y)),
  );
  // Leave room for the node radius and the name label under it.
  const zoom = Math.min(cy.width(), cy.height()) / 2 / (reach + 40);
  const z = Math.min(Math.max(zoom, 0.3), 1.5);
  // Centre on the node itself, not its bounding box (which includes the name label).
  cy.viewport({ zoom: z, pan: { x: cy.width() / 2 - x * z, y: cy.height() / 2 - y * z } });
}

/**
 * 关系图, built on Cytoscape.js as a whole: React owns the container, Cytoscape owns nodes
 * and edges (themed from the tokens in graphTheme.ts). The canvas is mirrored by a list
 * of people as buttons so keyboard and screen-reader users can navigate too.
 */
export function RelationGraph({
  variant,
  nodes,
  edges,
  centerId,
  hops = 1,
  onHopsChange,
  onNodeClick,
  truncatedCount,
  toolbar,
  onReady,
  className,
}: RelationGraphProps) {
  const container = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const handlers = useRef({ onNodeClick, onReady });
  handlers.current = { onNodeClick, onReady };

  const center = centerId ?? nodes.find((n) => n.is_self)?.id ?? nodes[0]?.id ?? "";
  const centerName = nodes.find((n) => n.id === center);
  const centerRef = useRef(center);
  centerRef.current = center;

  useEffect(() => {
    const cy = cytoscape({
      container: container.current,
      style: graphStyle,
      userPanningEnabled: true,
      userZoomingEnabled: true,
      boxSelectionEnabled: false,
      autoungrabify: true,
      minZoom: 0.3,
      maxZoom: 3,
    });
    cy.on("tap", "node", (e) => handlers.current.onNodeClick(e.target.id()));
    cyRef.current = cy;
    // Keep the centre framed when the container changes size (rotation, panel resize).
    const observer = new ResizeObserver(() => frame(cy, centerRef.current));
    if (container.current) observer.observe(container.current);
    return () => {
      observer.disconnect();
      cyRef.current = null;
      cy.destroy();
    };
  }, []);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.elements().remove();
      cy.add(toElements(nodes, edges, center));
    });
    layout(cy, nodes, edges, center);
    handlers.current.onReady?.(cy);
  }, [nodes, edges, center]);

  const label =
    variant === "panorama"
      ? `全景图，共 ${nodes.length} 人`
      : `${centerName?.is_self ? "我" : (centerName?.name ?? "")}的关系图，共 ${nodes.length} 人`;

  return (
    <div className={cx("flex flex-col gap-sm", variant === "panorama" && "h-full", className)}>
      {truncatedCount ? (
        <Banner variant="info">已省略 {truncatedCount} 人，仅显示亲密度最高的 50 人</Banner>
      ) : null}
      <div
        className={cx(
          "relative overflow-hidden rounded-md border border-neutral-divider bg-neutral-bg-container",
          variant === "local" ? "h-[200px]" : "min-h-[320px] flex-1",
        )}
      >
        <div
          ref={container}
          role="img"
          aria-label={label}
          data-relation-graph={variant}
          className="size-full"
        />
        <ul
          aria-label="图中的人物"
          className="sr-only focus-within:not-sr-only focus-within:absolute focus-within:top-sm focus-within:left-sm focus-within:flex focus-within:flex-wrap focus-within:gap-xs"
        >
          {nodes.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => onNodeClick(n.id)}
                className="focus-ring cursor-pointer rounded-full border border-neutral-border bg-neutral-bg-container px-sm text-caption text-neutral-text-primary"
              >
                {n.is_self ? "我" : n.name}
              </button>
            </li>
          ))}
        </ul>
        {toolbar && (
          <div className="absolute top-sm right-sm flex items-center gap-xs">{toolbar}</div>
        )}
        {variant === "local" && onHopsChange && (
          <SegmentedControl
            aria-label="层数"
            size="sm"
            options={HOPS}
            value={String(hops)}
            onValueChange={(v) => onHopsChange(v === "2" ? 2 : 1)}
            className="absolute right-sm bottom-sm"
          />
        )}
      </div>
    </div>
  );
}
