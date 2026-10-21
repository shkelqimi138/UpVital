import "dotenv/config";
import { pool } from "../src/db";
import { computeForDateRange } from "../src/scoring";

// One-off: populate a demo/review account with 90 days of realistic health data + computed
// scores, so an App Store reviewer sees a fully populated app (their test device has no
// Apple Health history). Idempotent-ish: source_uuids are stable per (type, index), so
// re-running upserts rather than duplicating. Usage: npx tsx scripts/seed-demo-user.ts [userId]
const userIdArg = process.argv[2] || process.env.DEMO_USER_ID;
if (!userIdArg) {
  console.error("Usage: npx tsx scripts/seed-demo-user.ts <userId>   (or set DEMO_USER_ID)");
  process.exit(1);
}
const USER_ID: string = userIdArg;
const DAYS = 90;

type SampleRow = [type: string, value: number, unit: string, start: string, end: string, uuid: string];
type WorkoutRow = [
  type: string,
  start: string,
  end: string,
  durSec: number,
  cal: number,
  avgHr: number,
  uuid: string,
];

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;
const noise = (amp: number) => (Math.random() * 2 - 1) * amp;

function dayStart(offset: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - offset);
  return d;
}
function at(offset: number, h: number, m = 0): Date {
  const d = dayStart(offset);
  d.setUTCHours(h, m, 0, 0);
  return d;
}
const iso = (d: Date) => d.toISOString();

async function insertSamples(rows: SampleRow[]) {
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const params: unknown[] = [];
    const tuples = batch.map((row) => {
      const b = params.length;
      params.push(USER_ID, row[0], row[1], row[2], row[3], row[4], row[5]);
      return `($${b + 1}, 'healthkit', $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7})`;
    });
    await pool.query(
      `insert into raw_health_samples (user_id, data_source, sample_type, value, unit, start_date, end_date, source_uuid)
       values ${tuples.join(", ")}
       on conflict (user_id, data_source, source_uuid) do update set value = excluded.value, unit = excluded.unit,
         start_date = excluded.start_date, end_date = excluded.end_date`,
      params,
    );
  }
}

async function insertWorkouts(rows: WorkoutRow[]) {
  for (const w of rows) {
    await pool.query(
      `insert into workouts (user_id, data_source, workout_type, start_date, end_date, duration_seconds, calories, avg_heart_rate, source_uuid)
       values ($1, 'healthkit', $2, $3, $4, $5, $6, $7, $8)
       on conflict (user_id, data_source, source_uuid) do update set calories = excluded.calories`,
      [USER_ID, w[0], w[1], w[2], w[3], w[4], w[5], w[6]],
    );
  }
}

