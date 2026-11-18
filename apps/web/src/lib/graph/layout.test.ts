import { describe, expect, it } from "vitest";
import type { Category } from "../../contracts/draft.ts";
import { crowd, edge, graph, node, SELF, seedGraph } from "./fixtures.ts";
import { estimateTextWidth } from "./labelPlacement.ts";
import {
  CLOSENESS_RING,
  type GraphLayout,
  INDIRECT_RING,
  layoutGraph,
  MIN_SECTOR_ANGLE,
  RING_LABELS,
  SECTOR_ORDER,
} from "./layout.ts";

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 375, height: 640 };
const TAU = Math.PI * 2;

function dist(l: GraphLayout, a: string, b: string) {
  const p = l.nodes[a];
  const q = l.nodes[b];
  return Math.hypot(p.x - q.x, p.y - q.y);
}

/** Smallest angular distance, in radians. */
function angleGap(a: number, b: number) {
  const d = Math.abs(a - b) % TAU;
  return Math.min(d, TAU - d);
}

function minSpacing(l: GraphLayout) {
  const ids = Object.keys(l.nodes);
  let min = Number.POSITIVE_INFINITY;
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) min = Math.min(min, dist(l, ids[i], ids[j]));
  }
  return min;
}

describe("rings (AC-1)", () => {
  it("puts me at the centre and each person on the ring of my closeness to them", () => {
    const levels = ["intimate", "close", "familiar", "casual", "distant"] as const;
    const g = graph(
      levels.map((l) => node(l)),
      levels.map((l) => edge(SELF, l, { mine: l })),
    );
    const l = layoutGraph(g, DESKTOP);
    expect(l.nodes[SELF]).toMatchObject({ ring: 0, radius: 0, x: 0, y: 0 });
    expect(levels.map((lv) => l.nodes[lv].ring)).toEqual([1, 2, 3, 4, 5]);
    // each ring has one radius, growing outwards, and the person sits exactly on it
    const radii = l.rings.map((r) => r.radius);
    expect(radii).toEqual([...radii].sort((a, b) => a - b));
    expect(new Set(radii).size).toBe(6);
    for (const lv of levels) {
      expect(l.nodes[lv].radius).toBe(l.rings[CLOSENESS_RING[lv] - 1].radius);
      expect(Math.hypot(l.nodes[lv].x, l.nodes[lv].y)).toBeCloseTo(l.nodes[lv].radius, 6);
    }
    expect(l.rings.map((r) => r.label)).toEqual([...RING_LABELS]);
    expect(RING_LABELS).toEqual(["至交", "亲近", "熟悉", "一般", "疏远", "间接认识"]);
  });

  it("uses my side of the feeling, whichever end of the edge I am", () => {
    const g = graph(
      [node("a"), node("b")],
      [
        edge(SELF, "a", { mine: "intimate", theirs: "distant" }),
        edge("b", SELF, { mine: "distant", theirs: "close" }), // b → me distant, me → b close
      ],
    );
    const l = layoutGraph(g, DESKTOP);
    expect([l.nodes.a.ring, l.nodes.b.ring]).toEqual([1, 2]);
  });

  it("puts a person without a recorded closeness on 一般", () => {
    const l = layoutGraph(graph([node("a")], [edge("a", SELF, { theirs: null })]), DESKTOP);
    expect(l.nodes.a.ring).toBe(CLOSENESS_RING.casual);
    expect(l.nodes.a.closeness).toBe("casual");
  });
});

