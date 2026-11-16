import { describe, expect, it } from "vitest";
import {
  EMPTY_FILTER,
  type GraphFilter,
  isEmptyFilter,
  parseGraphFilter,
  serializeGraphFilter,
} from "./graphFilter.ts";

describe("全景图筛选条件的序列化 (AC-34)", () => {
  it("serializes categories (sorted), subtypes and the closeness floor", () => {
    expect(
      serializeGraphFilter({
        categories: ["social", "kin"],
        subtypes: ["同事"],
        minCloseness: "close",
      }),
    ).toBe("category=kin%2Csocial&subtype=%E5%90%8C%E4%BA%8B&closeness=close");
  });

  it("an empty filter serializes to an empty string", () => {
    expect(serializeGraphFilter(EMPTY_FILTER)).toBe("");
    expect(isEmptyFilter(EMPTY_FILTER)).toBe(true);
  });

  it("round-trips", () => {
    const f: GraphFilter = { categories: ["social"], subtypes: ["球友"], minCloseness: "familiar" };
    expect(parseGraphFilter(serializeGraphFilter(f))).toEqual(f);
  });

  it("drops unknown values when parsing", () => {
    expect(parseGraphFilter("category=social,nope&closeness=bogus")).toEqual({
      categories: ["social"],
      subtypes: [],
      minCloseness: null,
    });
  });
});
