// Score formulas: Recovery, Sleep, Stress, Daily score and biological age
export type Baseline = { mean: number; sd: number };

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

function zScore(value: number, baseline: Baseline): number {
  if (baseline.sd <= 0) return 0;
  return (value - baseline.mean) / baseline.sd;
}

/** Maps a z-score in [-2, 2] to a 0-100 scale. z=0 -> 50. `invert` flips direction (for metrics where lower is better). */
function zToScore(z: number, invert = false): number {
  const signed = invert ? -z : z;
  return clamp(50 + signed * 25, 0, 100);
}

// --- Recovery: 70% HRV z-score + 20% RHR z-score (inverted) + 10% Sleep score ---

export function recoveryScore(input: {
  hrv?: { value: number; baseline: Baseline };
  restingHeartRate?: { value: number; baseline: Baseline };
  sleepScore?: number;
}): number | null {
  const hrvScore = input.hrv ? zToScore(zScore(input.hrv.value, input.hrv.baseline)) : null;
  const rhrScore = input.restingHeartRate
    ? zToScore(zScore(input.restingHeartRate.value, input.restingHeartRate.baseline), true)
    : null;
  const sleep = input.sleepScore ?? null;

  if (hrvScore === null && rhrScore === null && sleep === null) return null;

  return 0.7 * (hrvScore ?? 50) + 0.2 * (rhrScore ?? 50) + 0.1 * (sleep ?? 50);
}

// --- Sleep: 35% duration + 30% efficiency + 20% deep+REM stage share + 15% consistency ---

export function sleepScore(input: {
  totalAsleepMinutes?: number;
  totalInBedMinutes?: number;
  deepPlusRemMinutes?: number;
  bedtimeConsistencyStdDevMinutes?: number;
}): number | null {
  const { totalAsleepMinutes, totalInBedMinutes, deepPlusRemMinutes, bedtimeConsistencyStdDevMinutes } =
    input;

  if (
    totalAsleepMinutes === undefined &&
    totalInBedMinutes === undefined &&
    deepPlusRemMinutes === undefined &&
    bedtimeConsistencyStdDevMinutes === undefined
  ) {
    return null;
  }

  let durationScore: number | null = null;
  if (totalAsleepMinutes !== undefined) {
    const hours = totalAsleepMinutes / 60;
    // Plateau 7-9h = 100; -20 points per hour outside that band.
    const hoursOutsideBand = Math.max(0, Math.abs(hours - 8) - 1);
    durationScore = clamp(100 - hoursOutsideBand * 20, 0, 100);
  }

  let efficiencyScore: number | null = null;
  if (totalAsleepMinutes !== undefined && totalInBedMinutes && totalInBedMinutes > 0) {
    const efficiency = totalAsleepMinutes / totalInBedMinutes;
    efficiencyScore = clamp(((efficiency - 0.65) / (0.95 - 0.65)) * 100, 0, 100);
  }

  let stageScore: number | null = null;
  if (deepPlusRemMinutes !== undefined && totalAsleepMinutes && totalAsleepMinutes > 0) {
    const proportion = deepPlusRemMinutes / totalAsleepMinutes;
    stageScore = clamp((proportion / 0.45) * 100, 0, 100);
  }

  let consistencyScore: number | null = null;
  if (bedtimeConsistencyStdDevMinutes !== undefined) {
    consistencyScore = clamp(100 - (bedtimeConsistencyStdDevMinutes / 120) * 100, 0, 100);
  }

  return (
    0.35 * (durationScore ?? 50) +
    0.3 * (efficiencyScore ?? 50) +
    0.2 * (stageScore ?? 50) +
    0.15 * (consistencyScore ?? 50)
  );
}

// --- Stress: 100 - (60% daytime HR elevation + 40% training load elevation) ---
// Higher is always better here (calmer), matching the other three scores' convention.

export function stressScore(input: {
  daytimeHeartRate?: { value: number; baseline: Baseline };
  trainingLoad?: { value: number; baseline: Baseline };
}): number | null {
  const hrElevationScore = input.daytimeHeartRate
    ? zToScore(zScore(input.daytimeHeartRate.value, input.daytimeHeartRate.baseline), true)
    : null;
  const loadScore = input.trainingLoad
    ? zToScore(zScore(input.trainingLoad.value, input.trainingLoad.baseline), true)
    : null;

  if (hrElevationScore === null && loadScore === null) return null;

  return 0.6 * (hrElevationScore ?? 50) + 0.4 * (loadScore ?? 50);
}

// --- Daily Score: 40% Recovery + 35% Sleep + 25% Stress ---

export function dailyScore(input: {
  recovery?: number | null;
  sleep?: number | null;
  stress?: number | null;
}): number | null {
  if (input.recovery == null && input.sleep == null && input.stress == null) return null;
  return 0.4 * (input.recovery ?? 50) + 0.35 * (input.sleep ?? 50) + 0.25 * (input.stress ?? 50);
}

// --- Biological age: HRV vs. approximate published age-decade averages, capped at +/-8 years ---
// Reference points are commonly-cited approximations (overnight SDNN, ms), not a clinical
// dataset. This is explicitly a "fun estimate" feature per the product spec, not a diagnostic.
const HRV_BY_AGE_MS: Array<[age: number, sdnnMs: number]> = [
  [20, 60],
  [30, 50],
  [40, 40],
  [50, 35],
  [60, 28],
  [70, 24],
];

function estimateAgeFromHrv(hrvMs: number): number {
  // Find the two reference points the value falls between and linearly interpolate.
  // The curve is decreasing, so clamp outside the table's range to its endpoints.
  if (hrvMs >= HRV_BY_AGE_MS[0][1]) return HRV_BY_AGE_MS[0][0];
  const last = HRV_BY_AGE_MS[HRV_BY_AGE_MS.length - 1];
  if (hrvMs <= last[1]) return last[0];

  for (let i = 0; i < HRV_BY_AGE_MS.length - 1; i++) {
    const [ageA, hrvA] = HRV_BY_AGE_MS[i];
    const [ageB, hrvB] = HRV_BY_AGE_MS[i + 1];
    if (hrvMs <= hrvA && hrvMs >= hrvB) {
      const t = (hrvA - hrvMs) / (hrvA - hrvB);
      return ageA + t * (ageB - ageA);
    }
  }
  return HRV_BY_AGE_MS[0][0];
}

export function biologicalAge(actualAge: number, hrvBaselineMs: number): number {
  const hrvEstimatedAge = estimateAgeFromHrv(hrvBaselineMs);
  const shift = clamp(hrvEstimatedAge - actualAge, -8, 8);
  return actualAge + shift;
}
