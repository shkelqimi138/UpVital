// Per-metric "higher is better" flags: delta badges, threshold bars, and status pills all
// need to know whether an increase is good or bad news for that specific metric — it isn't a
// single hardcoded rule (HRV down is bad/red, but stress up is bad/pink — the polarity is
// metric-dependent, not universal).
//
// Important divergence from the Century AI reference: Upvital's Recovery/Sleep/Stress/Daily
// Score formulas (backend/src/scoring/formulas.ts) are ALL already normalized so higher = better
// (e.g. stressScore's own comment: "Higher is always better here (calmer)"). Century AI's raw
// "41/100" stress number is NOT normalized that way (up = worse there). Don't copy the
// reference app's stress polarity — Upvital's stress_score is already inverted at the source.
export const METRIC_HIGHER_IS_BETTER: Record<string, boolean> = {
  recovery_score: true,
  sleep_score: true,
  stress_score: true, // Upvital-specific: already inverted so higher = calmer = better
  daily_score: true,
  biological_age: false,
  hrv: true,
  resting_heart_rate: false,
  heart_rate: false,
  steps: true,
  sleep_hours: true, // approaching the user's goal, not unbounded — treat as higher-is-better below goal
  active_calories: true,
  body_fat_percentage: false,
  air_quality_index: false,
  training_load: false,
};

export function isHigherBetter(metric: string): boolean {
  return METRIC_HIGHER_IS_BETTER[metric] ?? true;
}
