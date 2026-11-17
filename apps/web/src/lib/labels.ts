/**
 * Chinese UI copy for the contract enums (vocabulary per CONTEXT.md).
 * Mirrors apps/api: taxonomy category labels, FEELING_*_LABELS, relationship status.
 */
import type {
  Category,
  FeelingDimension,
  ProfileField,
  RelationshipStatus,
} from "../contracts/draft.ts";

export const CATEGORIES: readonly Category[] = ["kin", "romantic", "social", "interest", "hostile"];

const CATEGORY: Record<Category, string> = {
  kin: "亲属",
  romantic: "情感",
  social: "社会",
  interest: "利益",
  hostile: "敌对",
};

const STATUS: Record<RelationshipStatus, string> = {
  active: "活跃",
  distant: "疏远",
  tense: "紧张",
  estranged: "断联",
};

const DIMENSION: Record<FeelingDimension, string> = {
  closeness: "亲密度",
  affinity: "好恶",
  trust: "信任",
};

/** Levels per dimension, from strongest to weakest. */
export const FEELING_LEVELS = {
  closeness: [
    ["intimate", "至交"],
    ["close", "亲近"],
    ["familiar", "熟悉"],
    ["casual", "一般"],
    ["distant", "疏远"],
  ],
  affinity: [
    ["like", "喜欢"],
    ["neutral", "中性"],
    ["dislike", "反感"],
  ],
  trust: [
    ["high", "高"],
    ["medium", "中"],
    ["low", "低"],
  ],
} as const satisfies Record<FeelingDimension, readonly (readonly [string, string])[]>;

const PROFILE_FIELD: Record<ProfileField, string> = {
  name: "姓名",
  gender: "性别",
  birthday: "生日",
  hometown: "籍贯",
};

const PREDICATE: Record<string, string> = {
  WORKS_AT: "工作单位",
  STUDIED_AT: "学校",
  LIVES_IN: "住在",
  HAS_TRAIT: "性格",
  LIKES: "喜欢",
  DISLIKES: "不喜欢",
  EXPERIENCED: "经历",
  HAS_ETIQUETTE: "相处之道",
  OPINION: "评价",
};

export const categoryLabel = (c: Category) => CATEGORY[c];
export const relationshipStatusLabel = (s: RelationshipStatus) => STATUS[s];
export const feelingDimensionLabel = (d: FeelingDimension) => DIMENSION[d];
export const profileFieldLabel = (f: ProfileField) => PROFILE_FIELD[f];
export const predicateLabel = (p: string) => PREDICATE[p] ?? p;

export function feelingLevelLabel(dimension: FeelingDimension, level: string): string {
  const levels: readonly (readonly [string, string])[] = FEELING_LEVELS[dimension];
  return levels.find(([value]) => value === level)?.[1] ?? level;
}
