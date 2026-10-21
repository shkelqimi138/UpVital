// AI coach: builds the user's health context and gets Claude's chat reply
import Anthropic from "@anthropic-ai/sdk";
import { pool } from "../db";
import { getUserTimezone } from "../lib/timezone";
import { computeSleepMetrics } from "../scoring/sleep";

// Unlike insights/generate.ts (a batch script that may hard-fail if the key is missing),
// the coach runs inside the always-on server. So the client is created lazily and the route
// degrades to a 503 when unconfigured, rather than throwing at import and taking the server
// down. `coachConfigured()` lets the route return that clean state.
const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

export function coachConfigured(): boolean {
  return anthropic !== null;
}

const SYSTEM_PROMPT =
  "You are Upvital's AI coach. Advise the user on training, sleep, recovery, and stress using " +
  "ONLY their own data provided below: daily scores (Recovery, Sleep, Stress, Daily Score — all " +
  "0-100, higher is always better, including Stress where higher means calmer), their recent " +
  "workouts and activity, and their 7-day trends. Ground every answer in these specific numbers " +
  "and in what they actually did — reference their real workouts, steps, sleep and how their " +
  "scores are trending. Never invent data; if something needed isn't in the data, say so plainly. " +
  "Be direct, specific and practical: concrete guidance tied to their numbers. No motivational " +
  "filler, no pep-talk, no clichés, no clinical language — skip generic encouragement entirely. " +
  "Keep replies to a few sentences unless the user asks for more. Never give medical advice; for " +
  "anything health-concerning, suggest seeing a professional. You only advise — you cannot change " +
  "settings or log data.";

export type CoachMessage = { role: "user" | "assistant"; content: string };

const num = (v: number | null | undefined): string => (v == null ? "n/a" : Math.round(Number(v)).toString());

function ageFrom(birthdate: string | null): string {
  if (!birthdate) return "unknown";
  const b = new Date(birthdate);
  const now = new Date();
  let age = now.getUTCFullYear() - b.getUTCFullYear();
  const m = now.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < b.getUTCDate())) age -= 1;
  return age >= 0 && age < 130 ? age.toString() : "unknown";
}

/** Grounds the coach in the user's real data: profile + goals, the target day's scores, activity,
 *  recovery inputs and (approx) sleep, the last 7 days of scores, and recent workouts — so replies
 *  reflect what the user actually did rather than only today's four numbers. */
