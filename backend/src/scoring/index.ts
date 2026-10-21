// Scoring entry point: recomputes daily scores for a user over a date range
import { pool } from "../db";
import { computeAndStoreDailyMetrics } from "./compute";

export { computeAndStoreDailyMetrics };

/**
 * Recomputes daily_metrics for every LOCAL day in [startDate, endDate] that has any raw data.
 * Days are bucketed by the user's timezone (`profiles.timezone`, 'UTC' when unset). The candidate
 * window is widened by a day on each side before bucketing, because `startDate`/`endDate` come in
 * as the samples' UTC dates — a sample near local midnight can belong to the adjacent local day,
 * and re-touching an adjacent day is harmless (the upsert is idempotent). Runs sequentially, one
 * date at a time — fine for incremental syncs; a large historical import takes a while since each
 * date issues its own set of baseline/aggregate queries.
 */
export async function computeForDateRange(userId: string, startDate: string, endDate: string): Promise<void> {
  const tzResult = await pool.query(`select timezone from profiles where id = $1`, [userId]);
  const tz: string = tzResult.rows[0]?.timezone ?? "UTC";

  const result = await pool.query(
    `select distinct (date_trunc('day', start_date at time zone $4))::date as day
       from raw_health_samples
       where user_id = $1 and start_date >= $2::date - 1 and start_date < $3::date + 2
     union
     select distinct (date_trunc('day', start_date at time zone $4))::date as day
       from workouts
       where user_id = $1 and start_date >= $2::date - 1 and start_date < $3::date + 2
     order by day`,
    [userId, startDate, endDate, tz],
  );

  for (const row of result.rows) {
    await computeAndStoreDailyMetrics(userId, row.day as string, tz);
  }
}
