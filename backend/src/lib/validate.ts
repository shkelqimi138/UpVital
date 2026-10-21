// Shared request-validation helpers.

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** True when `v` is a calendar-day string in YYYY-MM-DD form that parses to a real date.
 *  Routes take the day from the client and pass it to Postgres as `$n::date`; validating
 *  the shape here returns a clean 400 instead of letting a malformed value become a 500. */
export function isYmd(v: unknown): v is string {
  return typeof v === "string" && YMD.test(v) && !Number.isNaN(Date.parse(v));
}

// Mirrors mobile/lib/auth/disposable-emails.ts normalizeEmail — keep the two provider lists in sync.
const PLUS_ALIAS_PROVIDERS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "yahoo.com",
  "ymail.com",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
]);
const DOT_IGNORING_PROVIDERS = new Set(["gmail.com", "googlemail.com"]);

/** The canonical form the app signs up with: lowercased, with "+tag" aliases (and Gmail dots)
 *  folded away. Used to compare a re-typed email with the account's, however either was written. */
export function canonicalEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at === -1) return trimmed;
  let local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  if (PLUS_ALIAS_PROVIDERS.has(domain)) {
    const plus = local.indexOf("+");
    if (plus !== -1) local = local.slice(0, plus);
  }
  if (DOT_IGNORING_PROVIDERS.has(domain)) local = local.replace(/\./g, "");
  return `${local}@${domain}`;
}

/** An iPhone's APNs device token: hex, normally 64 characters (Apple allows longer). Lowercase,
 *  because that's how the app sends it and how it's stored. */
export function isApnsDeviceToken(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{64,200}$/.test(v);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The `session_id` claim of a Supabase access token, or null. Only call this on a token that's
 *  already been verified (requireAuth): it reads the payload, it doesn't check the signature. */
export function jwtSessionId(token: string): string | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof claims?.session_id === "string" && UUID.test(claims.session_id) ? claims.session_id : null;
  } catch {
    return null;
  }
}
