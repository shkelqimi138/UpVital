// API route for listing body-weight entries (GET /weight). Weight comes from Apple Health; there is
// no manual logging route (the app hasn't logged weight by hand since 2026-09-12).
import { Router } from "express";
import { pool } from "../db";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.get("/weight", requireAuth, async (req, res) => {
  const result = await pool.query(
    `select value::float as value, unit, start_date as date, data_source
     from raw_health_samples
     where user_id = $1 and sample_type = 'weight'
     order by start_date desc
     limit 20`,
    [req.userId],
  );
  res.json({ entries: result.rows });
});

export default router;
