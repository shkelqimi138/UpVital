// API route for reading and updating the user's profile (GET/PATCH /profile)
import { Router } from "express";
import { pool } from "../db";
import { requireAuth } from "../middleware/auth";

const router = Router();

// Upper bounds. Without these a caller can store a multi-megabyte display name (capped only by
// the 10 MB body limit) or a goal like 1e308 that only blows up later inside Postgres.
const MAX_DISPLAY_NAME = 200;
const MAX_AVATAR_URL = 2048;
const MAX_STEP_GOAL = 100_000; // ~3x the highest realistic daily step target
const MAX_SLEEP_GOAL_HOURS = 24;
const MAX_ACTIVE_CALORIE_GOAL = 20_000; // well past any realistic daily active-energy target
const MAX_HEIGHT_CM = 300; // taller than any human; lower bound is > 0
const MAX_WEIGHT_GOAL_KG = 500; // well past any realistic weight goal
// Local hour the daily insight is written and pushed, until the user picks another (Profile).
// Matches the column default in db/schema.sql.
const DEFAULT_INSIGHT_HOUR = 7;

function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Only absolute https:// URLs. Rejects `javascript:`, `data:`, protocol-relative `//evil.com`
// and anything unparseable, so the stored value is safe for any future renderer.
function isSafeHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

router.get("/profile", requireAuth, async (req, res) => {
  const result = await pool.query(
    `select birthdate, timezone, step_goal, sleep_goal_hours::float as sleep_goal_hours,
            active_calorie_goal, notifications_enabled, display_name, avatar_url,
            height_cm, weight_goal_kg::float as weight_goal_kg, weight_goal_target_date, ai_consent,
            insight_hour
     from profiles where id = $1`,
    [req.userId],
  );
  const row = result.rows[0];
  res.json({
    birthdate: row?.birthdate ?? null,
    timezone: row?.timezone ?? null,
    stepGoal: row?.step_goal ?? null,
    sleepGoalHours: row?.sleep_goal_hours ?? null,
    activeCalorieGoal: row?.active_calorie_goal ?? null,
    notificationsEnabled: row?.notifications_enabled ?? true,
    displayName: row?.display_name ?? null,
    avatarUrl: row?.avatar_url ?? null,
    heightCm: row?.height_cm ?? null,
    weightGoalKg: row?.weight_goal_kg ?? null,
    weightGoalTargetDate: row?.weight_goal_target_date ?? null,
    aiConsent: row?.ai_consent ?? false,
    insightHour: row?.insight_hour ?? DEFAULT_INSIGHT_HOUR,
  });
});

