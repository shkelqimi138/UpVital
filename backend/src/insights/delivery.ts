// When the daily insight is written, and how it's shortened for the push notification.
// Pure helpers (no DB), unit-tested in delivery.test.ts.

/** How many hours after the user's chosen hour the job keeps waiting for last night's sleep. */
export const MAX_WAIT_HOURS = 3;

// The push is a preview: about what a lock-screen notification shows. Tapping it opens the app,
// which has the whole insight.
const MAX_PUSH_BODY = 180;

const MS_PER_HOUR = 60 * 60 * 1000;

export function localHour(tz: string, at: Date): number {
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false });
  return parseInt(formatter.format(at), 10) % 24;
}

/** The user's local calendar day at `at`, as YYYY-MM-DD. */
export function localDate(tz: string, at: Date): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(at);
}

/** Hours since the user's chosen insight hour (0 = that hour), or null outside the window. */
export function hoursIntoInsightWindow(insightHour: number, hourNow: number): number | null {
  const since = (((hourNow - insightHour) % 24) + 24) % 24;
  return since <= MAX_WAIT_HOURS ? since : null;
}

/** The day the window opened on, so a late hour (say 23:00) that runs past midnight keeps
 *  writing that day's insight instead of starting the next day's early. */
export function insightDate(tz: string, now: Date, hoursIntoWindow: number): string {
  return localDate(tz, new Date(now.getTime() - hoursIntoWindow * MS_PER_HOUR));
}

function shortenAtWord(text: string, max: number): string {
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:]+$/, "") + "…";
}

/** A short preview of the insight: as many whole sentences as fit (usually one or two), never
 *  cut mid-word. Only a first sentence too long to fit is shortened, at a word, with "…". */
export function pushBody(text: string, max = MAX_PUSH_BODY): string {
  // A sentence ends at . ! or ? followed by a space and a capital, so "7.2 hours" stays whole.
  const sentences = text
    .trim()
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s(?=[A-Z])/);
  let body = sentences[0];
  if (body.length > max) return shortenAtWord(body, max);
  for (const next of sentences.slice(1)) {
    if (body.length + 1 + next.length > max) break;
    body += ` ${next}`;
  }
  return body;
}
