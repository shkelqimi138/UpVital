// Looks up a user's timezone so days are bucketed by their local calendar day
import { pool } from "../db";

/**
 * The user's IANA timezone from their profile, or 'UTC' when unset/missing. Day-bucketing in the
 * scoring pipeline and the per-day read routes keys off this so a "day" is the user's local
 * calendar day (their wall clock), not a UTC day — e.g. an 11pm-local workout counts toward that
 * local day. Paired with the SQL form `(start_date at time zone <tz>)::date`.
 */
export async function getUserTimezone(userId: string): Promise<string> {
  const result = await pool.query(`select timezone from profiles where id = $1`, [userId]);
  return (result.rows[0]?.timezone as string | undefined) ?? "UTC";
}
