// GENERATED from DESIGN.md by scripts/design-tokens.ts — do not edit; run `pnpm tokens`.
export const tokens = {
  "color": {
    "primary-1": "#EEF2FF",
    "primary-5": "#6366F1",
    "primary-6": "#4F46E5",
    "primary-7": "#4338CA",
    "secondary-1": "#E6F6F4",
    "secondary-5": "#0E9384",
    "secondary-6": "#0B7A6E",
    "secondary-7": "#08635A",
    "neutral-bg-layout": "#F5F6F8",
    "neutral-bg-container": "#FFFFFF",
    "neutral-border": "#DDE1E8",
    "neutral-divider": "#EBEEF2",
    "neutral-text-primary": "#1D2433",
    "neutral-text-secondary": "#5B6475",
    "neutral-text-disabled": "#9AA3B2",
    "status-success-1": "#ECFDF3",
    "status-success-6": "#15803D",
    "status-success-7": "#166534",
    "status-warning-1": "#FFF7E6",
    "status-warning-6": "#B45309",
    "status-warning-7": "#92400E",
    "status-error-1": "#FEF2F2",
    "status-error-6": "#C81E1E",
    "status-error-7": "#A51A1A",
    "status-info-1": "#EFF6FF",
    "status-info-6": "#2563EB",
    "status-info-7": "#1D4ED8",
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
    "mask": "rgba(31, 36, 48, 0.45)"
  },
  "opacity": {
    "graph-fade": "0.15"
  },
  "font": {
    "sans": "'PingFang SC', 'Inter', 'Noto Sans SC', 'Microsoft YaHei', sans-serif",
    "heading": "'PingFang SC', 'Inter', 'Noto Sans SC', 'Microsoft YaHei', sans-serif",
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
      "line-height": "22px"
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
    "sm": "6px",
    "md": "10px",
    "lg": "16px",
    "full": "9999px"
  },
  "shadow": {
    "card": "0 1px 2px rgba(29, 36, 51, 0.06), 0 2px 8px rgba(29, 36, 51, 0.06)",
    "overlay": "0 -8px 24px rgba(0, 0, 0, 0.12)"
  },
  "motion": {
    "fast": "120ms cubic-bezier(0.2, 0, 0, 1)",
    "base": "200ms cubic-bezier(0.2, 0, 0, 1)",
    "sheet": "240ms cubic-bezier(0.2, 0, 0, 1)"
  },
  "breakpoint": {
    "md": "768px",
    "lg": "1200px"
  }
} as const;

export type Tokens = typeof tokens;
