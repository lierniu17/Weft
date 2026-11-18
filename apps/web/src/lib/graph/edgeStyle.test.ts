import { describe, expect, it } from "vitest";
import { CATEGORY_TOKEN, closenessWidth, DASH, edgeStyle, THIRD_PARTY_WIDTH } from "./edgeStyle.ts";
import { edge, SELF } from "./fixtures.ts";

describe("我 → 他: width = closeness (AC-6)", () => {
  it("grows monotonically with closeness, 至交 widest", () => {
    const widths = (["distant", "casual", "familiar", "close", "intimate"] as const).map(
      closenessWidth,
    );
    for (let i = 1; i < widths.length; i++) expect(widths[i]).toBeGreaterThan(widths[i - 1]);
    expect(closenessWidth(null)).toBe(closenessWidth("casual")); // 缺省 一般
  });

  it("is even at both ends when the feelings match or only mine is known", () => {
    for (const theirs of ["close", null] as const) {
      const s = edgeStyle(edge(SELF, "a", { mine: "close", theirs }), SELF);
      expect(s.widthNearSelf).toBe(closenessWidth("close"));
      expect(s.widthNearOther).toBe(s.widthNearSelf);
      expect(s.asymmetric).toBe(false);
    }
  });
});

describe("asymmetric feelings (AC-7)", () => {
  it("the end near me is 我对他, the end near them 他对我", () => {
    const s = edgeStyle(edge(SELF, "a", { mine: "intimate", theirs: "familiar" }), SELF);
    expect(s.widthNearSelf).toBe(closenessWidth("intimate"));
    expect(s.widthNearOther).toBe(closenessWidth("familiar"));
    expect(s.asymmetric).toBe(true);
    expect(s.mine).toBe("intimate");
    expect(s.theirs).toBe("familiar");
  });

  it("works whichever end of the edge I am", () => {
    const s = edgeStyle(edge("a", SELF, { mine: "distant", theirs: "intimate" }), SELF);
    expect([s.widthNearSelf, s.widthNearOther]).toEqual([
      closenessWidth("intimate"),
      closenessWidth("distant"),
    ]);
  });
});

describe("colour, dash and tension (AC-6)", () => {
  it("colours by the category of types[0], using the graph token keys", () => {
    const s = edgeStyle(
      edge(SELF, "a", {
        types: [
          ["romantic", "恋人"],
          ["social", "朋友"],
        ],
      }),
      SELF,
    );
    expect(s.colorToken).toBe("romance");
    expect(CATEGORY_TOKEN).toEqual({
      kin: "kin",
      romantic: "romance",
      social: "social",
      interest: "interest",
      hostile: "hostile",
    });
  });

  it("dashes 转述, dots 推测, keeps 亲历 / 本人说 solid", () => {
    const dash = (confidence: "witnessed" | "self_told" | "hearsay" | "inferred") =>
      edgeStyle(edge(SELF, "a", { confidence }), SELF);
    expect(dash("witnessed")).toMatchObject({ dashStyle: "solid", dash: [] });
    expect(dash("self_told")).toMatchObject({ dashStyle: "solid", dash: [] });
    expect(dash("hearsay")).toMatchObject({ dashStyle: "dashed", dash: DASH.dashed });
    expect(dash("inferred")).toMatchObject({ dashStyle: "dotted", dash: DASH.dotted });
    expect(DASH).toEqual({ solid: [], dashed: [6, 5], dotted: [1.5, 4] });
  });

  it("turns red when the relationship is 紧张", () => {
    const tense = edgeStyle(edge(SELF, "a", { status: "tense", types: [["kin", "x"]] }), SELF);
    expect(tense).toMatchObject({ tense: true, colorToken: "tense", categoryToken: "kin" });
    const fine = edgeStyle(edge(SELF, "a", { status: "distant" }), SELF);
    expect(fine.tense).toBe(false);
  });
});

describe("between two other people (AC-8)", () => {
  it("is a thin line with the same dash and tension rules", () => {
    const s = edgeStyle(
      edge("zhang", "li", { status: "tense", confidence: "hearsay", mine: "intimate" }),
      SELF,
    );
    expect(s).toMatchObject({
      touchesSelf: false,
      widthNearSelf: THIRD_PARTY_WIDTH,
      widthNearOther: THIRD_PARTY_WIDTH,
      asymmetric: false,
      tense: true,
      colorToken: "tense",
      dashStyle: "dashed",
    });
  });
});
