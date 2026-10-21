// API route for Day Strain and its hourly effort/heart-rate-zone breakdown
import { Router } from "express";
import { pool } from "../db";
import { requireAuth } from "../middleware/auth";
import { isYmd } from "../lib/validate";
import { getUserTimezone } from "../lib/timezone";
import {
  dayStrain,
  heartRateZone,
  maxHeartRate,
  STRAIN_MAX,
  STRAIN_OPTIMAL,
  ZoneMinutes,
} from "../scoring/strain";

const router = Router();

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;
/** Fallback age when the profile has no birthdate — zone boundaries need *some* max HR. */
const DEFAULT_AGE_YEARS = 35;
/** Longest span a single heart-rate reading may represent, in minutes. Keeps a sparse or
 *  interrupted sync from being scored as an hour of sustained effort. */
const SAMPLE_SPAN_CAP_MINUTES = 60;

// Day Strain plus the hourly effort breakdown, for the Activity screen's gauge and its
// "Effort through the day" bars.
router.get("/strain", requireAuth, async (req, res) => {
  const { date } = req.query;
  if (!isYmd(date)) {
    res.status(400).json({ error: "Provide ?date=YYYY-MM-DD" });
    return;
  }
  const userId = req.userId!;
  const tz = await getUserTimezone(userId);

  const [profile, samples, activity] = await Promise.all([
    pool.query(`select birthdate from profiles where id = $1`, [userId]),
    // Heart-rate samples are instantaneous — HealthKit stores discrete readings with
    // start_date == end_date, and the demo seeder does the same — so a sample's own span
    // is zero and useless. Each reading is instead taken to represent the interval until
    // the next one, capped so a long gap in syncing isn't credited as continuous effort.
    // The final reading of the day gets the same modest default.
    pool.query(
      `select bpm, hour, least(coalesce(gap_minutes, $3), $3)::float as minutes
       from (
         select value::float as bpm,
                extract(hour from start_date at time zone $4)::int as hour,
                extract(epoch from (lead(start_date) over (order by start_date) - start_date)) / 60
                  as gap_minutes
         from raw_health_samples
         where user_id = $1 and sample_type = 'heart_rate'
           and (start_date at time zone $4)::date = $2::date
       ) s
       order by hour`,
      [userId, date, SAMPLE_SPAN_CAP_MINUTES, tz],
    ),
    pool.query(
      `select sum(value) filter (where sample_type = 'active_calories')::float as calories,
              sum(value) filter (where sample_type = 'steps')::float as steps
       from raw_health_samples
       where user_id = $1 and sample_type in ('active_calories', 'steps')
         and (start_date at time zone $3)::date = $2::date`,
      [userId, date, tz],
    ),
  ]);

  const birthdate = profile.rows[0]?.birthdate as string | undefined;
  const ageYears = birthdate ? (Date.now() - new Date(birthdate).getTime()) / MS_PER_YEAR : DEFAULT_AGE_YEARS;
  const maxHr = maxHeartRate(ageYears);

  const zoneMinutes: ZoneMinutes[] = [];
  // Highest zone reached in each hour, for the effort bars.
  const hourlyZone = new Map<number, { zone: number; bpm: number }>();
  let activeMinutes = 0;

  for (const row of samples.rows) {
    const bpm = row.bpm as number;
    const minutes = row.minutes as number;
    const hour = row.hour as number;
    const zone = heartRateZone(bpm, maxHr);

    zoneMinutes.push({ zone, minutes });
    // "Active" = zone 1 and above, i.e. at or above 50% of max HR. That's roughly the
    // brisk-walk threshold Apple's exercise minutes uses; requiring zone 2 read as 0
    // active minutes on a day with a real 30-minute walk.
    if (zone >= 0) activeMinutes += minutes;

    const existing = hourlyZone.get(hour);
    if (!existing || bpm > existing.bpm) hourlyZone.set(hour, { zone, bpm });
  }

  const hourly = Array.from({ length: 24 }, (_, hour) => {
    const entry = hourlyZone.get(hour);
    return { hour, zone: entry?.zone ?? -1, bpm: entry?.bpm ?? null };
  });

  res.json({
    strain: Number(dayStrain(zoneMinutes).toFixed(1)),
    max: STRAIN_MAX,
    optimal: STRAIN_OPTIMAL,
    maxHeartRate: Math.round(maxHr),
    activeMinutes: Math.round(activeMinutes),
    calories: Math.round((activity.rows[0]?.calories as number | null) ?? 0),
    steps: Math.round((activity.rows[0]?.steps as number | null) ?? 0),
    hourly,
  });
});

export default router;
