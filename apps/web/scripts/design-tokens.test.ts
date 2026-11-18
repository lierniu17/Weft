import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CSS_OUT, DESIGN_MD, generate, TS_OUT } from "./design-tokens.ts";

const design = readFileSync(DESIGN_MD, "utf8");

describe("design tokens generated from DESIGN.md (style refresh AC-1)", () => {
  const { css, ts } = generate(design);

  it("projects the neutral ink palette as CSS variables", () => {
    // Primary = near-black ink; secondary folded into the neutral greys.
    expect(css).toContain("--color-primary-6: #18181B;");
    expect(css).toContain("--color-primary-5: #27272A;");
    expect(css).toContain("--color-primary-7: #09090B;");
    expect(css).toContain("--color-primary-1: #F4F4F5;");
    expect(css).toContain("--color-secondary-6: #52525B;");
    expect(css).toContain("--color-neutral-bg-layout: #FFFFFF;");
    expect(css).toContain("--color-neutral-bg-subtle: #F7F7F8;");
    expect(css).toContain("--color-neutral-bg-muted: #F0F0F2;");
    expect(css).toContain("--color-neutral-border: #E4E4E7;");
    expect(css).toContain("--color-neutral-divider: #ECECEF;");
    expect(css).toContain("--color-neutral-text-primary: #18181B;");
    expect(css).toContain("--color-neutral-text-secondary: #52525B;");
    expect(css).toContain("--color-neutral-text-tertiary: #71717A;");
    expect(css).toContain("--color-neutral-text-disabled: #A1A1AA;");
  });

  it("projects status colours with a graphic tone for icons", () => {
    expect(css).toContain("--color-status-success-6: #15803D;");
    expect(css).toContain("--color-status-success-graphic: #16A34A;");
    expect(css).toContain("--color-status-warning-1: #FFFBEB;");
    expect(css).toContain("--color-status-warning-6: #B45309;");
    expect(css).toContain("--color-status-error-6: #B91C1C;");
    expect(css).toContain("--color-status-error-graphic: #DC2626;");
    expect(css).toContain("--color-status-info-6: #1D4ED8;");
    expect(css).toContain("--color-mask: rgba(9, 9, 11, 0.32);");
  });

  it("drops every colour of the old indigo palette (outside the graph categories)", () => {
    const outsideGraph = css
      .split("\n")
      .filter((l) => !l.includes("--color-graph"))
      .join("\n");
    for (const old of ["#4F46E5", "#6366F1", "#4338CA", "#EEF2FF", "#F5F6F8", "#DDE1E8"]) {
      expect(outsideGraph).not.toContain(old);
    }
    for (const old of ["#1D2433", "#5B6475", "#9AA3B2", "#E6F6F4", "#C81E1E", "#FFF7E6"]) {
      expect(outsideGraph).not.toContain(old);
    }
    expect(css).not.toContain("--shadow-card");
    expect(css).not.toContain("--shadow-overlay");
  });

  it("projects the relationship-graph colours, light and starfield, unchanged", () => {
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

  it("projects radius, spacing, typography and shadow (AC-2)", () => {
    expect(css).toContain("--radius-sm: 8px;");
    expect(css).toContain("--radius-md: 12px;");
    expect(css).toContain("--radius-lg: 20px;");
    expect(css).toContain("--radius-xl: 24px;");
    expect(css).toContain("--radius-bubble: 18px 18px 6px 18px;");
    expect(css).toContain("--radius-full: 9999px;");
    for (const [k, v] of Object.entries({
      xs: 4,
      sm: 8,
      md: 16,
      lg: 24,
      xl: 32,
      xxl: 48,
      xxxl: 64,
    })) {
      expect(css).toContain(`--spacing-${k}: ${v}px;`);
    }
    expect(css).toContain("--text-h1: 24px;");
    expect(css).toContain("--text-h1--line-height: 32px;");
    expect(css).toContain("--text-h1--font-weight: 600;");
    expect(css).toContain("--text-body-md: 15px;");
    expect(css).toContain("--text-body-md--line-height: 24px;");
    expect(css).toContain("--text-section: 13px;");
    expect(css).toContain("--text-section--font-weight: 600;");
    expect(css).toContain("--text-meta: 13px;");
    expect(css).toContain("--text-meta--line-height: 20px;");
    expect(css).toContain("--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.04);");
    expect(css).toContain("--shadow-md: 0 4px 16px rgba(0, 0, 0, 0.06);");
    expect(css).toContain("--shadow-lg: 0 12px 32px rgba(0, 0, 0, 0.10);");
    expect(css).toContain("--font-sans: 'PingFang SC', 'HarmonyOS Sans SC', 'Inter'");
  });

  it("projects motion as CSS custom properties and Tailwind easing entries (AC-12, 13, 15)", () => {
    expect(css).toContain("--motion-fast: 120ms;");
    expect(css).toContain("--motion-base: 200ms;");
    expect(css).toContain("--motion-exit: 150ms;");
    expect(css).toContain("--motion-sheet: 250ms;");
    expect(css).toContain("--motion-sheet-exit: 200ms;");
    expect(css).toContain("--motion-emphasis: 300ms;");
    expect(css).toContain("--motion-stagger: 30ms;");
    expect(css).toContain("--motion-stagger-max: 6;");
    expect(css).toContain("--motion-rise: 8px;");
    expect(css).toContain("--motion-skeleton: 1.6s;");
    expect(css).toContain("--motion-press-scale: 0.98;");
    expect(css).toContain("--motion-easing-decelerate: cubic-bezier(0, 0, 0, 1);");
    // Tailwind `ease-*` utilities.
    expect(css).toContain("--ease-standard: cubic-bezier(0.2, 0, 0, 1);");
    expect(css).toContain("--ease-decelerate: cubic-bezier(0, 0, 0, 1);");
    expect(css).toContain("--ease-accelerate: cubic-bezier(0.3, 0, 1, 1);");
    // The prose 「reduced」 rule is documentation, not a value.
    expect(css).not.toContain("--motion-reduced");
    expect(ts).toContain('"sheet": "250ms"');
  });

  it("does not leak Tailwind's default spacing or palette", () => {
    // Only DESIGN.md values may become utilities (AC-2: spacing 4/8/16/24/32/48/64 only).
    expect(css).toContain("--*: initial;");
  });

  it("exposes the same values as a typed TS object", () => {
    expect(ts).toContain('"primary-6": "#18181B"');
    expect(ts).toContain('"full": "9999px"');
    expect(ts).toContain("as const");
  });

  it("committed outputs are up to date with DESIGN.md (run `pnpm tokens`)", () => {
    expect(readFileSync(CSS_OUT, "utf8")).toBe(css);
    expect(readFileSync(TS_OUT, "utf8")).toBe(ts);
  });
});
