// A small, high-signal blocklist of the most common disposable / throwaway email providers,
// used to discourage bulk throwaway-account signups.
//
// This is the CLIENT-SIDE half of the guard: it exists to give instant feedback on the signup
// screen, and is bypassable on its own (a client can call Supabase Auth directly).
//
// The server-side half IS in place and is the real enforcement point: the Supabase
// "Before User Created" auth hook in backend/db/hooks/before-user-created-disposable-email.sql
// runs the same check inside the auth flow, so it holds however the signup request arrives.
// (Deployed — SQL run in Supabase and the hook enabled.)
//
// ⚠️ The two lists MUST stay in sync — update BOTH this set and the `disposable` array in that
// SQL file together, or the screen and the server will disagree. Keep the list short and
// well-known rather than exhaustive: whole-internet disposable-domain lists run to thousands
// of entries, bloat the bundle, and go stale quickly.
const DISPOSABLE_DOMAINS = new Set<string>([
  "mailinator.com",
  "guerrillamail.com",
  "guerrillamail.info",
  "sharklasers.com",
  "grr.la",
  "10minutemail.com",
  "10minutemail.net",
  "temp-mail.org",
  "tempmail.com",
  "tempmailo.com",
  "tempr.email",
  "yopmail.com",
  "yopmail.fr",
  "throwawaymail.com",
  "getnada.com",
  "nada.email",
  "maildrop.cc",
  "dispostable.com",
  "trashmail.com",
  "trashmail.de",
  "mailnesia.com",
  "fakeinbox.com",
  "spamgourmet.com",
  "mohmal.com",
  "mintemail.com",
  "moakt.com",
  "emailondeck.com",
  "burnermail.io",
  "mailsac.com",
  "inboxbear.com",
  "tempmail.plus",
  "1secmail.com",
]);

/** True when `email`'s domain is a known disposable provider. Case-insensitive; returns
 *  false for anything without a recognizable `@domain`, leaving normal format validation
 *  (and Supabase's own checks) to reject those. */
export function isDisposableEmail(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at === -1) return false;
  const domain = email
    .slice(at + 1)
    .trim()
    .toLowerCase();
  return DISPOSABLE_DOMAINS.has(domain);
}

// Providers where "+tag" is a delivery alias that folds to the base inbox — safe to strip
// so user+1@ / user+2@ can't spin up separate accounts. For unknown domains we do NOT strip
// "+", since some mail servers treat it as a literal, valid address character.
const PLUS_ALIAS_PROVIDERS = new Set<string>([
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

// Gmail additionally ignores dots in the local part (j.o.hn == john).
const DOT_IGNORING_PROVIDERS = new Set<string>(["gmail.com", "googlemail.com"]);

/** Canonicalize an email for uniqueness / abuse checks: lowercases, and for providers that
 *  treat "+tag" as an alias (and dots, for Gmail) folds those away so aliases of the same
 *  inbox resolve to one address. Unknown domains are returned as a plain trimmed lowercase. */
export function normalizeEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at === -1) return trimmed;
  let local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  if (PLUS_ALIAS_PROVIDERS.has(domain)) {
    const plus = local.indexOf("+");
    if (plus !== -1) local = local.slice(0, plus);
  }
  if (DOT_IGNORING_PROVIDERS.has(domain)) {
    local = local.replace(/\./g, "");
  }
  return `${local}@${domain}`;
}
