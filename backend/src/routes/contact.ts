import { Router } from "express";
import { pool } from "../db";

// Public contact form (from the landing page). Stores messages in contact_messages
// AND forwards them to the support inbox by email via Resend's HTTP API. There is
// deliberately no automatic reply to the submitted address: anyone could type someone
// else's email and use the form to make us send them mail. (Railway's
// Hobby plan blocks outbound SMTP, so we send over HTTPS instead of a mail server.)
// No auth. Basic validation + a honeypot field ("company") to shed simple bots.
const router = Router();

// Resend config. If RESEND_API_KEY is unset the forwarder no-ops and messages are
// still stored in the DB — so the server boots and the form works before email is
// configured. CONTACT_FROM must be an address on a domain verified in Resend.
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const CONTACT_FROM = process.env.CONTACT_FROM || "UpVital <no-reply@send.upvital.app>";
const CONTACT_TO = process.env.CONTACT_TO || "support@upvital.app";

// Forward one contact message to the support inbox. Best-effort: the DB row is the
// source of truth, so an email failure must never fail the request. Reply-To is the
// sender so you can reply straight from your inbox. Newlines are stripped from the
// name so it can't smuggle anything into the subject line.
async function forwardEmail(name: string, email: string, message: string): Promise<void> {
  if (!RESEND_API_KEY) {
    console.warn("[contact] RESEND_API_KEY not set — messages stored in DB only, not emailed.");
    return;
  }
  const safeName = name.replace(/[\r\n]+/g, " ");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: CONTACT_FROM,
      to: CONTACT_TO,
      reply_to: email,
      subject: `New contact message from ${safeName}`,
      text: `From: ${safeName} <${email}>\n\n${message}`,
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Resend ${response.status}: ${body}`);
  }
}

// Ensure the table exists on server start (idempotent — safe to run every boot).
pool
  .query(
    `create table if not exists contact_messages (
       id uuid primary key default gen_random_uuid(),
       name text not null,
       email text not null,
       message text not null,
       user_agent text,
       created_at timestamptz not null default now()
     );
     alter table contact_messages enable row level security;`,
  )
  .catch((err) => console.error("contact_messages init failed:", err));

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Cloudflare Turnstile on the website's contact form (the same widget as the app's sign-up).
// Enforced once TURNSTILE_SECRET_KEY is set in Railway; until then the honeypot and the rate
// limit are the only guards, as before. Fails closed if Cloudflare can't be reached.
const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET_KEY;
if (!TURNSTILE_SECRET)
  console.warn("[contact] TURNSTILE_SECRET_KEY not set — contact form CAPTCHA not enforced.");

async function humanVerified(token: unknown, ip: string | undefined): Promise<boolean> {
  if (!TURNSTILE_SECRET) return true;
  if (typeof token !== "string" || token.length === 0 || token.length > 2048) return false;
  try {
    const body = new URLSearchParams({ secret: TURNSTILE_SECRET, response: token });
    if (ip) body.set("remoteip", ip);
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(8000),
    });
    const result = (await response.json()) as { success?: boolean };
    return result.success === true;
  } catch (err) {
    console.error("[contact] Turnstile verification failed:", err);
    return false;
  }
}

router.post("/contact", async (req, res) => {
  // Honeypot: real users never fill this hidden field. Pretend success so bots don't retry.
  if (req.body?.company) {
    res.json({ ok: true });
    return;
  }

  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";

  if (!name || !email || !message) {
    res.status(400).json({ error: "Name, email and message are all required." });
    return;
  }
  if (name.length > 200 || email.length > 200 || message.length > 5000) {
    res.status(400).json({ error: "That's a bit too long — please shorten it." });
    return;
  }
  if (!EMAIL_RE.test(email)) {
    res.status(400).json({ error: "Please enter a valid email address." });
    return;
  }
  if (
    !(await humanVerified(req.body?.turnstileToken, req.headers["cf-connecting-ip"] as string | undefined))
  ) {
    res.status(400).json({ error: "Please complete the verification, then try again." });
    return;
  }

  try {
    await pool.query(
      // name/message are stored RAW (parameterized, so no SQL injection). They are user-
      // supplied, so ANY surface that renders them must escape on output — the forward to the
      // support inbox is plain text; a future admin/inbox UI MUST escape (never render as HTML).
      `insert into contact_messages (name, email, message, user_agent) values ($1, $2, $3, $4)`,
      [name, email, message, (req.headers["user-agent"] ?? "").toString().slice(0, 300)],
    );

    // Forward to the support inbox — best-effort, fire-and-forget so a mail failure
    // never fails the request (the DB row is already the source of truth).
    forwardEmail(name, email, message).catch((err) => console.error("[contact] email forward failed:", err));

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

/** Retention: contact messages are deleted 12 months after they arrive, as the privacy policy
 *  says. Run once a day by the scheduler in src/index.ts. */
export async function deleteOldContactMessages(): Promise<void> {
  const result = await pool.query(
    `delete from contact_messages where created_at < now() - interval '12 months'`,
  );
  if (result.rowCount) console.log(`[contact] deleted ${result.rowCount} message(s) older than 12 months`);
}

export default router;