describe("sectors (AC-2)", () => {
  const counts: Record<Category, number> = {
    kin: 4,
    romantic: 1,
    social: 12,
    interest: 3,
    hostile: 0,
  };
  const g = (() => {
    const nodes = [];
    const edges = [];
    for (const c of SECTOR_ORDER) {
      for (let i = 0; i < counts[c]; i++) {
        nodes.push(node(`${c}${i}`));
        edges.push(edge(SELF, `${c}${i}`, { types: [[c, "x"]], mine: "familiar" }));
      }
    }
    return graph(nodes, edges);
  })();
  const l = layoutGraph(g, DESKTOP);

  it("splits the circle into the five categories in order, clockwise from the top", () => {
    expect(l.sectors.map((s) => s.category)).toEqual([
      "kin",
      "romantic",
      "social",
      "interest",
      "hostile",
    ]);
    expect(l.sectors.map((s) => s.label)).toEqual(["亲属", "情感", "社会", "利益", "敌对"]);
    expect(l.sectors[0].start).toBeCloseTo(-Math.PI / 2);
    for (let i = 1; i < 5; i++) expect(l.sectors[i].start).toBeCloseTo(l.sectors[i - 1].end);
    expect(l.sectors[4].end - l.sectors[0].start).toBeCloseTo(TAU);
  });

  it("sizes sectors in proportion to their people, keeping a minimum width", () => {
    const span = Object.fromEntries(l.sectors.map((s) => [s.category, s.end - s.start]));
    expect(span.hostile).toBeCloseTo(MIN_SECTOR_ANGLE); // empty: the minimum
    expect(span.romantic).toBeCloseTo(MIN_SECTOR_ANGLE); // 1 person: below the minimum
    expect(span.social / span.kin).toBeCloseTo(12 / 4);
    expect(span.social / span.interest).toBeCloseTo(12 / 3);
  });

  it("an empty graph has five equal sectors", () => {
    const empty = layoutGraph(graph([], []), DESKTOP);
    for (const s of empty.sectors) expect(s.end - s.start).toBeCloseTo(TAU / 5);
  });

  it("puts each person in the sector of their primary category", () => {
    for (const c of SECTOR_ORDER) {
      const sector = l.sectors.find((s) => s.category === c);
      for (let i = 0; i < counts[c]; i++) {
        const n = l.nodes[`${c}${i}`];
        expect(n.sector).toBe(c);
        expect(n.angle).toBeGreaterThan(sector?.start ?? 0);
        expect(n.angle).toBeLessThan(sector?.end ?? 0);
      }
    }
  });

  it("spreads people of one ring and sector evenly across the sector", () => {
    const social = Array.from({ length: 12 }, (_, i) => l.nodes[`social${i}`].angle).sort(
      (a, b) => a - b,
    );
    const gaps = social.slice(1).map((a, i) => a - social[i]);
    for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0]);
    const sector = l.sectors.find((s) => s.category === "social");
    expect(gaps[0]).toBeCloseTo(((sector?.end ?? 0) - (sector?.start ?? 0)) / 12);
  });
});

describe("several relationship types (AC-3)", () => {
  it("takes the sector from types[0] of my relationship and keeps the rest as arcs", () => {
    const g = graph(
      [node("zheng")],
      [
        edge(SELF, "zheng", {
          types: [
            ["interest", "合伙人"],
            ["social", "朋友"],
            ["kin", "亲戚"],
          ],
        }),
      ],
    );
    const n = layoutGraph(g, DESKTOP).nodes.zheng;
    expect(n.primaryCategory).toBe("interest");
    expect(n.sector).toBe("interest");
    expect(n.otherCategories).toEqual(["social", "kin"]);
  });
});

