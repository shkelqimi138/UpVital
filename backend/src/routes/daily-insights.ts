// API route for a day's AI insight (or the most recent one)
import { Router } from "express";
import { pool } from "../db";
import { requireAuth } from "../middleware/auth";
import { isYmd } from "../lib/validate";

const router = Router();

// ?date=YYYY-MM-DD for a specific day, or omit for the most recent insight.
router.get("/daily-insights", requireAuth, async (req, res) => {
  const { date } = req.query;
  if (typeof date === "string" && !isYmd(date)) {
    res.status(400).json({ error: "date must be YYYY-MM-DD." });
    return;
  }

  if (typeof date === "string") {
    const result = await pool.query(
      `select date, content, created_at from daily_insights where user_id = $1 and date = $2`,
      [req.userId, date],
    );
    res.json({ insight: result.rows[0] ?? null });
    return;
  }

  const result = await pool.query(
    `select date, content, created_at from daily_insights where user_id = $1 order by date desc limit 1`,
    [req.userId],
  );
  res.json({ insight: result.rows[0] ?? null });
});

export default router;
