// Pure error-classification helpers, deliberately free of any React Native / Supabase /
// AsyncStorage import so they can be unit-tested in plain Node. `api/client.ts` and `auth/auth-errors.ts`
// both build on these.

/** An error whose `message` is safe to show to a user verbatim. */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}

export const OFFLINE_MESSAGE = "No internet connection. Check your network and try again.";
export const TIMEOUT_MESSAGE = "That took too long. Check your connection and try again.";
export const GENERIC_MESSAGE = "Something went wrong. Please try again.";

// RN, Expo, supabase-js and iOS/NSURLSession each phrase a dead connection differently, and
// none of them are distinguishable by type — only by the text they carry.
export const OFFLINE_PATTERNS =
  /network request failed|failed to fetch|load failed|networkerror|network error|internet connection appears to be offline|could not connect|connection (was )?lost|cannot connect to host|econnrefused|enotfound|dns/i;

export const TIMEOUT_PATTERNS = /abort|timed out|timeout/i;

export function errorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && typeof (err as { message?: unknown }).message === "string") {
    return (err as { message: string }).message;
  }
  return String(err);
}

/** True when the failure was connectivity, not a real answer from the server. */
export function isOfflineError(err: unknown): boolean {
  const raw = errorText(err);
  return OFFLINE_PATTERNS.test(raw) || TIMEOUT_PATTERNS.test(raw);
}

/** Turns anything catchable into copy that's safe to put on screen. */
export function friendlyMessage(err: unknown, fallback = GENERIC_MESSAGE): string {
  if (err instanceof UserFacingError) return err.message;
  const raw = errorText(err);
  if (TIMEOUT_PATTERNS.test(raw)) return TIMEOUT_MESSAGE;
  if (OFFLINE_PATTERNS.test(raw)) return OFFLINE_MESSAGE;
  return fallback;
}

/** "2 hours ago" / "yesterday" — used by the offline banner to date the numbers on screen. */
export function relativeTime(at: number, now: number = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - at) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return minutes === 1 ? "1 min ago" : `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}