describe("people I only know through others (AC-4)", () => {
  const g = graph(
    [
      node("zhang"),
      node("li"),
      node("daughter", { anchor_person_id: "zhang" }),
      node("wife", { anchor_person_id: "zhang" }),
      node("friend", { anchor_person_id: "daughter" }),
      node("lonely"),
    ],
    [
      edge(SELF, "zhang", { mine: "intimate" }),
      edge(SELF, "li", { types: [["kin", "亲戚"]], mine: "close" }),
      edge("zhang", "daughter", { types: [["kin", "父母"]] }),
      edge("wife", "zhang", { types: [["kin", "配偶"]] }),
      edge("daughter", "friend"),
    ],
  );
  const l = layoutGraph(g, DESKTOP);

  it("puts them on the outermost ring 间接认识", () => {
    for (const id of ["daughter", "wife", "friend", "lonely"]) {
      expect(l.nodes[id].ring).toBe(INDIRECT_RING);
      expect(l.nodes[id].radius).toBe(l.rings[5].radius);
    }
    expect(l.rings[5].radius).toBeGreaterThan(l.rings[4].radius);
  });

  it("near the angle of their anchor, closer to it than to anyone else", () => {
    const daughter = l.nodes.daughter;
    expect(daughter.anchorId).toBe("zhang");
    const toAnchor = angleGap(daughter.angle, l.nodes.zhang.angle);
    expect(toAnchor).toBeLessThan(0.2);
    expect(toAnchor).toBeLessThan(angleGap(daughter.angle, l.nodes.li.angle));
    // several around one anchor spread a little
    const around = [l.nodes.daughter.angle, l.nodes.wife.angle, l.nodes.friend.angle];
    expect(Math.max(...around) - Math.min(...around)).toBeLessThan(0.4);
    expect(new Set(around.map((a) => a.toFixed(4))).size).toBe(3);
  });

  it("take their anchor's sector and the colour of the link to it", () => {
    expect(l.nodes.daughter.sector).toBe(l.nodes.zhang.sector);
    expect(l.nodes.daughter.primaryCategory).toBe("kin");
    expect(l.nodes.friend.anchorId).toBe("daughter");
    expect(l.nodes.lonely.anchorId).toBeNull();
  });
});

describe("spacing (AC-2: no overlap)", () => {
  for (const [n, viewport] of [
    [30, DESKTOP],
    [200, DESKTOP],
    [30, PHONE],
    [200, PHONE],
    [500, DESKTOP],
  ] as const) {
    it(`keeps every two nodes a node diameter apart: ${n} people, ${viewport.width}px`, () => {
      const l = layoutGraph(crowd(n), viewport);
      expect(Object.keys(l.nodes)).toHaveLength(n + 1);
      expect(minSpacing(l)).toBeGreaterThanOrEqual(2 * l.nodeRadius - 1e-6);
      // rings stay in order even when crowded rings had to grow
      const radii = l.rings.map((r) => r.radius);
      expect(radii).toEqual([...radii].sort((a, b) => a - b));
      expect(l.extent).toBeGreaterThanOrEqual(radii[5]);
    });
  }

  it("grows a crowded 至交 ring so that neighbours' names fit side by side (seed graph)", () => {
    const g = seedGraph();
    const l = layoutGraph(g, DESKTOP);
    const kin = Object.values(l.nodes)
      .filter((n) => n.ring === 1 && n.sector === "kin")
      .sort((a, b) => a.angle - b.angle);
    expect(kin.map((n) => n.id).sort()).toEqual(["dad", "mom", "wife"]);
    const name = (id: string) => g.nodes.find((n) => n.id === id)?.name ?? "";
    for (let i = 1; i < kin.length; i++) {
      const [a, b] = [kin[i - 1], kin[i]];
      const room = (estimateTextWidth(name(a.id), 12) + estimateTextWidth(name(b.id), 12)) / 2;
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(room);
    }
    // … within the viewport's proportions: the rings stay in order and inside the view
    expect(l.extent).toBeLessThanOrEqual(Math.min(DESKTOP.width, DESKTOP.height) / 2);
  });

  it("fits the viewport when there is room (rings are not grown)", () => {
    const l = layoutGraph(crowd(30), DESKTOP);
    expect(l.extent).toBeLessThanOrEqual(Math.min(DESKTOP.width, DESKTOP.height) / 2);
  });
});

describe("visibility and determinism", () => {
  it("lays out hidden persons too (so they can fade in) but marks them invisible", () => {
    const l = layoutGraph(crowd(10), DESKTOP, { hidden: new Set(["p0", "p1"]) });
    expect(l.nodes.p0.visible).toBe(false);
    expect(l.nodes.p2.visible).toBe(true);
    expect(l.nodes[SELF].visible).toBe(true);
  });

  it("gives the same positions for the same input", () => {
    expect(layoutGraph(crowd(40), DESKTOP)).toEqual(layoutGraph(crowd(40), DESKTOP));
  });
});
