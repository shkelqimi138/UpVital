import "dotenv/config";
import { pool } from "../db";
import { generateAndStoreInsight } from "./generate";
import { sendPushToUser } from "../push";
import { MAX_WAIT_HOURS, hoursIntoInsightWindow, insightDate, localHour, pushBody } from "./delivery";

// Runs hourly, in-process: src/index.ts schedules it with node-cron when RUN_INSIGHTS_CRON=true.
// It can also be run once by hand: `npx tsx src/insights/hourly-job.ts`. Each user picks the
// hour (their local time) for the daily insight; per-user timezone makes it their hour, not
// UTC's. From that hour the job waits up to MAX_WAIT_HOURS for last night's sleep to reach us
// (apps like Fitbit write it to Apple Health hours after waking), then writes the day's
// insight (if not already done) and pushes it. Still no sleep at the last try: it's written
// from what there is, so people who don't track sleep get one too.
export async function runHourlyInsightsCheck(): Promise<void> {
  const now = new Date();
  // Only users who switched on AI insights & Coach: the insight is written by Anthropic.
  const profiles = await pool.query(
    `select id, timezone, notifications_enabled, insight_hour from profiles where ai_consent`,
  );

  for (const profile of profiles.rows) {
    const hoursIn = hoursIntoInsightWindow(profile.insight_hour, localHour(profile.timezone, now));
    if (hoursIn === null) continue;

    const date = insightDate(profile.timezone, now, hoursIn);

    const existing = await pool.query(`select 1 from daily_insights where user_id = $1 and date = $2`, [
      profile.id,
      date,
    ]);
    if (existing.rows.length > 0) continue;

    if (hoursIn < MAX_WAIT_HOURS) {
      const sleep = await pool.query(
        `select 1 from daily_metrics where user_id = $1 and date = $2 and sleep_score is not null`,
        [profile.id, date],
      );
      if (sleep.rows.length === 0) continue; // last night's sleep hasn't synced yet: try next hour
    }

    const insight = await generateAndStoreInsight(profile.id, date);
    if (insight && profile.notifications_enabled) {
      await sendPushToUser(profile.id, "Your daily insight is ready", pushBody(insight));
    }
  }
}

if (require.main === module) {
  runHourlyInsightsCheck()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
