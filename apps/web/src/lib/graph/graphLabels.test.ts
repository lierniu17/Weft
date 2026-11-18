import { describe, expect, it } from "vitest";
import { crowd, edge, graph, node, SELF, seedGraph } from "./fixtures.ts";
import { graphLabels, type LabelView, labelScene } from "./graphLabels.ts";
import {
  boxesIntersect,
  boxHitsDisc,
  estimateTextWidth,
  type LabelScene,
  overlappingLabels,
  placeLabels,
} from "./labelPlacement.ts";
import { labelRadius, layoutGraph } from "./layout.ts";
import { groupHalos } from "./scene.ts";

type Data = ReturnType<typeof seedGraph>;

/** The graph area of the 全景图 page at 1440 × 900 and 375 × 812 (as in the e2e screenshots). */
const DESKTOP = { width: 1184, height: 736, compact: false };
const PHONE = { width: 344, height: 592, compact: true };

/** What the renderer passes at rest: the layout, fitted like Sigma fits it, × zoom. */
function atRest(
  data: Data,
  view: { width: number; height: number; compact: boolean },
  zoom = 1,
  extra: Partial<LabelView> = {},
): LabelView {
  const layout = layoutGraph(data, view);
  const visible = new Set(data.nodes.map((n) => n.id));
  const reach = labelRadius(layout) + 28;
  const ratio = ((Math.min(view.width, view.height) / 2 - 16) / reach) * zoom;
  return {
    data,
    layout,
    drawn: Object.values(layout.nodes).map((n) => ({ id: n.id, x: n.x, y: n.y, scale: 1 })),
    ringRadii: layout.rings.map((r) => r.radius),
    sectorRadius: labelRadius(layout),
    halos: view.compact
      ? []
      : groupHalos(data, layout, visible).map((h) => ({ ...h, r: h.radius })),
    emphasized: null,
    focusId: null,
    compact: view.compact,
    zoom,
    origin: { x: view.width / 2, y: view.height / 2 },
    ratio,
    measure: estimateTextWidth,
    ...extra,
  };
}

const ids = (v: LabelView) => graphLabels(v).map((l) => l.id);

describe("label placement (AC-11: names never overlap)", () => {
  const cases = [
    ["the seed graph", seedGraph()],
    ["200 people", crowd(200)],
  ] as const;
  for (const [what, data] of cases) {
    for (const [width, view] of [
      [1440, DESKTOP],
      [375, PHONE],
    ] as const) {
      for (const zoom of [1, 1.3, 2.4]) {
        it(`${what}, ${width}px, zoom ${zoom}: no two shown labels intersect, none covers a disc`, () => {
          const v = atRest(data, view, zoom);
          const scene = labelScene(v);
          const placed = placeLabels(scene);
          expect(placed.length).toBeGreaterThan(0);
          expect(overlappingLabels(placed)).toEqual([]);
          for (const l of placed) {
            if (l.kind === "sector") continue; // fixed, past the outer ring
            const hit = scene.discs.find((d) => d.id !== l.id && boxHitsDisc(l.box, d));
            expect(hit?.id, `${l.id} covers a disc`).toBeUndefined();
          }
        });
      }
    }
  }

  it("the seed graph's crowded 亲属 sector names everyone at 1440 (inner rings make room)", () => {
    const shown = ids(atRest(seedGraph(), DESKTOP));
    for (const id of ["wife", "dad", "mom", "sis", "zw", "li", "zk"]) expect(shown).toContain(id);
    // group and ring names are drawn too, apart from the person names
    expect(shown).toContain("group:family:dad");
    expect(shown).toContain("ring:1");
  });

  it("keeps the closer ring's name when two collide, the farther one moves or hides", () => {
    // two people at the same spot on screen: the closer one keeps the place below the disc
    const at = { x: 100, y: 100, r: 10, focused: false, lit: false };
    const scene: LabelScene = {
      origin: { x: 0, y: 0 },
      rings: [],
      sectors: [],
      halos: [],
      persons: [
        { ...at, id: "far", text: "远远远", ring: 4 },
        { ...at, id: "near", text: "近近近", ring: 1 },
      ],
      discs: [],
      font: { person: 12, ring: 11, sector: 12, group: 11 },
      measure: estimateTextWidth,
    };
    const placed = placeLabels(scene);
    const near = placed.find((l) => l.id === "near");
    const far = placed.find((l) => l.id === "far");
    expect(near?.box.y).toBeGreaterThan(110); // below
    expect(far && near && boxesIntersect(far.box, near.box)).toBeFalsy();
    // a focused person wins over a closer ring; then lit before not lit; then by name
    const focused = placeLabels({
      ...scene,
      persons: [
        { ...scene.persons[0], focused: true },
        { ...scene.persons[1], lit: true },
      ],
    });
    expect(focused[0].id).toBe("far");
    expect(focused[0].box.y).toBeGreaterThan(110);
  });

  it("a name with no free place is left out (it shows on hover and zoomed in)", () => {
    const crowded = (zoom: number) =>
      atRest(crowd(200), DESKTOP, zoom).drawn.length -
      1 -
      graphLabels(atRest(crowd(200), DESKTOP, zoom)).filter((l) => l.kind === "person").length;
    // zoomed in, every person wants a name; more of them get one the further in
    expect(crowded(1.3)).toBeGreaterThan(crowded(2.4));
  });

  it("lit people are named first; with a focus the focused person always is", () => {
    const data = seedGraph();
    const lit = new Set(["zw", "wang", SELF]);
    const v = atRest(data, PHONE, 1, { emphasized: lit, focusId: "wang" });
    const shown = ids(v).filter((id) => !id.includes(":"));
    expect(new Set(shown)).toEqual(new Set(["zw", "wang"]));
  });

  it("group names sit on the halo's outer edge, away from 我", () => {
    const v = atRest(seedGraph(), DESKTOP);
    const scene = labelScene(v);
    const halo = scene.halos.find((h) => h.id === "organization:字节跳动");
    const label = placeLabels(scene).find((l) => l.id === "group:organization:字节跳动");
    if (!halo || !label) throw new Error("no 字节跳动 halo label");
    const cx = label.box.x + label.box.w / 2;
    const cy = label.box.y + label.box.h / 2;
    const fromMe = (x: number, y: number) => Math.hypot(x - scene.origin.x, y - scene.origin.y);
    expect(fromMe(cx, cy)).toBeGreaterThan(fromMe(halo.x, halo.y));
    expect(Math.hypot(cx - halo.x, cy - halo.y)).toBeGreaterThan(halo.r * 0.6);
  });

  it("is deterministic", () => {
    const v = atRest(seedGraph(), DESKTOP, 1.3);
    expect(graphLabels(v)).toEqual(graphLabels(atRest(seedGraph(), DESKTOP, 1.3)));
  });

  it("a local graph names its centre", () => {
    const g = graph(
      [node("zw", { name: "张伟" }), node("li", { name: "李明" })],
      [edge(SELF, "zw", { mine: "intimate" }), edge("zw", "li")],
    );
    const v = atRest({ ...g, center_id: "zw" }, DESKTOP);
    expect(ids(v)).toContain("zw");
  });
});
