// Where the ordinary sync starts reading Apple Health. Pure (no native modules), unit-tested in
// sync-window.test.ts.

// How far back a record that reaches Apple Health late is still picked up by the ordinary sync
// (further back is the history import's job).
export const LATE_DATA_WINDOW_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The last 30 days, or back to the last sync when that was longer ago, so a long gap between
 *  syncs still reaches back to where the previous one left off. */
export function syncWindowStart(lastSynced: Date | null, now: Date): Date {
  const lateWindowStart = new Date(now.getTime() - LATE_DATA_WINDOW_DAYS * DAY_MS);
  return lastSynced && lastSynced < lateWindowStart ? lastSynced : lateWindowStart;
}
