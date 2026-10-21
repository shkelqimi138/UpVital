// API route for today's Daily Score hour by hour (Dashboard sparkline)
import { Router } from "express";
import { pool } from "../db";
import { requireAuth } from "../middleware/auth";
import { isYmd } from "../lib/validate";
import { getUserTimezone } from "../lib/timezone";
import { baselineFromDailyValues, baselineFromSamples, dailyTrainingLoadSeries } from "../scoring/baseline";
import { dailyScore, stressScore } from "../scoring/formulas";

const router = Router();

// Must match backend/src/scoring/compute.ts.
const STRESS_HR_BASELINE_WINDOW_DAYS = 30;
const TRAINING_LOAD_BASELINE_WINDOW_DAYS = 60;

// Daily Score "so far today", hour by hour — powers the Dashboard hero's sparkline.
//
// Of the three inputs, only stress actually moves during the day: recovery is derived from
// overnight HRV/resting HR and sleep is last night's, so both are fixed once the user wakes.
// Stress, though, is a function of daytime heart rate and accumulated training load, so we
// recompute it at each hour from the samples synced up to that point and re-mix the composite.
// That makes the curve a genuine "score as the day progressed", not a smoothed daily value.
//
// Like /stress-intraday this is NOT a live feed — it reflects whatever has already synced.
router.get("/daily-score-intraday", requireAuth, async (req, res) => {
  const { date } = req.query;
  if (!isYmd(date)) {
    res.status(400).json({ error: "Provide ?date=YYYY-MM-DD" });
    return;
  }
  const userId = req.userId!;
  const tz = await getUserTimezone(userId);

  const [metricRow, hrHourly, workoutHourly, hrBaseline, trainingLoadSeries] = await Promise.all([
    pool.query(`select recovery_score, sleep_score from daily_metrics where user_id = $1 and date = $2`, [
      userId,
      date,
    ]),
    pool.query(
      `select extract(hour from start_date at time zone $3)::int as hour,
              sum(value)::float as total,
              count(*)::int as samples
       from raw_health_samples
       where user_id = $1 and sample_type = 'heart_rate'
         and (start_date at time zone $3)::date = $2::date
       group by hour
       order by hour`,
      [userId, date, tz],
    ),
    pool.query(
      `select extract(hour from start_date at time zone $3)::int as hour,
              coalesce(sum(duration_seconds), 0)::float / 60 as minutes
       from workouts
       where user_id = $1
         and (start_date at time zone $3)::date = $2::date
       group by hour
       order by hour`,
      [userId, date, tz],
    ),
    baselineFromSamples(userId, "heart_rate", date, STRESS_HR_BASELINE_WINDOW_DAYS, tz),
    dailyTrainingLoadSeries(userId, date, TRAINING_LOAD_BASELINE_WINDOW_DAYS, tz),
  ]);

  const recovery = (metricRow.rows[0]?.recovery_score as number | null) ?? null;
  const sleep = (metricRow.rows[0]?.sleep_score as number | null) ?? null;
  const trainingLoadBaseline = baselineFromDailyValues(trainingLoadSeries.map((d) => d.minutes));

  const hrByHour = new Map<number, { total: number; samples: number }>();
  for (const r of hrHourly.rows) hrByHour.set(r.hour as number, { total: r.total, samples: r.samples });
  const minutesByHour = new Map<number, number>();
  for (const r of workoutHourly.rows) minutesByHour.set(r.hour as number, r.minutes);

  // Start the curve at the first hour that has any heart-rate data — before that there's
  // nothing measured, and emitting hours would draw a flat synthetic run-in.
  const hoursWithData = [...hrByHour.keys()].sort((a, b) => a - b);
  if (hoursWithData.length === 0) {
    res.json({ hourly: [] });
    return;
  }
  const firstHour = hoursWithData[0];
  const lastHour = hoursWithData[hoursWithData.length - 1];

  const hourly: Array<{ hour: number; score: number }> = [];
  let cumulativeTotal = 0;
  let cumulativeSamples = 0;
  let cumulativeMinutes = 0;

  for (let hour = 0; hour <= lastHour; hour++) {
    const hr = hrByHour.get(hour);
    if (hr) {
      cumulativeTotal += hr.total;
      cumulativeSamples += hr.samples;
    }
    cumulativeMinutes += minutesByHour.get(hour) ?? 0;
    if (hour < firstHour) continue;

    const avgHeartRate = cumulativeSamples > 0 ? cumulativeTotal / cumulativeSamples : null;
    const stress = stressScore({
      daytimeHeartRate:
        avgHeartRate !== null && hrBaseline ? { value: avgHeartRate, baseline: hrBaseline } : undefined,
      trainingLoad: trainingLoadBaseline
        ? { value: cumulativeMinutes, baseline: trainingLoadBaseline }
        : undefined,
    });

    const score = dailyScore({ recovery, sleep, stress });
    if (score !== null) hourly.push({ hour, score });
  }

  res.json({ hourly });
});

export default router;
