// Color tokens (UpVital is dark-only), plus data and status colors
export type ColorTokens = {
  background: string;
  card: string;
  cardInset: string;
  pill: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  /** Bottom-sheet surface. Sits slightly above `card` in dark mode. */
  sheet: string;
  /** Near-black surface used by the AI insight / coach cards. */
  insight: string;
  /** Text on `insight` (light, since the surface is near-black). */
  insightText: string;
  /** Text on a filled brand-green or ink button. */
  inverseText: string;
  /** Green text (links, "Edit", success messages). */
  link: string;
  accent: {
    green: string;
    yellow: string;
    red: string;
    pink: string;
    blue: string;
    cyan: string;
    indigo: string;
    orange: string;
  };
  /**
   * Meaning-based aliases for UI state (errors, warnings, good/bad changes, links). Same
   * values as the matching `accent` hues; use `accent` when a color stands for a metric.
   */
  status: {
    success: string;
    warning: string;
    error: string;
    info: string;
  };
};

// --- Brand + data colors (design handoff `tokens.ts`) ---------------------------------
// The handoff defines `brand` and `data` outside the scheme maps, so the same
// green/heart/steps values are used everywhere. That's a
// deliberate change from the previous Apple-HIG approach, which shifted every accent
// between schemes.

export const brand = {
  green: "#16A34A",
  // Also the fill behind white text (buttons, chat bubbles): 4.7:1, where `green` is only 3.3:1.
  greenDeep: "#12854A",
  greenDark: "#0C6B3C",
  greenBright: "#3FD37F",
  mint: "#B9F5D0",
  mintText: "#5FE39C",
  heroGradient: ["#1AA85B", "#12854A", "#0C6B3C"] as const, // 158deg
  sleepGradient: ["#2B2D6B", "#1B1D4C", "#111336"] as const, // 165deg
  gaugeGradient: ["#1E8E57", "#3FD37F", "#B9F5D0"] as const,
} as const;

// Per-metric colors. `soft` is the 14-16% alpha background used behind metric icon chips.
export const data = {
  heart: "#E5484D",
  hrv: "#16A34A",
  steps: "#2F6FED",
  calories: "#E0A02F",
  stress: "#E0A02F",
  sleep: "#5B5BD6",
  spo2: "#5B5BD6",
  bodyTemp: "#0E9AA7",
  soft: {
    heart: "rgba(229,72,77,0.14)",
    hrv: "rgba(22,163,74,0.14)",
    steps: "rgba(47,111,237,0.14)",
    calories: "rgba(224,160,47,0.16)",
    sleep: "rgba(91,91,214,0.14)",
    bodyTemp: "rgba(14,154,167,0.14)",
  },
  sleepStages: { deep: "#4B49B6", light: "#B7B4F2", rem: "#8E8BEA", awake: "#D8D6F5" },
} as const;

// `accent` keeps its original key names so existing screens keep compiling, but the
// values now come from the handoff's data palette:
//   green -> brand green | red -> heart | blue -> steps
//   yellow -> calories/stress | indigo -> sleep/spo2 | cyan -> body temp
// `pink` and `orange` have no handoff equivalent; they're retained for the existing
// RingGauge rainbow sweep and are unchanged.
const accent = {
  green: brand.green,
  yellow: data.calories,
  red: data.heart,
  pink: "#FF2D78",
  blue: data.steps,
  cyan: data.bodyTemp,
  indigo: data.sleep,
  orange: "#FF9F0A",
} as const;

// UI-state meanings, mapped onto the accent hues above.
const status = {
  success: accent.green,
  warning: accent.yellow,
  error: accent.red,
  info: accent.blue,
} as const;

export const dark: ColorTokens = {
  background: "#080A09",
  card: "#131817",
  cardInset: "#1B2120",
  pill: "#1B2120",
  border: "rgba(255,255,255,0.08)",
  textPrimary: "#F1F5F3",
  // Contrast pass (2026-10-07): both read at 4.5:1 or more on every surface.
  textSecondary: "#9DA7A2",
  textTertiary: "#838D88",
  sheet: "#151A19",
  insight: "#101615",
  insightText: "#EDF2EF",
  inverseText: "#080A09",
  link: brand.green,
  accent: { ...accent },
  status: { ...status },
};
