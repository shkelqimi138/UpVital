// API route for a night's sleep stage breakdown
import { Router } from "express";
import { computeSleepMetrics } from "../scoring/sleep";
import { requireAuth } from "../middleware/auth";
import { isYmd } from "../lib/validate";
import { getUserTimezone } from "../lib/timezone";

const router = Router();

// Commonly-cited approximate stage-proportion ranges (not a clinical dataset — same "fun
// estimate" caveat as biological age). REM/Core/Deep are % of total asleep time; Awake is
// % of total time in bed (it isn't "asleep" time by definition).
const TYPICAL_RANGES = {
  awake: { minPct: 0, maxPct: 5 },
  rem: { minPct: 20, maxPct: 25 },
  core: { minPct: 45, maxPct: 55 },
  deep: { minPct: 13, maxPct: 23 },
};

function minutesRange(totalMinutes: number, range: { minPct: number; maxPct: number }) {
  return { minMinutes: (range.minPct / 100) * totalMinutes, maxMinutes: (range.maxPct / 100) * totalMinutes };
}

// Per-stage sleep breakdown (Awake/REM/Core/Deep) for the Sleep detail bottom sheet —
// /daily-metrics only exposes the single computed Sleep score.
router.get("/sleep-detail", requireAuth, async (req, res) => {
  const { date } = req.query;
  if (!isYmd(date)) {
    res.status(400).json({ error: "Provide ?date=YYYY-MM-DD" });
    return;
  }

  const tz = await getUserTimezone(req.userId!);
  const metrics = await computeSleepMetrics(req.userId!, date, tz);
  if (!metrics) {
    res.json({ sleep: null });
    return;
  }

  const { totalAsleepMinutes, totalInBedMinutes, remMinutes, coreMinutes, deepMinutes, awakeMinutes } =
    metrics;

  res.json({
    sleep: {
      sleepStart: metrics.sleepStart,
      sleepEnd: metrics.sleepEnd,
      totalAsleepMinutes,
      totalInBedMinutes,
      stages: {
        awake: {
          minutes: awakeMinutes,
          percent: totalInBedMinutes > 0 ? (awakeMinutes / totalInBedMinutes) * 100 : 0,
          typicalRange: minutesRange(totalInBedMinutes, TYPICAL_RANGES.awake),
        },
        rem: {
          minutes: remMinutes,
          percent: totalAsleepMinutes > 0 ? (remMinutes / totalAsleepMinutes) * 100 : 0,
          typicalRange: minutesRange(totalAsleepMinutes, TYPICAL_RANGES.rem),
        },
        core: {
          minutes: coreMinutes,
          percent: totalAsleepMinutes > 0 ? (coreMinutes / totalAsleepMinutes) * 100 : 0,
          typicalRange: minutesRange(totalAsleepMinutes, TYPICAL_RANGES.core),
        },
        deep: {
          minutes: deepMinutes,
          percent: totalAsleepMinutes > 0 ? (deepMinutes / totalAsleepMinutes) * 100 : 0,
          typicalRange: minutesRange(totalAsleepMinutes, TYPICAL_RANGES.deep),
        },
      },
      restorative: { deepMinutes, remMinutes, totalMinutes: deepMinutes + remMinutes },
    },
  });
});

export default router;
