/**
 * DESIGN.md → design tokens generator.
 *
 * DESIGN.md (repo root) is the single source of truth for tokens. This script projects
 * its YAML front matter into:
 *   - src/styles/tokens.css   a Tailwind v4 `@theme static` block (CSS variables on :root
 *                             AND utilities such as `bg-primary-6`, `rounded-sm`, `p-md`)
 *   - src/tokens.gen.ts       the same values as a typed TS object
 *
 * Modes:  --write  regenerate both files
 *         --check  exit 1 if either file is stale (the unit test asserts the same)
 *
 * `--*: initial` wipes Tailwind's default theme first, so only DESIGN.md values exist as
 * utilities: a stray `p-3` or `bg-blue-500` simply does not compile into anything.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DESIGN_MD = resolve(WEB, "../../DESIGN.md");
export const CSS_OUT = resolve(WEB, "src/styles/tokens.css");
export const TS_OUT = resolve(WEB, "src/tokens.gen.ts");

type TypeScale = { size: string; weight: string; "line-height": string };
type Design = {
  colors: {
    primary: Record<string, string>;
    secondary: Record<string, string>;
    neutral: Record<string, string>;
    status: Record<string, Record<string, string>>;
    graph: Record<string, string>;
    "graph-dark": Record<string, string>;
  };
  typography: Record<string, string | TypeScale>;
  spacing: Record<string, string>;
  rounded: Record<string, string>;
  shadow: Record<string, string>;
  motion: Record<string, string>;
  breakpoints: Record<string, string>;
  components: {
    basics: {
      Button: { variants: { primary: { text: string } } };
      Modal: { mask: string };
    };
  };
};

const WEIGHT_NAMES: Record<string, string> = {
  "400": "regular",
  "500": "medium",
  "600": "semibold",
};

function readDesign(md: string): Design {
  const match = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) throw new Error("DESIGN.md has no YAML front matter");
  return parse(match[1]) as Design;
}

/** First pixel number inside a prose breakpoint such as "768–1199px（…）". */
function firstPx(value: string): string {
  const n = value.match(/(\d+)/);
  if (!n) throw new Error(`No pixel value in breakpoint "${value}"`);
  return `${n[1]}px`;
}

/** DESIGN.md motion minus prose-only keys (`reduced` documents a rule, it is not a value). */
const MOTION_PROSE = new Set(["reduced"]);
function motionTokens(motion: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(motion)
      .filter(([k]) => !MOTION_PROSE.has(k))
      .map(([k, v]) => [k, String(v)]),
  );
}

function buildTokens(d: Design) {
  const color: Record<string, string> = {};
  for (const [k, v] of Object.entries(d.colors.primary)) color[`primary-${k}`] = v;
  for (const [k, v] of Object.entries(d.colors.secondary)) color[`secondary-${k}`] = v;
  for (const [k, v] of Object.entries(d.colors.neutral)) color[`neutral-${k}`] = v;
  for (const [status, scale] of Object.entries(d.colors.status)) {
    for (const [k, v] of Object.entries(scale)) color[`status-${status}-${k}`] = v;
  }
  // 关系图谱: category colours etc. (graph-*) and the starfield theme (graph-dark-*). `fade` is
  // an opacity, not a colour, so it becomes its own token.
  const opacity: Record<string, string> = {};
  for (const group of ["graph", "graph-dark"] as const) {
    for (const [k, v] of Object.entries(d.colors[group])) {
      if (k === "fade") opacity[`${group}-fade`] = String(v);
      else color[`${group}-${k}`] = v;
    }
  }
  // Literal colours DESIGN.md writes inline in component specs, named here so components
  // still consume a token rather than a hex value.
  color["on-primary"] = d.components.basics.Button.variants.primary.text;
  color.mask = d.components.basics.Modal.mask;

  const font = {
    sans: String(d.typography["font-family"]),
    heading: String(d.typography["font-family-heading"]),
    mono: String(d.typography["font-family-mono"]),
  };
  const text: Record<string, TypeScale> = {};
  for (const [k, v] of Object.entries(d.typography)) if (typeof v === "object") text[k] = v;

  const weights = [...new Set(Object.values(text).map((t) => String(t.weight)))].sort();
  const fontWeight: Record<string, string> = {};
  for (const w of weights) fontWeight[WEIGHT_NAMES[w] ?? w] = w;

  return {
    color,
    opacity,
    font,
    text,
    fontWeight,
    spacing: d.spacing,
    radius: d.rounded,
    shadow: d.shadow,
    motion: motionTokens(d.motion),
    breakpoint: { md: firstPx(d.breakpoints.tablet), lg: firstPx(d.breakpoints.desktop) },
  };
}

export function generate(md: string): { css: string; ts: string } {
  const t = buildTokens(readDesign(md));
  const lines: string[] = [];
  const add = (name: string, value: string) => lines.push(`  --${name}: ${value};`);

  for (const [k, v] of Object.entries(t.color)) add(`color-${k}`, v);
  for (const [k, v] of Object.entries(t.opacity)) add(`opacity-${k}`, v);
  for (const [k, v] of Object.entries(t.font)) add(`font-${k}`, v);
  for (const [k, v] of Object.entries(t.fontWeight)) add(`font-weight-${k}`, v);
  for (const [k, v] of Object.entries(t.text)) {
    add(`text-${k}`, v.size);
    add(`text-${k}--line-height`, v["line-height"]);
    add(`text-${k}--font-weight`, String(v.weight));
  }
  for (const [k, v] of Object.entries(t.spacing)) add(`spacing-${k}`, v);
  for (const [k, v] of Object.entries(t.radius)) add(`radius-${k}`, v);
  for (const [k, v] of Object.entries(t.shadow)) add(`shadow-${k}`, v);
  for (const [k, v] of Object.entries(t.motion)) add(`motion-${k}`, v);
  // Tailwind v4 `ease-*` utilities (ease-standard / ease-decelerate / ease-accelerate).
  for (const [k, v] of Object.entries(t.motion)) {
    if (k.startsWith("easing-")) add(`ease-${k.slice("easing-".length)}`, v);
  }
  for (const [k, v] of Object.entries(t.breakpoint)) add(`breakpoint-${k}`, v);

  const css = [
    "/* GENERATED from DESIGN.md by scripts/design-tokens.ts — do not edit; run `pnpm tokens`. */",
    "@theme static {",
    "  --*: initial;",
    ...lines,
    "}",
    "",
  ].join("\n");

  const ts = [
    "// GENERATED from DESIGN.md by scripts/design-tokens.ts — do not edit; run `pnpm tokens`.",
    `export const tokens = ${JSON.stringify(t, null, 2)} as const;`,
    "",
    "export type Tokens = typeof tokens;",
    "",
  ].join("\n");

  return { css, ts };
}

function main() {
  const mode = process.argv[2];
  const { css, ts } = generate(readFileSync(DESIGN_MD, "utf8"));
  if (mode === "--write") {
    writeFileSync(CSS_OUT, css);
    writeFileSync(TS_OUT, ts);
    console.log("tokens written");
  } else if (mode === "--check") {
    const stale = readFileSync(CSS_OUT, "utf8") !== css || readFileSync(TS_OUT, "utf8") !== ts;
    if (stale) {
      console.error("tokens are stale — run `pnpm tokens`");
      process.exit(1);
    }
    console.log("tokens up to date");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
