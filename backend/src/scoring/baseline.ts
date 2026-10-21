// Personal baselines (rolling daily averages) from raw samples for the score formulas
import { pool } from "../db";
import type { Baseline } from "./formulas";

const MIN_SAMPLES_FOR_BASELINE = 5;

// Day boundaries are the user's LOCAL calendar day: `(start_date at time zone $tz)::date`
// buckets each sample by the wall-clock day in the user's timezone (`profiles.timezone`,
// 'UTC' when unset), so a workout at 11pm local counts toward that local day, not the next
// UTC one. Verified against a UTC-session DB in the timezone test harness.

/** Mean/SD of a sample_type over the trailing `windowDays` (local days) ending on `date`. */
export async function baselineFromSamples(
  userId: string,
  sampleType: string,
  date: string,
  windowDays: number,
  tz: string,
): Promise<Baseline | null> {
  const result = await pool.query(
    `select avg(value)::float as mean, stddev_samp(value)::float as sd, count(*)::int as count
     from raw_health_samples
     where user_id = $1
       and sample_type = $2
       and (start_date at time zone $5)::date between $3::date - $4::int and $3::date`,
    [userId, sampleType, date, windowDays, tz],
  );
  const row = result.rows[0];
  if (!row || row.count < MIN_SAMPLES_FOR_BASELINE) return null;
  return { mean: row.mean, sd: row.sd ?? 0 };
}

export async function dailyAverage(
  userId: string,
  sampleType: string,
  date: string,
  tz: string,
): Promise<number | null> {
  const result = await pool.query(
    `select avg(value)::float as avg
     from raw_health_samples
     where user_id = $1 and sample_type = $2
       and (start_date at time zone $4)::date = $3::date`,
    [userId, sampleType, date, tz],
  );
  return result.rows[0]?.avg ?? null;
}

/** Per-day total workout minutes for each local day in [date - windowDays, date], including
 *  zero-workout days. */
export async function dailyTrainingLoadSeries(
  userId: string,
  date: string,
  windowDays: number,
  tz: string,
): Promise<Array<{ day: string; minutes: number }>> {
  const result = await pool.query(
    `select gs.day::date as day, coalesce(sum(w.duration_seconds), 0)::float / 60 as minutes
     from generate_series($2::date - $3::int, $2::date, interval '1 day') as gs(day)
     left join workouts w
       on w.user_id = $1 and (w.start_date at time zone $4)::date = gs.day::date
     group by gs.day
     order by gs.day`,
    [userId, date, windowDays, tz],
  );
  return result.rows.map((r) => ({ day: r.day as string, minutes: r.minutes }));
}

export function baselineFromDailyValues(values: number[]): Baseline | null {
  if (values.length < MIN_SAMPLES_FOR_BASELINE) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1 || 1);
  return { mean, sd: Math.sqrt(variance) };
}
