import type { NextFunction, Request, Response } from "express";
import crypto from "crypto";

// Cloudflare-only origin lock.
//
// `api.upvital.app` is proxied through Cloudflare (WAF, rate limits), but the raw
// `*.up.railway.app` origin answers the public internet directly — bypassing all of that.
// This middleware closes that bypass: when enabled, it rejects any request that doesn't
// carry a shared secret header that a Cloudflare Transform Rule injects on the api zone.
// Cloudflare-proxied traffic carries the header and passes; direct hits to the raw Railway
// URL don't, and get a 403.
//
// Enable ONLY when both env vars are set AND every active client reaches the backend through
// Cloudflare (i.e. no app build still targets the raw Railway URL). Ships OFF by default:
//   REQUIRE_CLOUDFLARE_ORIGIN = "true"   → enforce
//   ORIGIN_SHARED_SECRET      = <random> → must match the value Cloudflare injects
// Set the same secret in the Cloudflare Transform Rule (add request header ORIGIN_HEADER).
//
// `/health` is always exempt so Railway's platform healthcheck (which does not pass through
// Cloudflare) keeps working — it exposes nothing sensitive.

const ORIGIN_HEADER = "x-origin-secret";
const EXEMPT_PATHS = new Set<string>(["/health"]);

const enforce = process.env.REQUIRE_CLOUDFLARE_ORIGIN === "true";
const secret = process.env.ORIGIN_SHARED_SECRET ?? "";

// The flag is opt-in: setting it means the operator WANTS the origin locked. If the secret is
// missing or too weak we must not quietly serve unprotected — that's exactly the silent-fail the
// review flagged. Refuse to boot instead, so the misconfig is loud: Railway fails the deploy and
// keeps the previous, working version live, rather than rolling out a lock the team believes is
// on but isn't. (Flag unset → no enforcement, no throw — local dev and default deploys are fine.)
if (enforce && secret.length < 16) {
  throw new Error(
    "[origin-lock] REQUIRE_CLOUDFLARE_ORIGIN=true but ORIGIN_SHARED_SECRET is missing or shorter " +
      "than 16 chars. Set a strong ORIGIN_SHARED_SECRET (openssl rand -hex 32) or unset " +
      "REQUIRE_CLOUDFLARE_ORIGIN — refusing to start unprotected.",
  );
}

const active = enforce; // secret is validated above whenever enforcing
console.log(`[origin-lock] Cloudflare-only enforcement ${active ? "ENABLED" : "disabled"}.`);

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function requireCloudflareOrigin(req: Request, res: Response, next: NextFunction): void {
  if (!active) return next();
  if (EXEMPT_PATHS.has(req.path)) return next();

  const provided = req.get(ORIGIN_HEADER) ?? "";
  if (provided && safeEqual(provided, secret)) return next();

  // No detail in the body — don't confirm the header name to a prober hitting the raw origin.
  res.status(403).json({ error: "Forbidden" });
}
