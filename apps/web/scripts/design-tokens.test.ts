import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CSS_OUT, DESIGN_MD, generate, TS_OUT } from "./design-tokens.ts";

const design = readFileSync(DESIGN_MD, "utf8");

describe("design tokens generated from DESIGN.md", () => {
  const { css, ts } = generate(design);

  it("projects the colour palette as CSS variables", () => {
    expect(css).toContain("--color-primary-6: #4F46E5;");
    expect(css).toContain("--color-primary-5: #6366F1;");
    expect(css).toContain("--color-primary-7: #4338CA;");
    expect(css).toContain("--color-secondary-1: #E6F6F4;");
    expect(css).toContain("--color-neutral-bg-layout: #F5F6F8;");
    expect(css).toContain("--color-neutral-border: #DDE1E8;");
    expect(css).toContain("--color-status-error-6: #C81E1E;");
    expect(css).toContain("--color-status-warning-1: #FFF7E6;");
  });

  it("projects the relationship-graph colours, light and starfield (graph-viz AC-UI-2)", () => {
    expect(css).toContain("--color-graph-kin: #0B7A6E;");
    expect(css).toContain("--color-graph-romance: #DB2777;");
    expect(css).toContain("--color-graph-path: #F59E0B;");
    expect(css).toContain("--color-graph-dark-bg-inner: #121A38;");
    expect(css).toContain("--color-graph-dark-social: #818CF8;");
    expect(css).toContain("--color-graph-dark-panel: rgba(14, 20, 40, 0.92);");
    expect(css).toContain("--opacity-graph-fade: 0.15;");
    expect(css).not.toContain("--color-graph-fade");
    expect(ts).toContain('"graph-dark-path": "#FDE68A"');
  });

  it("projects radius, spacing, typography, shadow and motion", () => {
    expect(css).toContain("--radius-sm: 6px;");
    expect(css).toContain("--radius-md: 10px;");
    expect(css).toContain("--radius-lg: 16px;");
    expect(css).toContain("--radius-full: 9999px;");
    expect(css).toContain("--spacing-md: 16px;");
    expect(css).toContain("--spacing-xxxl: 64px;");
    expect(css).toContain("--text-body-md: 15px;");
    expect(css).toContain("--text-body-md--line-height: 22px;");
    expect(css).toContain("--motion-sheet: 240ms cubic-bezier(0.2, 0, 0, 1);");
    expect(css).toContain("--shadow-overlay: 0 -8px 24px rgba(0, 0, 0, 0.12);");
    expect(css).toContain("--font-sans: 'PingFang SC', 'Inter', 'Noto Sans SC'");
  });

  it("does not leak Tailwind's default spacing or palette", () => {
    // Only DESIGN.md values may become utilities (AC-UI-4: spacing 4/8/16/24/32/48/64 only).
    expect(css).toContain("--*: initial;");
  });

  it("can express the four ConfidenceBadge looks (AC-UI-5, built in batch 4)", () => {
    // 亲历 primary-1/7, 本人说 secondary-1/7, 转述 warning-1/6, 推测 bg-layout + text-secondary + dashed border.
    for (const name of [
      "--color-primary-1: #EEF2FF;",
      "--color-primary-7: #4338CA;",
      "--color-secondary-1: #E6F6F4;",
      "--color-secondary-7: #08635A;",
      "--color-status-warning-1: #FFF7E6;",
      "--color-status-warning-6: #B45309;",
      "--color-neutral-text-secondary: #5B6475;",
      "--color-neutral-border: #DDE1E8;",
    ]) {
      expect(css).toContain(name);
    }
  });

  it("exposes the same values as a typed TS object", () => {
    expect(ts).toContain('"primary-6": "#4F46E5"');
    expect(ts).toContain('"full": "9999px"');
    expect(ts).toContain("as const");
  });

  it("committed outputs are up to date with DESIGN.md (run `pnpm tokens`)", () => {
    expect(readFileSync(CSS_OUT, "utf8")).toBe(css);
    expect(readFileSync(TS_OUT, "utf8")).toBe(ts);
  });
});
