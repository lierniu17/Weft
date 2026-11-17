import { describe, expect, it } from "vitest";
import type { Taxonomy } from "../contracts/taxonomy.ts";
import { validateSubtype } from "./taxonomy.ts";

const taxonomy: Taxonomy = [
  { category: "social", subtypes: [{ name: "同事" }, { name: "饭搭子", custom: true }] },
  { category: "kin", subtypes: [{ name: "父母" }] },
];

describe("自定义小类校验 (AC-32)", () => {
  it("accepts a new name, trimmed", () => {
    expect(validateSubtype(taxonomy, "social", "  球友 ")).toEqual({ ok: true, name: "球友" });
  });
  it("rejects blank", () => {
    expect(validateSubtype(taxonomy, "social", "   ")).toEqual({
      ok: false,
      error: "请输入小类名称",
    });
  });
  it("rejects a duplicate within the category", () => {
    expect(validateSubtype(taxonomy, "social", "饭搭子")).toEqual({
      ok: false,
      error: "「饭搭子」已存在",
    });
  });
  it("allows the same name under another category", () => {
    expect(validateSubtype(taxonomy, "kin", "同事").ok).toBe(true);
  });
  it("rejects names over 20 characters", () => {
    expect(validateSubtype(taxonomy, "social", "一".repeat(21))).toEqual({
      ok: false,
      error: "最多 20 个字",
    });
  });
});
