// GENERATED from DESIGN.md by scripts/design-tokens.ts — do not edit; run `pnpm tokens`.
export const tokens = {
  "color": {
    "primary-1": "#F4F4F5",
    "primary-5": "#27272A",
    "primary-6": "#18181B",
    "primary-7": "#09090B",
    "secondary-1": "#F4F4F5",
    "secondary-5": "#3F3F46",
    "secondary-6": "#52525B",
    "secondary-7": "#27272A",
    "neutral-bg-layout": "#FFFFFF",
    "neutral-bg-container": "#FFFFFF",
    "neutral-bg-subtle": "#F7F7F8",
    "neutral-bg-muted": "#F0F0F2",
    "neutral-border": "#E4E4E7",
    "neutral-divider": "#ECECEF",
    "neutral-text-primary": "#18181B",
    "neutral-text-secondary": "#52525B",
    "neutral-text-tertiary": "#71717A",
    "neutral-text-disabled": "#A1A1AA",
    "status-success-1": "#F0FDF4",
    "status-success-6": "#15803D",
    "status-success-7": "#166534",
    "status-success-graphic": "#16A34A",
    "status-warning-1": "#FFFBEB",
    "status-warning-6": "#B45309",
    "status-warning-7": "#92400E",
    "status-warning-graphic": "#D97706",
    "status-error-1": "#FEF2F2",
    "status-error-6": "#B91C1C",
    "status-error-7": "#991B1B",
    "status-error-graphic": "#DC2626",
    "status-info-1": "#EFF6FF",
    "status-info-6": "#1D4ED8",
    "status-info-7": "#1E40AF",
    "status-info-graphic": "#2563EB",
    "graph-kin": "#0B7A6E",
    "graph-romance": "#DB2777",
    "graph-social": "#4F46E5",
    "graph-interest": "#B45309",
    "graph-hostile": "#C81E1E",
    "graph-tense": "#C81E1E",
    "graph-path": "#F59E0B",
    "graph-ring": "rgba(91, 100, 117, 0.12)",
    "graph-dark-bg-inner": "#121A38",
    "graph-dark-bg-outer": "#05070F",
    "graph-dark-star": "rgba(200, 210, 255, 0.8)",
    "graph-dark-ring": "rgba(140, 160, 230, 0.14)",
    "graph-dark-text": "#C7D2FE",
    "graph-dark-text-muted": "#9AA6C8",
    "graph-dark-node-fill": "#0E1430",
    "graph-dark-self-fill": "#312E81",
    "graph-dark-self-stroke": "#A5B4FC",
    "graph-dark-kin": "#2DD4BF",
    "graph-dark-romance": "#F472B6",
    "graph-dark-social": "#818CF8",
    "graph-dark-interest": "#FBBF24",
    "graph-dark-hostile": "#FB7185",
    "graph-dark-tense": "#FB7185",
    "graph-dark-path": "#FDE68A",
    "graph-dark-panel": "rgba(14, 20, 40, 0.92)",
    "graph-dark-panel-border": "#24304F",
    "on-primary": "#FFFFFF",
    "mask": "rgba(9, 9, 11, 0.32)"
  },
  "opacity": {
    "graph-fade": "0.15"
  },
  "font": {
    "sans": "'PingFang SC', 'HarmonyOS Sans SC', 'Inter', 'Noto Sans SC', 'Microsoft YaHei', sans-serif",
    "heading": "'PingFang SC', 'HarmonyOS Sans SC', 'Inter', 'Noto Sans SC', 'Microsoft YaHei', sans-serif",
    "mono": "'JetBrains Mono', 'SFMono-Regular', Consolas, monospace"
  },
  "text": {
    "h1": {
      "size": "24px",
      "weight": "600",
      "line-height": "32px"
    },
    "h2": {
      "size": "20px",
      "weight": "600",
      "line-height": "28px"
    },
    "h3": {
      "size": "17px",
      "weight": "600",
      "line-height": "24px"
    },
    "body-lg": {
      "size": "16px",
      "weight": "400",
      "line-height": "24px"
    },
    "body-md": {
      "size": "15px",
      "weight": "400",
      "line-height": "24px"
    },
    "body-sm": {
      "size": "14px",
      "weight": "400",
      "line-height": "20px"
    },
    "caption": {
      "size": "12px",
      "weight": "400",
      "line-height": "18px"
    },
    "section": {
      "size": "13px",
      "weight": "600",
      "line-height": "20px",
      "color": "colors.neutral.text-tertiary"
    },
    "meta": {
      "size": "13px",
      "weight": "400",
      "line-height": "20px",
      "color": "colors.neutral.text-tertiary"
    }
  },
  "fontWeight": {
    "regular": "400",
    "semibold": "600"
  },
  "spacing": {
    "xs": "4px",
    "sm": "8px",
    "md": "16px",
    "lg": "24px",
    "xl": "32px",
    "xxl": "48px",
    "xxxl": "64px"
  },
  "radius": {
    "sm": "8px",
    "md": "12px",
    "lg": "20px",
    "xl": "24px",
    "bubble": "18px 18px 6px 18px",
    "full": "9999px"
  },
  "shadow": {
    "sm": "0 1px 2px rgba(0, 0, 0, 0.04)",
    "md": "0 4px 16px rgba(0, 0, 0, 0.06)",
    "lg": "0 12px 32px rgba(0, 0, 0, 0.10)"
  },
  "motion": {
    "easing-standard": "cubic-bezier(0.2, 0, 0, 1)",
    "easing-decelerate": "cubic-bezier(0, 0, 0, 1)",
    "easing-accelerate": "cubic-bezier(0.3, 0, 1, 1)",
    "fast": "120ms",
    "base": "200ms",
    "exit": "150ms",
    "sheet": "250ms",
    "emphasis": "300ms",
    "stagger": "30ms",
    "stagger-max": "6",
    "sheet-exit": "200ms",
    "rise": "8px",
    "skeleton": "1.6s",
    "press-scale": "0.98"
  },
  "breakpoint": {
    "md": "768px",
    "lg": "1200px"
  }
} as const;

export type Tokens = typeof tokens;
