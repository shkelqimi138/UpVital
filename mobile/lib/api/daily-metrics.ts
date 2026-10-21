// Client API wrapper for daily score metrics (Recovery/Sleep/Stress/Daily) plus streak helpers
import { apiGet } from "./client";

export type DailyMetric = {
  date: string;
  recovery_score: number | null;
  sleep_score: number | null;
  stress_score: number | null;
  daily_score: number | null;
  biological_age: number | null;
};

export async function getDailyMetrics(from: string, to: string): Promise<DailyMetric[]> {
  const data = await apiGet<{ metrics: DailyMetric[] }>(`/daily-metrics?from=${from}&to=${to}`);
  return data.metrics;
}

export async function getTodayMetric(): Promise<DailyMetric | null> {
  return getMetricForDate(new Date().toISOString().slice(0, 10));
}

export async function getMetricForDate(date: string): Promise<DailyMetric | null> {
  const data = await apiGet<{ metrics: DailyMetric[] }>(`/daily-metrics?date=${date}`);
  return data.metrics[0] ?? null;
}

// Shared streak window: how many days of history the Home screen and the widget load to compute
// the current streak (both therefore cap the displayed streak at this many days). Kept in one
// place so the app and the widget never disagree, and so the widget never over-fetches.
export const STREAK_LOOKBACK_DAYS = 30;

// Grace: how many missed/blank days the streak tolerates without resetting — so a single day
// the watch wasn't worn (or today, before it has synced) doesn't wipe a long run. Forgiven days
// are bridged, not counted toward the number. 1 by default; set to 0 to require a strict
// unbroken run. Two consecutive gaps still break the streak.
export const STREAK_GRACE_DAYS = 1;

/** Days ending at `date` (inclusive) with a non-null daily_score, tolerating up to
 * STREAK_GRACE_DAYS missed/blank days within the run. `metrics` should cover a range ending at
 * `date`; a forgiven gap (missing row or null score) is skipped rather than counted, and only
 * once the grace budget is spent does the next gap end the streak. */
export function computeStreak(metrics: DailyMetric[], date: string): number {
  const byDate = new Map(metrics.map((m) => [m.date, m]));
  let streak = 0;
  let grace = STREAK_GRACE_DAYS;
  const cursor = new Date(`${date}T00:00:00.000Z`);

  for (;;) {
    const key = cursor.toISOString().slice(0, 10);
    const metric = byDate.get(key);
    if (metric && metric.daily_score !== null) {
      streak += 1;
    } else if (grace > 0) {
      grace -= 1; // forgive this gap, don't count it
    } else {
      break;
    }
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  return streak;
}
