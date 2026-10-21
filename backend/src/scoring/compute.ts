// Core scoring pipeline: computes and stores a user's daily Recovery/Sleep/Stress/Daily metrics
import { pool } from "../db";
import {
  baselineFromDailyValues,
  baselineFromSamples,
  dailyAverage,
  dailyTrainingLoadSeries,
} from "./baseline";
import {
  biologicalAge,
  dailyScore,
  recoveryScore,
  sleepScore as sleepScoreFormula,
  stressScore,
} from "./formulas";
import { computeSleepMetrics } from "./sleep";

const RECOVERY_BASELINE_WINDOW_DAYS = 60;
const STRESS_HR_BASELINE_WINDOW_DAYS = 30;
const TRAINING_LOAD_BASELINE_WINDOW_DAYS = 60;
const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

// Cap on how many of a single day's recompute queries run at once. The nine reads below are
// independent and would otherwise all hit the pool simultaneously; one day's recompute could
// then hold most of the connections, and a multi-day recompute or the ~2-year backfill keeps
// doing so back-to-back — starving live dashboard reads (the ~1-minute "no data" stall). This
// keeps a recompute to a small, fixed slice of the pool so reads always have connections free.
const RECOMPUTE_QUERY_CONCURRENCY = 4;

/** Awaits `thunks` with at most `limit` in flight at once, preserving order and each element's
 *  type. Used to bound a recompute's database-connection footprint. */
async function limitedAll<T extends readonly (() => Promise<unknown>)[]>(
  limit: number,
  thunks: readonly [...T],
): Promise<{ [K in keyof T]: Awaited<ReturnType<T[K]>> }> {
  const results = new Array(thunks.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < thunks.length) {
      const i = cursor++;
      results[i] = await thunks[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, thunks.length) }, () => worker()));
  return results as { [K in keyof T]: Awaited<ReturnType<T[K]>> };
}

export async function computeAndStoreDailyMetrics(userId: string, date: string, tz: string): Promise<void> {
  const [
    hrvToday,
    hrvBaseline,
    rhrToday,
    rhrBaseline,
    hrToday,
    hrBaseline,
    sleepMetrics,
    trainingLoadSeries,
    profile,
  ] = await limitedAll(RECOMPUTE_QUERY_CONCURRENCY, [
    () => dailyAverage(userId, "hrv", date, tz),
    () => baselineFromSamples(userId, "hrv", date, RECOVERY_BASELINE_WINDOW_DAYS, tz),
    () => dailyAverage(userId, "resting_heart_rate", date, tz),
    () => baselineFromSamples(userId, "resting_heart_rate", date, RECOVERY_BASELINE_WINDOW_DAYS, tz),
    () => dailyAverage(userId, "heart_rate", date, tz),
    () => baselineFromSamples(userId, "heart_rate", date, STRESS_HR_BASELINE_WINDOW_DAYS, tz),
    () => computeSleepMetrics(userId, date, tz),
    () => dailyTrainingLoadSeries(userId, date, TRAINING_LOAD_BASELINE_WINDOW_DAYS, tz),
    () => pool.query("select birthdate from profiles where id = $1", [userId]),
  ]);

  const sleep = sleepMetrics
    ? sleepScoreFormula({
        totalAsleepMinutes: sleepMetrics.totalAsleepMinutes,
        totalInBedMinutes: sleepMetrics.totalInBedMinutes,
        deepPlusRemMinutes: sleepMetrics.deepPlusRemMinutes,
        bedtimeConsistencyStdDevMinutes: sleepMetrics.bedtimeConsistencyStdDevMinutes ?? undefined,
      })
    : null;

  const recovery = recoveryScore({
    hrv: hrvToday !== null && hrvBaseline ? { value: hrvToday, baseline: hrvBaseline } : undefined,
    restingHeartRate:
      rhrToday !== null && rhrBaseline ? { value: rhrToday, baseline: rhrBaseline } : undefined,
    sleepScore: sleep ?? undefined,
  });

  const todayTrainingLoad = trainingLoadSeries.find((d) => d.day === date)?.minutes ?? 0;
  const trainingLoadBaseline = baselineFromDailyValues(trainingLoadSeries.map((d) => d.minutes));

  const stress = stressScore({
    daytimeHeartRate: hrToday !== null && hrBaseline ? { value: hrToday, baseline: hrBaseline } : undefined,
    trainingLoad: trainingLoadBaseline
      ? { value: todayTrainingLoad, baseline: trainingLoadBaseline }
      : undefined,
  });

  const daily = dailyScore({ recovery, sleep, stress });

  let bioAge: number | null = null;
  const birthdate = profile.rows[0]?.birthdate as string | undefined;
  if (birthdate && hrvBaseline) {
    // Age as of the metric's own date, not "now" — otherwise rows computed on
    // different days aren't comparable and a false slope leaks into pace-of-aging.
    const actualAge = (new Date(date).getTime() - new Date(birthdate).getTime()) / MS_PER_YEAR;
    bioAge = biologicalAge(actualAge, hrvBaseline.mean);
  }

  if (recovery === null && sleep === null && stress === null && daily === null) return;

  await pool.query(
    `insert into daily_metrics (user_id, date, recovery_score, sleep_score, stress_score, daily_score, biological_age)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (user_id, date) do update set
       recovery_score = excluded.recovery_score,
       sleep_score = excluded.sleep_score,
       stress_score = excluded.stress_score,
       daily_score = excluded.daily_score,
       biological_age = excluded.biological_age`,
    [userId, date, recovery, sleep, stress, daily, bioAge],
  );
}
