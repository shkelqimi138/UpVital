import { Router } from "express";
import { pool } from "../db";
import { requireAuth } from "../middleware/auth";

const router = Router();

// Body temperature only ever comes from HealthKit (a connected thermometer, wearable, etc.) —
// no manual-entry route. Stored in °C. Returns recent readings, most recent first.
router.get("/body-temperature", requireAuth, async (req, res) => {
  const result = await pool.query(
    `select value::float as value, start_date as date, data_source
     from raw_health_samples
     where user_id = $1 and sample_type = 'body_temperature'
     order by start_date desc
     limit 20`,
    [req.userId],
  );
  res.json({ entries: result.rows });
});

export default router;
