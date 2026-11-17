import { describe, expect, it } from "vitest";
import {
  categoryLabel,
  feelingDimensionLabel,
  feelingLevelLabel,
  predicateLabel,
  profileFieldLabel,
  relationshipStatusLabel,
} from "./labels.ts";

describe("业务枚举的中文文案", () => {
  it("relationship categories (大类)", () => {
    expect(
      (["kin", "romantic", "social", "interest", "hostile"] as const).map(categoryLabel),
    ).toEqual(["亲属", "情感", "社会", "利益", "敌对"]);
  });

  it("relationship status: 活跃 / 疏远 / 紧张 / 断联 (AC-28)", () => {
    expect(relationshipStatusLabel("active")).toBe("活跃");
    expect(relationshipStatusLabel("distant")).toBe("疏远");
    expect(relationshipStatusLabel("tense")).toBe("紧张");
    expect(relationshipStatusLabel("estranged")).toBe("断联");
  });

  it("feeling dimensions and levels (AC-30)", () => {
    expect(feelingDimensionLabel("closeness")).toBe("亲密度");
    expect(feelingDimensionLabel("affinity")).toBe("好恶");
    expect(feelingDimensionLabel("trust")).toBe("信任");
    expect(feelingLevelLabel("closeness", "intimate")).toBe("至交");
    expect(feelingLevelLabel("closeness", "casual")).toBe("一般");
    expect(feelingLevelLabel("affinity", "dislike")).toBe("反感");
    expect(feelingLevelLabel("trust", "high")).toBe("高");
  });

  it("profile fields", () => {
    expect(profileFieldLabel("birthday")).toBe("生日");
    expect(profileFieldLabel("hometown")).toBe("籍贯");
  });

  it("known predicates read as Chinese, unknown ones pass through", () => {
    expect(predicateLabel("WORKS_AT")).toBe("工作单位");
    expect(predicateLabel("LIKES")).toBe("喜欢");
    expect(predicateLabel("SOMETHING_NEW")).toBe("SOMETHING_NEW");
  });
});
