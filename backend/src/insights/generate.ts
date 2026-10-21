// Generates the daily AI insight with Claude from the day's scores and stores it
import Anthropic from "@anthropic-ai/sdk";
import { pool } from "../db";

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error("ANTHROPIC_API_KEY is not set");
}

const anthropic = new Anthropic();

const SYSTEM_PROMPT =
  "You write a single daily health insight for a fitness app user, based on their computed " +
  "Recovery, Sleep, Stress, and Daily Score (0-100 scales, higher is always better on every " +
  "scale, including Stress). Sleep and Recovery are from last night and this morning; Stress and " +
  "the Daily Score are from yesterday, the last full day — say which is which, and never call " +
  "yesterday's numbers today's. If a score is not available, leave it out rather than pointing " +
  "that out. Tone: straightforward and factual — not motivational/coach-speak, " +
  "not clinical. Length: a short paragraph (3-5 sentences). Reference the specific numbers " +
  "you're given. Do not invent data you weren't given. Do not give medical advice.";

/** Generates and stores the daily insight for a user's day: that day's Sleep and Recovery (last
 *  night, this morning) plus the day before's Stress and Daily Score (the last full day). It's
 *  saved under `date`, the day the app shows it on. Returns null if neither day has scores yet,
 *  the user hasn't switched on AI insights, or Claude declined to respond. */
export async function generateAndStoreInsight(userId: string, date: string): Promise<string | null> {
  // The join re-checks AI consent here too, so no caller can send a user's scores to Anthropic
  // without it.
  const metricsRes = await pool.query(
    `select m.date::text as date, m.recovery_score, m.sleep_score, m.stress_score, m.daily_score,
            m.biological_age
     from daily_metrics m join profiles p on p.id = m.user_id and p.ai_consent
     where m.user_id = $1 and m.date in ($2::date, $2::date - 1)`,
    [userId, date],
  );
  const today = metricsRes.rows.find((r) => r.date === date);
  const yesterday = metricsRes.rows.find((r) => r.date !== date);
  if (!today && !yesterday) return null;

  const previousDate = new Date(Date.parse(`${date}T00:00:00Z`) - 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  // Rounded to whole numbers: the app displays rounded scores, so passing the raw floats
  // had the insight quoting "50.6" and "78.8" directly under a dashboard reading 51 and 79.
  const score = (v: number | null | undefined) => (v == null ? "not available" : Math.round(v).toString());
  const bioAge = today?.biological_age ?? yesterday?.biological_age;

  const userMessage = `Last night and this morning (${date}):
- Sleep: ${score(today?.sleep_score)}
- Recovery: ${score(today?.recovery_score)}

Yesterday (${previousDate}), the last full day:
- Stress: ${score(yesterday?.stress_score)}
- Daily Score: ${score(yesterday?.daily_score)}
${bioAge ? `- Biological age estimate: ${Math.round(bioAge)}` : ""}

All scores are 0-100, higher is always better. Write today's insight.`;

  // Haiku, the cheapest current model ($1/$5 per MTok): the input is five numbers and
  // the output is a few sentences of constrained prose — no reasoning, no tools, no long
  // context. Nothing here needs a larger model.
  //
  // Deliberately NO `thinking` and NO `output_config` here. Haiku 4.5 predates both of
  // the newer knobs: `effort` is rejected outright, and omitting `thinking` already means
  // no thinking (only the newer models default it on). Adding either would break the call
  // rather than tune it.
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 400,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  if (response.stop_reason === "refusal") {
    return null;
  }

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  const insight = textBlock?.text?.trim();
  if (!insight) return null;

  await pool.query(
    `insert into daily_insights (user_id, date, content) values ($1, $2, $3)
     on conflict (user_id, date) do update set content = excluded.content`,
    [userId, date, insight],
  );

  return insight;
}
