// API route for the HRV and resting-heart-rate values behind the Recovery score
import { Router } from "express";
import { pool } from "../db";
import { baselineFromSamples, dailyAverage } from "../scoring/baseline";
import { requireAuth } from "../middleware/auth";
import { isYmd } from "../lib/validate";
import { getUserTimezone } from "../lib/timezone";

const router = Router();

// Must match backend/src/scoring/compute.ts's RECOVERY_BASELINE_WINDOW_DAYS.
const RECOVERY_BASELINE_WINDOW_DAYS = 60;
/** Days of history returned as `series`, for the Health Overview tiles' sparklines. */
const SERIES_DAYS = 7;

/** Daily averages for a sample type over the trailing `SERIES_DAYS`, oldest first.
 *  Days with no samples are skipped rather than zero-filled — a zero would render as a
 *  cliff in the sparkline and read as a real measurement of zero. */
async function dailySeries(userId: string, sampleType: string, date: string, tz: string): Promise<number[]> {
  const result = await pool.query(
    `select avg(value)::float as avg
     from raw_health_samples
     where user_id = $1 and sample_type = $2
       and (start_date at time zone $5)::date between $3::date - $4::int and $3::date
     group by (start_date at time zone $5)::date
     order by (start_date at time zone $5)::date`,
    [userId, sampleType, date, SERIES_DAYS - 1, tz],
  );
  return result.rows.map((r) => r.avg as number).filter((v) => v !== null);
}

function previousDate(date: string): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Raw HRV/resting-HR values behind the Recovery score, for the detail bottom sheet's
// metric row — /daily-metrics only exposes the computed score.
router.get("/recovery-detail", requireAuth, async (req, res) => {
  const { date } = req.query;
  if (!isYmd(date)) {
    res.status(400).json({ error: "Provide ?date=YYYY-MM-DD" });
    return;
  }
  const userId = req.userId!;
  const prev = previousDate(date);
  const tz = await getUserTimezone(userId);

  const [hrvToday, hrvYesterday, hrvBaseline, rhrToday, rhrBaseline, hrvSeries, rhrSeries] =
    await Promise.all([
      dailyAverage(userId, "hrv", date, tz),
      dailyAverage(userId, "hrv", prev, tz),
      baselineFromSamples(userId, "hrv", date, RECOVERY_BASELINE_WINDOW_DAYS, tz),
      dailyAverage(userId, "resting_heart_rate", date, tz),
      baselineFromSamples(userId, "resting_heart_rate", date, RECOVERY_BASELINE_WINDOW_DAYS, tz),
      dailySeries(userId, "hrv", date, tz),
      dailySeries(userId, "resting_heart_rate", date, tz),
    ]);

  res.json({
    hrv: {
      value: hrvToday,
      previousValue: hrvYesterday,
      baselineMean: hrvBaseline?.mean ?? null,
      series: hrvSeries,
    },
    restingHeartRate: {
      value: rhrToday,
      baselineMean: rhrBaseline?.mean ?? null,
      series: rhrSeries,
    },
  });
});

export default router;