async function main() {
  await pool.query(
    `insert into profiles (id, birthdate, display_name, step_goal, sleep_goal_hours, timezone, notifications_enabled)
     values ($1, '1996-05-10', 'Jack Rivera', 10000, 8, 'UTC', true)
     on conflict (id) do update set birthdate = excluded.birthdate, display_name = excluded.display_name,
       step_goal = excluded.step_goal, sleep_goal_hours = excluded.sleep_goal_hours`,
    [USER_ID],
  );

  // Clean slate first: sample source_uuids are index-based and shift whenever the generator
  // changes, so an upsert-only re-run would leave stale rows behind (doubling steps/sleep/etc).
  await pool.query("delete from raw_health_samples where user_id = $1", [USER_ID]);
  await pool.query("delete from workouts where user_id = $1", [USER_ID]);

  const rows: SampleRow[] = [];
  let n = 0;
  const uuid = (t: string) => `demo-${t}-${n++}`;

  // Workouts (including one TODAY) — each drives a block of elevated heart rate below, so the
  // Activity "Day Strain" gauge + "effort through the day" bars are populated instead of empty.
  const workoutDefs = [
    { off: 0, type: "running", mins: 38, cal: 360, avgHr: 150, startHour: 7 },
    { off: 2, type: "running", mins: 42, cal: 410, avgHr: 152, startHour: 18 },
    { off: 4, type: "traditionalStrengthTraining", mins: 50, cal: 300, avgHr: 120, startHour: 18 },
    { off: 6, type: "running", mins: 35, cal: 340, avgHr: 149, startHour: 18 },
    { off: 9, type: "cycling", mins: 60, cal: 520, avgHr: 138, startHour: 18 },
  ];
  const workoutByOffset = new Map(workoutDefs.map((w) => [w.off, w]));

  for (let d = DAYS; d >= 0; d--) {
    const trend = (DAYS - d) / DAYS; // 0 → 1 (gentle improvement over time)

    // Recovery inputs: HRV rising, resting HR falling.
    rows.push(["hrv", r1(44 + 8 * trend + noise(4)), "ms", iso(at(d, 5, 0)), iso(at(d, 5, 1)), uuid("hrv")]);
    rows.push([
      "resting_heart_rate",
      r1(58 - 4 * trend + noise(2)),
      "bpm",
      iso(at(d, 5, 2)),
      iso(at(d, 5, 3)),
      uuid("rhr"),
    ]);

    // Heart rate across the day: hourly resting-ish readings (stress baseline + effort bars),
    // plus a dense elevated block during any workout (what actually fills the strain gauge).
    for (let h = 6; h <= 22; h++) {
      const base = 68 + 8 * Math.sin(((h - 6) / 16) * Math.PI) + noise(4);
      rows.push(["heart_rate", r1(base), "bpm", iso(at(d, h, 0)), iso(at(d, h, 1)), uuid("hr")]);
    }
    const wo = workoutByOffset.get(d);
    if (wo) {
      const nSteps = Math.floor(wo.mins / 5);
      for (let i = 0; i < nSteps; i++) {
        const frac = nSteps > 1 ? i / (nSteps - 1) : 0;
        const hr = wo.avgHr + 12 * Math.sin(frac * Math.PI) + noise(6); // ramp → peak → ease
        rows.push([
          "heart_rate",
          r1(hr),
          "bpm",
          iso(at(d, wo.startHour, i * 5 + 2)),
          iso(at(d, wo.startHour, i * 5 + 3)),
          uuid("hr"),
        ]);
      }
    }

    // Steps (~8000/day across 6 samples) and active calories (~520/day across 5).
    const steps = 8000 + noise(2500);
    for (let i = 0; i < 6; i++) {
      rows.push([
        "steps",
        Math.max(0, Math.round(steps / 6 + noise(300))),
        "count",
        iso(at(d, 9 + i * 2, 0)),
        iso(at(d, 9 + i * 2, 30)),
        uuid("steps"),
      ]);
    }
    const cal = 520 + noise(150);
    for (let i = 0; i < 5; i++) {
      rows.push([
        "active_calories",
        Math.max(0, Math.round(cal / 5 + noise(30))),
        "kcal",
        iso(at(d, 10 + i * 2, 0)),
        iso(at(d, 10 + i * 2, 30)),
        uuid("cal"),
      ]);
    }

    // Sleep: early-morning stage segments (~6.5 h asleep) + an INBED wrapper.
    let cur = at(d, 0, 20);
    const bedStart = new Date(cur);
    const plan: [string, number][] = [
      ["CORE", 95 + noise(15)],
      ["DEEP", 60 + noise(12)],
      ["REM", 55 + noise(10)],
      ["CORE", 85 + noise(15)],
      ["AWAKE", 8 + noise(4)],
      ["REM", 40 + noise(10)],
      ["CORE", 35 + noise(10)],
    ];
    for (const [stage, dur] of plan) {
      const start = new Date(cur);
      const end = new Date(cur.getTime() + dur * 60000);
      rows.push(["sleep", r1(dur), stage, iso(start), iso(end), uuid("sleep")]);
      cur = end;
    }
    rows.push([
      "sleep",
      r1((cur.getTime() - bedStart.getTime()) / 60000),
      "INBED",
      iso(bedStart),
      iso(cur),
      uuid("inbed"),
    ]);

    if (d % 7 === 0)
      rows.push([
        "body_fat_percentage",
        r2(0.18 + noise(0.01)),
        "percent",
        iso(at(d, 7, 0)),
        iso(at(d, 7, 1)),
        uuid("bf"),
      ]);
    if (d % 5 === 0)
      rows.push([
        "weight",
        Math.round(75000 + noise(600)),
        "gram",
        iso(at(d, 7, 5)),
        iso(at(d, 7, 6)),
        uuid("wt"),
      ]);

    // Blood oxygen (%) + body temperature (°C) — the app shows the most recent reading.
    rows.push([
      "oxygen_saturation",
      96 + Math.round(Math.random() * 3),
      "percent",
      iso(at(d, 6, 40)),
      iso(at(d, 6, 41)),
      uuid("spo2"),
    ]);
    rows.push([
      "body_temperature",
      r1(36.6 + noise(0.3)),
      "degC",
      iso(at(d, 6, 42)),
      iso(at(d, 6, 43)),
      uuid("temp"),
    ]);
  }

  const workouts: WorkoutRow[] = workoutDefs.map((w, i) => {
    const s = at(w.off, w.startHour, 0);
    const e = new Date(s.getTime() + w.mins * 60000);
    return [w.type, iso(s), iso(e), w.mins * 60, w.cal, w.avgHr, `demo-workout-${i}`];
  });

  await insertSamples(rows);
  await insertWorkouts(workouts);

  const from = dayStart(DAYS).toISOString().slice(0, 10);
  const to = dayStart(0).toISOString().slice(0, 10);
  await computeForDateRange(USER_ID, from, to);

  const dm = await pool.query("select count(*)::int c from daily_metrics where user_id = $1", [USER_ID]);
  const latest = await pool.query(
    "select date, recovery_score, sleep_score, stress_score, daily_score from daily_metrics where user_id = $1 order by date desc limit 3",
    [USER_ID],
  );
  console.log(`Seeded ${rows.length} samples + ${workouts.length} workouts.`);
  console.log(`daily_metrics rows computed: ${dm.rows[0].c}`);
  console.log("Latest 3 days:", JSON.stringify(latest.rows));
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
