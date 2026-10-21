import { Router } from "express";
import { pool } from "../db";
import { requireAuth } from "../middleware/auth";
import { isYmd } from "../lib/validate";
import { getUserTimezone } from "../lib/timezone";

const router = Router();

// Cumulative active calories and steps, hour by hour — powers the Dashboard hero's
// sparkline.
//
// The hero originally plotted the intraday Daily Score, but that composite is 75% recovery
// + sleep, both of which are fixed once the user wakes; only the stress quarter moves, so
// the curve could only ever wobble a few points. Autoscaling that renders a 3-point drift
// as a dramatic swoosh, which is misleading. Cumulative activity genuinely climbs through
// the day, so the rising shape (and the 00:00 -> Now axis) is honest.
// /daily-score-intraday is still available for a "how your score moved" view.
router.get("/activity-intraday", requireAuth, async (req, res) => {
  const { date } = req.query;
  if (!isYmd(date)) {
    res.status(400).json({ error: "Provide ?date=YYYY-MM-DD" });
    return;
  }
  const userId = req.userId!;
  const tz = await getUserTimezone(userId);

  // Both metrics are cumulative counters, so hourly totals are summed (not averaged). Hours and
  // the day boundary are the user's local wall clock (see lib/timezone).
  const result = await pool.query(
    `select extract(hour from start_date at time zone $3)::int as hour,
            sum(value) filter (where sample_type = 'active_calories')::float as calories,
            sum(value) filter (where sample_type = 'steps')::float as steps
     from raw_health_samples
     where user_id = $1
       and sample_type in ('active_calories', 'steps')
       and (start_date at time zone $3)::date = $2::date
     group by hour
     order by hour`,
    [userId, date, tz],
  );

  const hourly: Array<{ hour: number; calories: number; steps: number }> = [];
  let cumulativeCalories = 0;
  let cumulativeSteps = 0;
  for (const row of result.rows) {
    cumulativeCalories += (row.calories as number | null) ?? 0;
    cumulativeSteps += (row.steps as number | null) ?? 0;
    hourly.push({
      hour: row.hour as number,
      calories: Math.round(cumulativeCalories),
      steps: Math.round(cumulativeSteps),
    });
  }

  res.json({ hourly });
});

export default router;
