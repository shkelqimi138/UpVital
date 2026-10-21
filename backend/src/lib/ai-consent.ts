// Whether the user has switched on AI insights & Coach (profiles.ai_consent). Nothing about a
// user is sent to Anthropic unless this is true: GDPR Art. 9 explicit consent, App Store 5.1.2(i).
import { pool } from "../db";

export async function hasAiConsent(userId: string): Promise<boolean> {
  const result = await pool.query(`select ai_consent from profiles where id = $1`, [userId]);
  return result.rows[0]?.ai_consent === true;
}
