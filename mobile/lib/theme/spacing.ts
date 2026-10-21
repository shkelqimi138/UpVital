// Spacing ramp. The design handoff specifies a raw numeric ramp
// (2/4/6/8/10/12/14/16/18/20/22/26) rather than semantic steps, and it reuses the names
// sm/md/lg/xl with *different* values than this file originally had (its `md` is 8, ours
// is 12). Silently re-pointing those names would have shrunk padding on every screen that
// already uses them — Card's padding would have gone 16 -> 10, against the handoff's own
// generously-padded cards. So the existing semantic names keep their values, and the
// ramp steps that were missing are added alongside. Together they cover the full ramp.
export const spacing = {
  xxs: 2,
  xs: 4,
  s6: 6,
  sm: 8,
  s10: 10,
  md: 12,
  s14: 14,
  lg: 16,
  s18: 18,
  xl: 20,
  s22: 22,
  xxl: 24,
  s26: 26,
} as const;

// Named layout constants called out explicitly in the handoff.
export const layout = {
  /** Horizontal screen padding (24 on onboarding). */
  screenPadding: 18,
  onboardingPadding: 24,
  /** Top offset that clears the status bar. */
  screenTop: 62,
  /** Gap between stacked cards. */
  cardGap: 12,
  /** Gap inside tile grids. */
  gridGap: 10,
} as const;

// The handoff's radii are all new semantic names (tile/card/hero/glass/sheet/button/
// field/chip/pill) and don't collide with the existing sm..full scale, so this is purely
// additive — existing call sites are untouched.
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  full: 9999,

  // Design handoff
  chip: 14,
  field: 16,
  button: 17,
  tile: 20,
  card: 22,
  hero: 26,
  glass: 28,
  sheet: 28,
  pill: 9999,
} as const;
