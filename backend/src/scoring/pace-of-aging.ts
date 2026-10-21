import { pool } from "../db";

// Approach approved by the user: linear-regression slope of biological_age vs. calendar
// time over a trailing window — same style of concept as DunedinPACE (1.0x = aging at the
// same rate as calendar time; <1.0x slower, >1.0x faster). Clamped to the spec's own
// tick-scale range (-1.0x to 3.0x).
const LOOKBACK_DAYS = 60;
const MIN_DATA_POINTS = 14;
const DAYS_PER_YEAR = 365.25;
const MIN_PACE = -1.0;
const MAX_PACE = 3.0;

export async function computePaceOfAging(userId: string, date: string): Promise<number | null> {
  const result = await pool.query(
    `select date, biological_age::float as biological_age
     from daily_metrics
     where user_id = $1
       and date >= $2::date - ($3 || ' days')::interval
       and date <= $2::date
       and biological_age is not null
     order by date`,
    [userId, date, LOOKBACK_DAYS],
  );

  const rows = result.rows as Array<{ date: string; biological_age: number }>;
  if (rows.length < MIN_DATA_POINTS) return null;

  const firstDateMs = new Date(`${rows[0].date}T00:00:00.000Z`).getTime();
  const points = rows.map((r) => ({
    x: (new Date(`${r.date}T00:00:00.000Z`).getTime() - firstDateMs) / (1000 * 60 * 60 * 24),
    y: r.biological_age,
  }));

  const n = points.length;
  const meanX = points.reduce((s, p) => s + p.x, 0) / n;
  const meanY = points.reduce((s, p) => s + p.y, 0) / n;
  const covXY = points.reduce((s, p) => s + (p.x - meanX) * (p.y - meanY), 0);
  const varX = points.reduce((s, p) => s + (p.x - meanX) ** 2, 0);
  if (varX === 0) return null;

  const slopePerDay = covXY / varX;
  const pace = slopePerDay * DAYS_PER_YEAR;

  return Math.max(MIN_PACE, Math.min(MAX_PACE, pace));
}
