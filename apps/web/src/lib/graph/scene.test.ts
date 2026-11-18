import { describe, expect, it } from "vitest";
import { tokens } from "../../tokens.gen.ts";
import { edge, graph, node, SELF } from "./fixtures.ts";
import { layoutGraph } from "./layout.ts";
import {
  BASE_ZOOM_LABEL_ALL,
  graphTheme,
  groupHalos,
  hearsayNodes,
  labelShown,
  personSummary,
  truncateName,
  withLocalAnchors,
} from "./scene.ts";

const VIEW = { width: 1000, height: 800 };

const g = graph(
  [
    node("zw", { name: "张伟", met_at: "2018-03" }),
    node("li", { name: "李明", met_at: "2015" }),
    node("kid", { name: "老张的女儿", anchor_person_id: "zw" }),
    node("zk", { name: "郑凯" }),
  ],
  [
    edge(SELF, "zw", {
      types: [
        ["social", "同事"],
        ["social", "朋友"],
      ],
      mine: "intimate",
      theirs: "close",
    }),
    edge(SELF, "li", { mine: "close", types: [["social", "同学"]] }),
    edge("zw", "li", { types: [["social", "室友"]], confidence: "hearsay", status: "tense" }),
    edge("zw", "kid", { types: [["kin", "父母"]], confidence: "self_told" }),
    edge(SELF, "zk", {
      types: [
        ["interest", "合伙人"],
        ["social", "朋友"],
      ],
    }),
  ],
  {
    groups: [
      { id: "g1", kind: "organization", name: "字节跳动", member_ids: ["zw", "li"] },
      { id: "g2", kind: "family", name: "老张家", member_ids: ["zw"] },
    ],
  },
);

describe("person card summary (AC-3, AC-7, AC-10)", () => {
  it("lists every type, closeness both ways, 认识时间, 可信度, groups and their relations", () => {
    const s = personSummary(g, "zw");
    expect(s.name).toBe("张伟");
    expect(s.types).toEqual(["社会 · 同事", "社会 · 朋友"]);
    expect(s.closeness).toBe("我对他：至交 · 他对我：亲近");
    expect(s.met).toBe("2018 年认识");
    expect(s.confidence).toBe("亲历");
    expect(s.groups).toEqual(["字节跳动", "老张家"]);
    expect(s.relations).toEqual(["李明 · 室友（紧张）", "老张的女儿 · 父母"]);
  });

  it("symmetric closeness is one level; unknown closeness reads 一般", () => {
    expect(personSummary(g, "li").closeness).toBe("亲近");
    expect(personSummary(g, "zk").closeness).toBe("一般");
    expect(personSummary(g, "zk").met).toBeNull();
  });

  it("someone known only through others says so", () => {
    const s = personSummary(g, "kid");
    expect(s.types).toEqual([]);
    expect(s.closeness).toBe("间接认识 · 经张伟");
  });

  it("on a local graph the centre person speaks instead of 我", () => {
    const local = { ...g, center_id: "zw" };
    expect(personSummary(local, "li").closeness).toBe("张伟对他：一般");
    expect(personSummary(local, "li").types).toEqual(["社会 · 室友"]);
  });
});

describe("hearsay dot (AC-8)", () => {
  it("marks people with any relationship known by hearsay", () => {
    expect([...hearsayNodes(g)].sort()).toEqual(["li", "zw"]);
  });
});

describe("local graph anchors (AC-12)", () => {
  it("anchors two-hop people to the neighbour that links them to the centre", () => {
    const local = graph(
      [node("zw"), node("li"), node("song"), node("far")],
      [edge("zw", "li"), edge("li", "song"), edge("zw", SELF)],
      { center_id: "zw" },
    );
    const anchored = withLocalAnchors(local);
    const byId = Object.fromEntries(anchored.nodes.map((n) => [n.id, n.anchor_person_id]));
    expect(byId).toMatchObject({ zw: null, li: null, song: "li", far: null, [SELF]: null });
    // the layout then places 宋佳 on the 间接认识 ring next to 李明
    const l = layoutGraph(anchored, VIEW);
    expect(l.nodes.song.ring).toBe(6);
    expect(l.nodes.song.anchorId).toBe("li");
  });
});

describe("semantic zoom labels (AC-11)", () => {
  it("below the threshold: 亲近 and closer only (phone: 至交); above it: everyone", () => {
    const at = (
      closeness: Parameters<typeof labelShown>[0]["closeness"],
      zoom: number,
      compact = false,
    ) => labelShown({ closeness, isCenter: false }, { zoom, compact, emphasized: null, id: "x" });
    expect(at("intimate", 1)).toBe(true);
    expect(at("close", 1)).toBe(true);
    expect(at("familiar", 1)).toBe(false);
    expect(at(null, 1)).toBe(false);
    expect(at("close", 1, true)).toBe(false);
    expect(at("intimate", 1, true)).toBe(true);
    expect(at("distant", BASE_ZOOM_LABEL_ALL)).toBe(true);
    expect(at(null, BASE_ZOOM_LABEL_ALL, true)).toBe(true);
  });

  it("with a focus or an answer lit, exactly the lit people are named", () => {
    const lit = new Set(["a"]);
    const opts = { zoom: 3, compact: false, emphasized: lit };
    expect(labelShown({ closeness: "distant", isCenter: false }, { ...opts, id: "a" })).toBe(true);
    expect(labelShown({ closeness: "intimate", isCenter: false }, { ...opts, id: "b" })).toBe(
      false,
    );
  });

  it("truncates past 7 characters with an ellipsis", () => {
    expect(truncateName("赵一二三四五六")).toBe("赵一二三四五六");
    expect(truncateName("赵一二三四五六七八")).toBe("赵一二三四五六…");
  });
});

describe("group halos (AC-5)", () => {
  it("one halo per group with two or more visible members, around them", () => {
    const l = layoutGraph(g, VIEW);
    const halos = groupHalos(g, l, new Set([SELF, "zw", "li", "kid", "zk"]));
    expect(halos.map((h) => h.name)).toEqual(["字节跳动"]);
    const [h] = halos;
    for (const id of ["zw", "li"]) {
      const n = l.nodes[id];
      expect(Math.hypot(n.x - h.x, n.y - h.y)).toBeLessThan(h.radius);
    }
    expect(h.category).toBe("social");
    expect(groupHalos(g, l, new Set([SELF, "zw"]))).toEqual([]);
  });
});

describe("theme parameters come from DESIGN.md tokens (AC-18, AC-UI-2)", () => {
  it("light = colors.graph on white, starfield = colors.graph-dark", () => {
    const light = graphTheme("light");
    expect(light.categories.romance).toBe(tokens.color["graph-romance"]);
    expect(light.tense).toBe(tokens.color["graph-tense"]);
    expect(light.path).toBe(tokens.color["graph-path"]);
    expect(light.background).toEqual([
      tokens.color["neutral-bg-container"],
      tokens.color["neutral-bg-container"],
    ]);
    expect(light.fade).toBe(Number(tokens.opacity["graph-fade"]));
    expect(light.glow).toBe(false);
    expect(light.stars).toBe(false);

    const dark = graphTheme("starfield");
    expect(dark.categories.kin).toBe(tokens.color["graph-dark-kin"]);
    expect(dark.background).toEqual([
      tokens.color["graph-dark-bg-inner"],
      tokens.color["graph-dark-bg-outer"],
    ]);
    expect(dark.path).toBe(tokens.color["graph-dark-path"]);
    expect(dark.glow).toBe(true);
    expect(dark.stars).toBe(true);
  });
});
