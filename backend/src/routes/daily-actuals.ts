import { Router } from "express";
import { pool } from "../db";
import { requireAuth } from "../middleware/auth";
import { isYmd } from "../lib/validate";
import { getUserTimezone } from "../lib/timezone";
import { computeSleepMetrics } from "../scoring/sleep";

const router = Router();

// Raw step/sleep totals for a single day, separate from /daily-metrics (which only
// carries computed scores) — used to show "actual vs goal" progress on the Dashboard.
// Days are the user's LOCAL calendar day (see lib/timezone) so this matches the scores.
router.get("/daily-actuals", requireAuth, async (req, res) => {
  const { date } = req.query;
  if (!isYmd(date)) {
    res.status(400).json({ error: "Provide ?date=YYYY-MM-DD" });
    return;
  }

  const tz = await getUserTimezone(req.userId!);
  const [stepsResult, activeCaloriesResult, sleep] = await Promise.all([
    pool.query(
      `select coalesce(sum(value::float), 0) as steps
       from raw_health_samples
       where user_id = $1 and sample_type = 'steps'
         and (start_date at time zone $3)::date = $2::date`,
      [req.userId, date, tz],
    ),
    pool.query(
      `select coalesce(sum(value::float), 0) as active_calories
       from raw_health_samples
       where user_id = $1 and sample_type = 'active_calories'
         and (start_date at time zone $3)::date = $2::date`,
      [req.userId, date, tz],
    ),
    computeSleepMetrics(req.userId!, date, tz),
  ]);

  res.json({
    steps: Math.round(stepsResult.rows[0].steps),
    activeCalories: Math.round(activeCaloriesResult.rows[0].active_calories),
    sleepHours: sleep ? sleep.totalAsleepMinutes / 60 : null,
  });
});

export default router;
