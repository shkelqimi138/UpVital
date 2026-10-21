import type { TextStyle } from "react-native";

// Type scale from the design handoff (`tokens.ts`). Still the system font (SF Pro on
// iOS) — the handoff explicitly says "system SF Pro; no webfont needed on iOS".
// Letter-spacing is in px, already converted from the handoff's em values.
//
// The previous spec-derived scale (displayXl/headingLg/bodySm/...) had zero call sites —
// every screen was using raw `fontSize` in StyleSheet — so it was replaced outright
// rather than kept as dead aliases.
export const typography = {
  /** Dashboard hero score. */
  heroScore: { fontSize: 62, fontWeight: "700", letterSpacing: -2.8 } satisfies TextStyle,
  screenTitle: { fontSize: 26, fontWeight: "700", letterSpacing: -0.65 } satisfies TextStyle,
  /** Value shown in a detail sheet. */
  sheetValue: { fontSize: 44, fontWeight: "700", letterSpacing: -1.8 } satisfies TextStyle,
  bigStat: { fontSize: 34, fontWeight: "700", letterSpacing: -1.4 } satisfies TextStyle,
  cardStat: { fontSize: 24, fontWeight: "700", letterSpacing: -0.85 } satisfies TextStyle,
  listStat: { fontSize: 19, fontWeight: "700", letterSpacing: -0.6 } satisfies TextStyle,
  sectionTitle: { fontSize: 16, fontWeight: "700", letterSpacing: -0.16 } satisfies TextStyle,
  body: { fontSize: 13.5, fontWeight: "500", lineHeight: 19.5 } satisfies TextStyle,
  bodyLarge: { fontSize: 15.5, fontWeight: "500", lineHeight: 22.5 } satisfies TextStyle,
  label: { fontSize: 12.5, fontWeight: "600" } satisfies TextStyle,
  /** Eyebrow / micro-label, e.g. "TODAY'S INSIGHT". */
  micro: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  } satisfies TextStyle,
  tabLabel: { fontSize: 10, fontWeight: "600" } satisfies TextStyle,
} as const;

// Numeric counters (scores, HRV values, etc.) should use fixed-width digits so they
// don't jitter when the value updates — apply alongside any of the styles above.
export const tabularNums: TextStyle = { fontVariant: ["tabular-nums"] };
