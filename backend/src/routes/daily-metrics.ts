// API route for the computed daily scores (Recovery, Sleep, Stress, Daily, bio age)
import { Router } from "express";
import { pool } from "../db";
import { requireAuth } from "../middleware/auth";
import { isYmd } from "../lib/validate";

const router = Router();

// Lets you spot-check computed scores directly (e.g. via curl) without needing the
// Stage 4 dashboard UI. ?date=YYYY-MM-DD for a single day, or ?from=&to= for a range.
router.get("/daily-metrics", requireAuth, async (req, res) => {
  const { from, to, date } = req.query;
  const start = typeof date === "string" ? date : typeof from === "string" ? from : undefined;
  const end = typeof date === "string" ? date : typeof to === "string" ? to : undefined;

  if (!start || !end) {
    res.status(400).json({ error: "Provide ?date=YYYY-MM-DD or ?from=...&to=..." });
    return;
  }
  if (!isYmd(start) || !isYmd(end)) {
    res.status(400).json({ error: "Dates must be YYYY-MM-DD." });
    return;
  }

  const result = await pool.query(
    `select date,
            recovery_score::float as recovery_score,
            sleep_score::float as sleep_score,
            stress_score::float as stress_score,
            daily_score::float as daily_score,
            biological_age::float as biological_age
     from daily_metrics
     where user_id = $1 and date >= $2 and date <= $3
     order by date`,
    [req.userId, start, end],
  );
  res.json({ metrics: result.rows });
});

export default router;
