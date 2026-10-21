// --- Day Strain (0-21) ---
//
// Strain is a cardiovascular-load score on the 0-21 scale the design handoff's Activity
// gauge expects. There is NO standard definition of this metric — the 0-21 range is a
// Whoop convention — so this is an explicit Upvital heuristic: time spent in each
// heart-rate zone, weighted so higher zones cost disproportionately more, mapped onto a
// saturating curve. Numbers are internally consistent but are NOT comparable to another
// app's strain, and shouldn't be presented as if they were.

export const STRAIN_MAX = 21;
/** Band highlighted on the gauge track as the productive range. */
export const STRAIN_OPTIMAL: readonly [number, number] = [12.5, 15];

/** Lower bound of each zone as a fraction of max heart rate. Zone 1 starts at 50%. */
const ZONE_FLOORS = [0.5, 0.6, 0.7, 0.8, 0.9] as const;

/** Per-minute cost of each zone. Roughly doubling per zone: easy work is nearly free,
 *  time near max is what actually drives the score. */
const ZONE_WEIGHTS = [0.5, 1, 2, 4, 8] as const;

/** Scales weighted load onto the 0-21 curve. Tuned so a solid session — say 60 min in
 *  zone 3 plus 30 min in zone 4 — lands around 13.4, inside the optimal band. */
const LOAD_SCALE = 240;

/** Age-predicted maximum heart rate. The classic 220-age estimate: crude, but it only
 *  needs to set zone boundaries, and it's what consumer wearables use. */
export function maxHeartRate(ageYears: number): number {
  return 220 - ageYears;
}

/** Zone index 0-4 for a heart rate, or -1 when below zone 1 (i.e. at rest). */
export function heartRateZone(bpm: number, maxHr: number): number {
  if (maxHr <= 0) return -1;
  const fraction = bpm / maxHr;
  let zone = -1;
  for (let i = 0; i < ZONE_FLOORS.length; i++) {
    if (fraction >= ZONE_FLOORS[i]) zone = i;
  }
  return zone;
}

export type ZoneMinutes = { zone: number; minutes: number };

/** Weighted cardiovascular load from time-in-zone. */
export function weightedLoad(zoneMinutes: ZoneMinutes[]): number {
  return zoneMinutes.reduce((sum, z) => {
    if (z.zone < 0 || z.zone >= ZONE_WEIGHTS.length) return sum;
    return sum + z.minutes * ZONE_WEIGHTS[z.zone];
  }, 0);
}

/**
 * Maps weighted load onto 0-21.
 *
 * Saturating (`1 - e^-x`) rather than linear because strain should get progressively
 * harder to add — the difference between an easy day and a hard one matters far more
 * than between a hard day and a brutal one, and the scale must never exceed 21.
 */
export function strainFromLoad(load: number): number {
  if (load <= 0) return 0;
  return STRAIN_MAX * (1 - Math.exp(-load / LOAD_SCALE));
}

/** Convenience: zone minutes straight to a strain score. */
export function dayStrain(zoneMinutes: ZoneMinutes[]): number {
  return strainFromLoad(weightedLoad(zoneMinutes));
}
