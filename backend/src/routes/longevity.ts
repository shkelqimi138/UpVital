import { Router } from "express";
import { pool } from "../db";
import { requireAuth } from "../middleware/auth";
import { isYmd } from "../lib/validate";
import { computePaceOfAging } from "../scoring/pace-of-aging";

const router = Router();

// Century Age card data: reuses the already-computed biological_age (no new scoring), plus
// the new Pace of Aging trend (see scoring/pace-of-aging.ts).
router.get("/longevity", requireAuth, async (req, res) => {
  const { date } = req.query;
  if (!isYmd(date)) {
    res.status(400).json({ error: "Provide ?date=YYYY-MM-DD" });
    return;
  }

  const [bioAgeResult, paceOfAging] = await Promise.all([
    pool.query(
      `select biological_age::float as biological_age from daily_metrics where user_id = $1 and date = $2`,
      [req.userId, date],
    ),
    computePaceOfAging(req.userId!, date),
  ]);

  res.json({
    biologicalAge: bioAgeResult.rows[0]?.biological_age ?? null,
    paceOfAging,
  });
});

export default router;
