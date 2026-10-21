import { Router } from "express";
import { pool } from "../db";
import { requireAuth } from "../middleware/auth";

const router = Router();

// Body fat % only ever comes from HealthKit (a smart scale, etc.) — no manual-entry route,
// unlike weight. Returns recent readings, most recent first.
router.get("/body-fat", requireAuth, async (req, res) => {
  const result = await pool.query(
    `select value::float as value, start_date as date, data_source
     from raw_health_samples
     where user_id = $1 and sample_type = 'body_fat_percentage'
     order by start_date desc
     limit 20`,
    [req.userId],
  );
  res.json({ entries: result.rows });
});

export default router;
