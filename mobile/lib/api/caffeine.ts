// Client API wrapper for fetching and logging caffeine intake entries
import { apiGet, apiSend } from "./client";

export type CaffeineEntry = { value: number; unit: string; date: string; data_source: string };

export async function getCaffeineEntries(date?: string): Promise<CaffeineEntry[]> {
  const body = await apiGet<{ entries: CaffeineEntry[] }>(date ? `/caffeine?date=${date}` : "/caffeine");
  return body.entries;
}

export async function logCaffeine(valueMg: number, date?: string): Promise<void> {
  await apiSend("POST", "/caffeine", { value: valueMg, date });
}

// First-order decay, ~5h half-life (commonly cited average — varies a lot person to person;
// same "approximate, not clinical" caveat as biological age / sleep typical ranges).
const CAFFEINE_HALF_LIFE_HOURS = 5;

export function remainingCaffeineMg(doseMg: number, hoursSinceIntake: number): number {
  if (hoursSinceIntake < 0) return 0;
  return doseMg * Math.pow(0.5, hoursSinceIntake / CAFFEINE_HALF_LIFE_HOURS);
}

export function totalRemainingAt(entries: CaffeineEntry[], at: Date): number {
  return entries.reduce((sum, e) => {
    const hoursSince = (at.getTime() - new Date(e.date).getTime()) / (1000 * 60 * 60);
    return sum + remainingCaffeineMg(e.value, hoursSince);
  }, 0);
}
