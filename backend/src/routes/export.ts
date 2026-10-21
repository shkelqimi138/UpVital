// API route for exporting all of a user's data as JSON (GET /export)
import { Router } from "express";
import { pool } from "../db";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.get("/export", requireAuth, async (req, res) => {
  const userId = req.userId;
  const [profile, dailyMetrics, rawSamples, workouts, insights] = await Promise.all([
    // Every profile field, so "Export my data" really is all of it (GDPR access / portability).
    pool.query(
      `select display_name, birthdate, timezone, height_cm, weight_goal_kg::float, weight_goal_target_date,
              step_goal, sleep_goal_hours::float, active_calorie_goal, notifications_enabled,
              ai_consent, ai_consent_updated_at, insight_hour, created_at
       from profiles where id = $1`,
      [userId],
    ),
    pool.query(
      `select date, recovery_score::float, sleep_score::float, stress_score::float, daily_score::float, biological_age::float
       from daily_metrics where user_id = $1 order by date`,
      [userId],
    ),
    pool.query(
      `select data_source, sample_type, value::float, unit, start_date, end_date
       from raw_health_samples where user_id = $1 order by start_date`,
      [userId],
    ),
    pool.query(
      `select workout_type, start_date, end_date, duration_seconds::float, calories::float,
              avg_heart_rate::float, max_heart_rate::float, raw_data
       from workouts where user_id = $1 order by start_date`,
      [userId],
    ),
    pool.query(`select date, content from daily_insights where user_id = $1 order by date`, [userId]),
  ]);

  res.setHeader("Content-Disposition", 'attachment; filename="upvital-export.json"');
  res.json({
    exportedAt: new Date().toISOString(),
    profile: profile.rows[0] ?? null,
    dailyMetrics: dailyMetrics.rows,
    rawHealthSamples: rawSamples.rows,
    workouts: workouts.rows,
    dailyInsights: insights.rows,
  });
});

export default router;
