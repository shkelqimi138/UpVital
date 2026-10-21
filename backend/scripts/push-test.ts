import "dotenv/config";
import { pool } from "../src/db";
import { sendPushToUser } from "../src/push";

// One-off: sends a test push to every logged-in phone (or one user's) through the same code the
// daily insight uses, and prints what happened. Needs the Apple key, which lives only in Railway:
//   cd backend && railway run npx tsx scripts/push-test.ts [userId]
// An Xcode install never gets one (sandbox token, Production-only key); TestFlight/App Store do.
async function main() {
  const userIds = process.argv[2]
    ? [process.argv[2]]
    : (await pool.query(`select distinct user_id from push_tokens`)).rows.map((r) => r.user_id as string);
  if (userIds.length === 0) console.log("No phone has registered for push.");
  for (const userId of userIds) {
    await sendPushToUser(userId, "UpVital test", "Test notification from the server.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
