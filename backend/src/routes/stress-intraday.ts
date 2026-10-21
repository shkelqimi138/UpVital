// API route for hourly heart-rate averages behind the Stress score
import { Router } from "express";
import { pool } from "../db";
import { baselineFromSamples, dailyAverage } from "../scoring/baseline";
import { requireAuth } from "../middleware/auth";
import { isYmd } from "../lib/validate";
import { getUserTimezone } from "../lib/timezone";

const router = Router();

// Must match backend/src/scoring/compute.ts's STRESS_HR_BASELINE_WINDOW_DAYS.
const STRESS_HR_BASELINE_WINDOW_DAYS = 30;

// Hourly heart-rate averages for a day, for the Stress detail screen's chart. This is NOT
// a live/real-time feed — it's built from whatever heart_rate samples have already synced
// for that day, refreshed on each app sync/pull-to-refresh. True instant delivery would need
// native iOS background-delivery code (same blocker as the Stage 2 HealthKit limitation).
router.get("/stress-intraday", requireAuth, async (req, res) => {
  const { date } = req.query;
  if (!isYmd(date)) {
    res.status(400).json({ error: "Provide ?date=YYYY-MM-DD" });
    return;
  }
  const userId = req.userId!;
  const tz = await getUserTimezone(userId);

  const [hourly, hrToday, hrBaseline] = await Promise.all([
    pool.query(
      `select date_trunc('hour', start_date at time zone $3) as hour, avg(value)::float as avg_heart_rate
       from raw_health_samples
       where user_id = $1 and sample_type = 'heart_rate'
         and (start_date at time zone $3)::date = $2::date
       group by hour
       order by hour`,
      [userId, date, tz],
    ),
    dailyAverage(userId, "heart_rate", date, tz),
    baselineFromSamples(userId, "heart_rate", date, STRESS_HR_BASELINE_WINDOW_DAYS, tz),
  ]);

  res.json({
    hourly: hourly.rows.map((r) => ({ hour: r.hour, avgHeartRate: r.avg_heart_rate })),
    daytimeHeartRate: { value: hrToday, baselineMean: hrBaseline?.mean ?? null },
  });
});

export default router;
