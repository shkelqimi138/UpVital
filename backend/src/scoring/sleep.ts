// Sleep metrics (duration, efficiency, stages) from HealthKit sleep intervals
import { pool } from "../db";
import { mergeNight, type SleepRecord } from "./sleep-merge";

const CONSISTENCY_WINDOW_DAYS = 14;
const ASLEEP_STAGES = new Set(["ASLEEP", "CORE", "DEEP", "REM"]);

export type SleepMetrics = {
  totalAsleepMinutes: number;
  totalInBedMinutes: number;
  deepPlusRemMinutes: number;
  bedtimeConsistencyStdDevMinutes: number | null;
  // Per-stage breakdown, additive — used by the Sleep detail screen, not the Sleep score
  // formula (which only needs the combined totals above).
  remMinutes: number;
  coreMinutes: number;
  deepMinutes: number;
  awakeMinutes: number;
  sleepStart: string | null;
  sleepEnd: string | null;
};

/**
 * A night's sleep doesn't align with calendar dates, so samples are bucketed into "sleep days"
 * running noon-to-noon in the USER'S LOCAL TIMEZONE — a session from 11pm to 7am falls into the
 * sleep day ending at the following local noon. Both the sleep-day label and the onset offset
 * (minutes past the bucket's starting noon, used for bedtime-consistency) are computed in SQL
 * via `(start_date at time zone $tz)`, so they track the user's wall clock rather than UTC.
 * Verified against a UTC-session DB in the timezone test harness.
 */
export async function computeSleepMetrics(
  userId: string,
  date: string,
  tz: string,
): Promise<SleepMetrics | null> {
  const result = await pool.query(
    `select
       unit as stage,
       start_date,
       end_date,
       (((start_date at time zone $4) + interval '12 hours')::date) as sleep_day,
       extract(epoch from (
         (start_date at time zone $4)
         - ((((((start_date at time zone $4) + interval '12 hours')::date) - 1)::timestamp) + interval '12 hours')
       )) / 60 as onset_minutes
     from raw_health_samples
     where user_id = $1 and sample_type = 'sleep'
       and (((start_date at time zone $4) + interval '12 hours')::date) between $2::date - $3::int and $2::date
     order by start_date`,
    [userId, date, CONSISTENCY_WINDOW_DAYS, tz],
  );

  type Bucket = {
    records: SleepRecord[];
    onsetMinutes: number | null;
    earliestStart: Date | null;
    latestEnd: Date | null;
  };
  const buckets = new Map<string, Bucket>();

  for (const row of result.rows) {
    const start: Date = row.start_date;
    const end: Date = row.end_date;
    const day: string = row.sleep_day;
    const stage: string = row.stage;
    if (stage !== "INBED" && stage !== "AWAKE" && !ASLEEP_STAGES.has(stage)) continue;

    let bucket = buckets.get(day);
    if (!bucket) {
      bucket = { records: [], onsetMinutes: null, earliestStart: null, latestEnd: null };
      buckets.set(day, bucket);
    }
    bucket.records.push({ stage, start: start.getTime(), end: end.getTime() });

    if (ASLEEP_STAGES.has(stage)) {
      const onset: number = row.onset_minutes;
      if (bucket.onsetMinutes === null || onset < bucket.onsetMinutes) bucket.onsetMinutes = onset;
    }
    if (bucket.earliestStart === null || start < bucket.earliestStart) bucket.earliestStart = start;
    if (bucket.latestEnd === null || end > bucket.latestEnd) bucket.latestEnd = end;
  }

  const today = buckets.get(date);
  if (!today) return null;
  // Overlapping records (two sleep apps, or one that rewrote its records) count once.
  const night = mergeNight(today.records);
  if (night.asleepMinutes === 0 && night.inBedMinutes === 0) return null;

  const totalInBedMinutes = night.inBedMinutes > 0 ? night.inBedMinutes : night.asleepMinutes;

  const onsetValues = [...buckets.values()].map((b) => b.onsetMinutes).filter((v): v is number => v !== null);
  let bedtimeConsistencyStdDevMinutes: number | null = null;
  if (onsetValues.length >= 3) {
    const mean = onsetValues.reduce((a, b) => a + b, 0) / onsetValues.length;
    const variance = onsetValues.reduce((a, b) => a + (b - mean) ** 2, 0) / (onsetValues.length - 1);
    bedtimeConsistencyStdDevMinutes = Math.sqrt(variance);
  }

  return {
    totalAsleepMinutes: night.asleepMinutes,
    totalInBedMinutes,
    deepPlusRemMinutes: night.deepPlusRemMinutes,
    bedtimeConsistencyStdDevMinutes,
    remMinutes: night.remMinutes,
    coreMinutes: night.coreMinutes,
    deepMinutes: night.deepMinutes,
    awakeMinutes: night.awakeMinutes,
    sleepStart: today.earliestStart?.toISOString() ?? null,
    sleepEnd: today.latestEnd?.toISOString() ?? null,
  };
}
