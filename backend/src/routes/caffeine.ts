// API routes to list and log caffeine entries
import { Router } from "express";
import { pool } from "../db";
import { requireAuth } from "../middleware/auth";
import { isYmd } from "../lib/validate";
import { getUserTimezone } from "../lib/timezone";

const router = Router();

// ?date=YYYY-MM-DD scopes to that day (used by the Caffeine detail screen's decay chart);
// omit for the most recent entries (used by Settings' manual-entry history).
router.get("/caffeine", requireAuth, async (req, res) => {
  const { date } = req.query;
  if (typeof date === "string" && !isYmd(date)) {
    res.status(400).json({ error: "date must be YYYY-MM-DD." });
    return;
  }
  const hasDate = typeof date === "string";
  // "That day" = the user's local calendar day (see lib/timezone).
  const tz = hasDate ? await getUserTimezone(req.userId!) : "UTC";
  const dateFilter = hasDate ? "and (start_date at time zone $3)::date = $2::date" : "";
  const params = hasDate ? [req.userId, date, tz] : [req.userId];

  const result = await pool.query(
    `select value::float as value, unit, start_date as date, data_source
     from raw_health_samples
     where user_id = $1 and sample_type = 'caffeine' ${dateFilter}
     order by start_date desc
     limit 50`,
    params,
  );
  res.json({ entries: result.rows });
});

router.post("/caffeine", requireAuth, async (req, res) => {
  const { value, date } = req.body ?? {};
  if (typeof value !== "number" || value <= 0) {
    res.status(400).json({ error: "Expected { value: number (mg), date?: ISO string }" });
    return;
  }
  const timestamp = typeof date === "string" ? date : new Date().toISOString();

  const result = await pool.query(
    `insert into raw_health_samples (user_id, data_source, sample_type, value, unit, start_date, end_date, source_uuid)
     values ($1, 'manual', 'caffeine', $2, 'mg', $3, $3, gen_random_uuid()::text)
     returning id`,
    [req.userId, value, timestamp],
  );
  res.json({ id: result.rows[0].id });
});

export default router;