async function coachContext(userId: string, date: string): Promise<string> {
  // Days/windows below are the user's local calendar day (see lib/timezone); daily_metrics.date
  // is already stored as the local day, so the scores query needs no conversion.
  const tz = await getUserTimezone(userId);
  const [profileR, scoresR, workoutsR, dayR, sleepR] = await Promise.all([
    // No name: the coach doesn't need it, so it isn't sent to Anthropic.
    pool.query(`select birthdate, step_goal, sleep_goal_hours from profiles where id = $1`, [userId]),
    pool.query(
      `select date, recovery_score, sleep_score, stress_score, daily_score, biological_age
       from daily_metrics
       where user_id = $1 and date > $2::date - interval '7 days' and date <= $2::date
       order by date`,
      [userId, date],
    ),
    pool.query(
      `select workout_type, start_date, duration_seconds, calories, avg_heart_rate
       from workouts
       where user_id = $1 and (start_date at time zone $3)::date between $2::date - 7 and $2::date
       order by start_date desc limit 12`,
      [userId, date, tz],
    ),
    pool.query(
      `select
         coalesce(sum(value) filter (where sample_type = 'steps'), 0) as steps,
         coalesce(sum(value) filter (where sample_type = 'active_calories'), 0) as active_calories,
         avg(value) filter (where sample_type = 'resting_heart_rate') as resting_hr,
         avg(value) filter (where sample_type = 'hrv') as hrv
       from raw_health_samples
       where user_id = $1 and (start_date at time zone $3)::date = $2::date`,
      [userId, date, tz],
    ),
    // The same night totals as the Sleep score, so overlapping records count once.
    computeSleepMetrics(userId, date, tz),
  ]);

  const p = profileR.rows[0] ?? {};
  const scores = scoresR.rows;
  const today = scores.find((r) => String(r.date).slice(0, 10) === date);
  const day = dayR.rows[0] ?? {};
  const lines: string[] = [];

  const goals = [
    p.step_goal ? `${p.step_goal} steps/day` : null,
    p.sleep_goal_hours ? `${p.sleep_goal_hours} h sleep/night` : null,
  ].filter(Boolean);
  lines.push(
    `User: age ${ageFrom(p.birthdate ?? null)}.` + (goals.length ? ` Goals: ${goals.join(", ")}.` : ""),
  );

  lines.push("", `Selected day (${date}):`);
  if (today) {
    lines.push(
      `- Scores (0-100, higher better): Recovery ${num(today.recovery_score)}, Sleep ${num(today.sleep_score)}, Stress ${num(today.stress_score)}, Daily ${num(today.daily_score)}` +
        (today.biological_age != null ? `; biological age ~${num(today.biological_age)}` : ""),
    );
  } else {
    lines.push("- Scores: not computed yet for this day.");
  }
  lines.push(
    `- Activity: ${num(day.steps)} steps${p.step_goal ? ` (goal ${p.step_goal})` : ""}, ${num(day.active_calories)} kcal active`,
  );
  lines.push(`- Recovery inputs: resting HR ${num(day.resting_hr)} bpm, HRV ${num(day.hrv)} ms`);
  if (sleepR && sleepR.totalAsleepMinutes > 0) {
    lines.push(
      `- Sleep (approx.): ~${(sleepR.totalAsleepMinutes / 60).toFixed(1)} h asleep (deep ${num(sleepR.deepMinutes)} min, REM ${num(sleepR.remMinutes)} min)` +
        (p.sleep_goal_hours ? `, goal ${p.sleep_goal_hours} h` : ""),
    );
  }

  if (scores.length) {
    lines.push("", "Last 7 days (date: Daily/Recovery/Sleep/Stress):");
    for (const r of scores) {
      lines.push(
        `- ${String(r.date).slice(0, 10)}: ${num(r.daily_score)}/${num(r.recovery_score)}/${num(r.sleep_score)}/${num(r.stress_score)}`,
      );
    }
  }

  lines.push("", "Recent workouts (last 7 days):");
  if (workoutsR.rows.length) {
    for (const w of workoutsR.rows) {
      const mins = w.duration_seconds ? Math.round(Number(w.duration_seconds) / 60) : null;
      lines.push(
        `- ${String(w.start_date).slice(0, 10)} ${w.workout_type}` +
          (mins ? `, ${mins} min` : "") +
          (w.calories ? `, ${Math.round(Number(w.calories))} kcal` : "") +
          (w.avg_heart_rate ? `, avg HR ${Math.round(Number(w.avg_heart_rate))}` : ""),
      );
    }
  } else {
    lines.push("- none logged in the last 7 days");
  }

  return lines.join("\n");
}

/** Runs one coach turn. Returns null on a Claude refusal or empty response. Throws only on a
 *  genuine API/network error (the route maps that to a 502). */
export async function coachReply(
  userId: string,
  date: string,
  messages: CoachMessage[],
): Promise<string | null> {
  if (!anthropic) throw new Error("Coach is not configured");

  const context = await coachContext(userId, date);

  const response = await anthropic.messages.create({
    // Same model choice as the daily insight: cheap, and this is short grounded Q&A.
    model: "claude-haiku-4-5",
    max_tokens: 500,
    system: `${SYSTEM_PROMPT}\n\n${context}`,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });

  if (response.stop_reason === "refusal") return null;
  const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text?.trim();
  return text || null;
}
