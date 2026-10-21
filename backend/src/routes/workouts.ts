import { Router } from "express";
import { pool } from "../db";
import { requireAuth } from "../middleware/auth";
import { isYmd } from "../lib/validate";
import { getUserTimezone } from "../lib/timezone";

const router = Router();

// Single list endpoint carries everything a detail screen needs (including the
// full HealthKit raw_data payload) — avoids a separate per-workout round trip.
// ?date=YYYY-MM-DD scopes to workouts starting that day (used by the Dashboard's
// Activities section); omit for the full history (used by the Workouts tab).
router.get("/workouts", requireAuth, async (req, res) => {
  const { date } = req.query;
  if (typeof date === "string" && !isYmd(date)) {
    res.status(400).json({ error: "date must be YYYY-MM-DD." });
    return;
  }
  const hasDate = typeof date === "string";
  // Scope "that day" to the user's local calendar day (see lib/timezone) so a late-evening
  // workout lands on the day they'd expect, matching the Dashboard's scores.
  const tz = hasDate ? await getUserTimezone(req.userId!) : "UTC";
  const dateFilter = hasDate ? "and (start_date at time zone $3)::date = $2::date" : "";
  const params = hasDate ? [req.userId, date, tz] : [req.userId];

  const result = await pool.query(
    `select id, workout_type, start_date, end_date,
            duration_seconds::float as duration_seconds,
            calories::float as calories,
            avg_heart_rate::float as avg_heart_rate,
            max_heart_rate::float as max_heart_rate,
            raw_data
     from workouts
     where user_id = $1 ${dateFilter}
     order by start_date desc`,
    params,
  );
  res.json({ workouts: result.rows });
});

export default router;
