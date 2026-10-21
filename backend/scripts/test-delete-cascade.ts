import "dotenv/config";
import { pool } from "../src/db";
import { supabaseAdmin } from "../src/supabase";

// One-shot test of DELETE /account's core mechanism: creates a disposable user via the
// admin API, inserts a row into every user-data table, deletes the auth user, and verifies
// every row cascaded away. Never touches any real account.
const THROWAWAY_EMAIL = "delete-cascade-test@upvital-throwaway.invalid";

const TABLES = [
  "profiles",
  "raw_health_samples",
  "workouts",
  "daily_metrics",
  "daily_insights",
  "push_tokens",
];

async function countRows(userId: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of TABLES) {
    const col = table === "profiles" ? "id" : "user_id";
    const r = await pool.query(`select count(*)::int as n from ${table} where ${col} = $1`, [userId]);
    counts[table] = r.rows[0].n;
  }
  return counts;
}

async function main() {
  // Clean up any leftover from a previous crashed run
  const { data: existing } = await supabaseAdmin.auth.admin.listUsers();
  const leftover = existing.users.find((u) => u.email === THROWAWAY_EMAIL);
  if (leftover) await supabaseAdmin.auth.admin.deleteUser(leftover.id);

  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email: THROWAWAY_EMAIL,
    email_confirm: true,
  });
  if (createError || !created.user) throw createError ?? new Error("createUser returned no user");
  const userId = created.user.id;
  console.log("1. Created throwaway user:", userId);

  await pool.query(`insert into profiles (id, birthdate) values ($1, '1990-01-01')`, [userId]);
  await pool.query(
    `insert into raw_health_samples (user_id, data_source, sample_type, value, unit, start_date, end_date, source_uuid)
     values ($1, 'manual', 'weight', 80, 'kg', now(), now(), gen_random_uuid()::text)`,
    [userId],
  );
  await pool.query(
    `insert into workouts (user_id, data_source, workout_type, start_date, end_date, duration_seconds, source_uuid)
     values ($1, 'healthkit', 'Running', now(), now(), 1800, gen_random_uuid()::text)`,
    [userId],
  );
  await pool.query(`insert into daily_metrics (user_id, date, daily_score) values ($1, current_date, 75)`, [
    userId,
  ]);
  await pool.query(
    `insert into daily_insights (user_id, date, content) values ($1, current_date, 'test insight')`,
    [userId],
  );
  await pool.query(
    `insert into push_tokens (user_id, token) values ($1, 'ExponentPushToken[cascade-test]')`,
    [userId],
  );

  const before = await countRows(userId);
  console.log("2. Rows inserted:", before);
  const allPresent = Object.values(before).every((n) => n === 1);
  if (!allPresent) throw new Error("Setup failed — expected 1 row in every table");

  const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (deleteError) throw deleteError;
  console.log("3. Deleted auth user");

  const after = await countRows(userId);
  console.log("4. Rows remaining after delete:", after);
  const allGone = Object.values(after).every((n) => n === 0);

  console.log(
    allGone ? "\nPASS: every table cascaded to zero rows." : "\nFAIL: some rows survived the delete!",
  );
  process.exit(allGone ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