router.patch("/profile", requireAuth, async (req, res) => {
  const body = req.body ?? {};
  const hasBirthdate = "birthdate" in body;
  const hasTimezone = "timezone" in body;
  const hasStepGoal = "stepGoal" in body;
  const hasSleepGoalHours = "sleepGoalHours" in body;
  const hasActiveCalorieGoal = "activeCalorieGoal" in body;
  const hasNotificationsEnabled = "notificationsEnabled" in body;
  const hasDisplayName = "displayName" in body;
  const hasAvatarUrl = "avatarUrl" in body;
  const hasHeightCm = "heightCm" in body;
  const hasWeightGoalKg = "weightGoalKg" in body;
  const hasWeightGoalTargetDate = "weightGoalTargetDate" in body;
  const hasAiConsent = "aiConsent" in body;
  const hasInsightHour = "insightHour" in body;

  if (
    !hasBirthdate &&
    !hasTimezone &&
    !hasStepGoal &&
    !hasSleepGoalHours &&
    !hasActiveCalorieGoal &&
    !hasNotificationsEnabled &&
    !hasDisplayName &&
    !hasAvatarUrl &&
    !hasHeightCm &&
    !hasWeightGoalKg &&
    !hasWeightGoalTargetDate &&
    !hasAiConsent &&
    !hasInsightHour
  ) {
    res.status(400).json({ error: "No recognized fields provided" });
    return;
  }
  if (hasBirthdate && body.birthdate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(body.birthdate)) {
    res.status(400).json({ error: "birthdate must be 'YYYY-MM-DD' or null" });
    return;
  }
  if (hasTimezone && !isValidTimezone(body.timezone)) {
    res.status(400).json({ error: "timezone must be a valid IANA timezone name" });
    return;
  }
  // Upper bounds matter as much as the lower ones: `Number.isInteger(1e20)` is true, and an
  // out-of-range int would only fail later at the Postgres layer as an opaque 500.
  if (
    hasStepGoal &&
    body.stepGoal !== null &&
    (!Number.isInteger(body.stepGoal) || body.stepGoal <= 0 || body.stepGoal > MAX_STEP_GOAL)
  ) {
    res.status(400).json({ error: `stepGoal must be an integer between 1 and ${MAX_STEP_GOAL}, or null` });
    return;
  }
  if (
    hasSleepGoalHours &&
    body.sleepGoalHours !== null &&
    (typeof body.sleepGoalHours !== "number" ||
      !Number.isFinite(body.sleepGoalHours) ||
      body.sleepGoalHours <= 0 ||
      body.sleepGoalHours > MAX_SLEEP_GOAL_HOURS)
  ) {
    res
      .status(400)
      .json({ error: `sleepGoalHours must be a number between 0 and ${MAX_SLEEP_GOAL_HOURS}, or null` });
    return;
  }
  if (
    hasActiveCalorieGoal &&
    body.activeCalorieGoal !== null &&
    (!Number.isInteger(body.activeCalorieGoal) ||
      body.activeCalorieGoal <= 0 ||
      body.activeCalorieGoal > MAX_ACTIVE_CALORIE_GOAL)
  ) {
    res.status(400).json({
      error: `activeCalorieGoal must be an integer between 1 and ${MAX_ACTIVE_CALORIE_GOAL}, or null`,
    });
    return;
  }
  if (hasNotificationsEnabled && typeof body.notificationsEnabled !== "boolean") {
    res.status(400).json({ error: "notificationsEnabled must be a boolean" });
    return;
  }
  if (
    hasDisplayName &&
    body.displayName !== null &&
    (typeof body.displayName !== "string" || body.displayName.length > MAX_DISPLAY_NAME)
  ) {
    res
      .status(400)
      .json({ error: `displayName must be a string of at most ${MAX_DISPLAY_NAME} characters, or null` });
    return;
  }
  // avatarUrl is stored but not yet rendered anywhere. Constrain it NOW rather than when a UI
  // finally reads it: an unvalidated string here would become a `javascript:`/`data:` XSS the
  // moment it is rendered in the Turnstile WebView or on the web build.
  if (hasAvatarUrl && body.avatarUrl !== null) {
    if (typeof body.avatarUrl !== "string" || body.avatarUrl.length > MAX_AVATAR_URL) {
      res
        .status(400)
        .json({ error: `avatarUrl must be a string of at most ${MAX_AVATAR_URL} characters, or null` });
      return;
    }
    if (!isSafeHttpsUrl(body.avatarUrl)) {
      res.status(400).json({ error: "avatarUrl must be an https:// URL" });
      return;
    }
  }
  if (
    hasHeightCm &&
    body.heightCm !== null &&
    (!Number.isInteger(body.heightCm) || body.heightCm <= 0 || body.heightCm > MAX_HEIGHT_CM)
  ) {
    res.status(400).json({ error: `heightCm must be an integer between 1 and ${MAX_HEIGHT_CM}, or null` });
    return;
  }
  if (
    hasWeightGoalKg &&
    body.weightGoalKg !== null &&
    (typeof body.weightGoalKg !== "number" ||
      !Number.isFinite(body.weightGoalKg) ||
      body.weightGoalKg <= 0 ||
      body.weightGoalKg > MAX_WEIGHT_GOAL_KG)
  ) {
    res
      .status(400)
      .json({ error: `weightGoalKg must be a number between 0 and ${MAX_WEIGHT_GOAL_KG}, or null` });
    return;
  }
  if (
    hasWeightGoalTargetDate &&
    body.weightGoalTargetDate !== null &&
    !/^\d{4}-\d{2}-\d{2}$/.test(body.weightGoalTargetDate)
  ) {
    res.status(400).json({ error: "weightGoalTargetDate must be 'YYYY-MM-DD' or null" });
    return;
  }
  if (hasAiConsent && typeof body.aiConsent !== "boolean") {
    res.status(400).json({ error: "aiConsent must be a boolean" });
    return;
  }
  if (
    hasInsightHour &&
    (!Number.isInteger(body.insightHour) || body.insightHour < 0 || body.insightHour > 23)
  ) {
    res.status(400).json({ error: "insightHour must be a whole hour from 0 to 23" });
    return;
  }

  await pool.query(
    `insert into profiles (id, birthdate, timezone, step_goal, sleep_goal_hours,
                           notifications_enabled, display_name, avatar_url, active_calorie_goal,
                           height_cm, weight_goal_kg, weight_goal_target_date,
                           ai_consent, ai_consent_updated_at, insight_hour)
     values ($1, $2, coalesce($3, 'UTC'), $4, $5, coalesce($6, true), $7, $8, $15, $17, $19, $21,
             coalesce($23, false), case when $24 then now() end, $25)
     on conflict (id) do update set
       birthdate = case when $9 then $2 else profiles.birthdate end,
       timezone = coalesce($3, profiles.timezone),
       step_goal = case when $10 then $4 else profiles.step_goal end,
       sleep_goal_hours = case when $11 then $5 else profiles.sleep_goal_hours end,
       notifications_enabled = case when $12 then $6 else profiles.notifications_enabled end,
       display_name = case when $13 then $7 else profiles.display_name end,
       avatar_url = case when $14 then $8 else profiles.avatar_url end,
       active_calorie_goal = case when $16 then $15 else profiles.active_calorie_goal end,
       height_cm = case when $18 then $17 else profiles.height_cm end,
       weight_goal_kg = case when $20 then $19 else profiles.weight_goal_kg end,
       weight_goal_target_date = case when $22 then $21 else profiles.weight_goal_target_date end,
       ai_consent = case when $24 then $23 else profiles.ai_consent end,
       -- Records when consent was given or withdrawn (GDPR Art. 7(1)); a repeat of the same value
       -- keeps the original time.
       ai_consent_updated_at = case when $24 and $23 is distinct from profiles.ai_consent then now()
                                    else profiles.ai_consent_updated_at end,
       insight_hour = case when $26 then $25 else profiles.insight_hour end,
       updated_at = now()`,
    [
      req.userId,
      hasBirthdate ? body.birthdate : null,
      hasTimezone ? body.timezone : null,
      hasStepGoal ? body.stepGoal : null,
      hasSleepGoalHours ? body.sleepGoalHours : null,
      hasNotificationsEnabled ? body.notificationsEnabled : null,
      hasDisplayName ? body.displayName : null,
      hasAvatarUrl ? body.avatarUrl : null,
      hasBirthdate,
      hasStepGoal,
      hasSleepGoalHours,
      hasNotificationsEnabled,
      hasDisplayName,
      hasAvatarUrl,
      hasActiveCalorieGoal ? body.activeCalorieGoal : null,
      hasActiveCalorieGoal,
      hasHeightCm ? body.heightCm : null,
      hasHeightCm,
      hasWeightGoalKg ? body.weightGoalKg : null,
      hasWeightGoalKg,
      hasWeightGoalTargetDate ? body.weightGoalTargetDate : null,
      hasWeightGoalTargetDate,
      hasAiConsent ? body.aiConsent : null,
      hasAiConsent,
      hasInsightHour ? body.insightHour : DEFAULT_INSIGHT_HOUR, // a new row's value; an update uses it only when sent
      hasInsightHour,
    ],
  );

  res.json({ ok: true });
});

export default router;
