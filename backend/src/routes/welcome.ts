import { Router } from "express";
import { timingSafeEqual } from "crypto";
import { escapeHtml } from "../lib/html";

// Internal endpoint that sends a one-time "welcome to UpVital" email. It is called by a
// Supabase database trigger (db/hooks/welcome-email-on-confirm.sql) the moment a user's
// email is confirmed — NOT by the app or any public client. The trigger authenticates with
// a shared secret in the `x-welcome-secret` header (WELCOME_HOOK_SECRET), so this route is
// effectively private even though it isn't behind Supabase JWT auth.
const router = Router();

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const WELCOME_FROM = process.env.CONTACT_FROM || "UpVital <no-reply@send.upvital.app>";
const WELCOME_REPLY_TO = process.env.CONTACT_TO || "support@upvital.app";
const WELCOME_HOOK_SECRET = process.env.WELCOME_HOOK_SECRET;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Constant-time secret compare so the header can't be brute-forced by timing.
function secretOk(provided: string | undefined): boolean {
  if (!WELCOME_HOOK_SECRET || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(WELCOME_HOOK_SECRET);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function sendWelcome(name: string, email: string): Promise<void> {
  const clean = name.replace(/[\r\n]+/g, " ").trim();
  const greetingName = clean ? escapeHtml(clean) : "there";
  const greetingText = clean || "there";
  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px;">
    <div style="font-size:20px;font-weight:700;color:#16A34A;margin-bottom:24px;">UpVital</div>
    <div style="background:#ffffff;border-radius:12px;padding:28px 24px;">
      <p style="margin:0 0 16px;font-size:16px;">Welcome, ${greetingName}! 👋</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:22px;">
        Your UpVital account is ready. Each morning UpVital turns your Apple Health data into a
        daily longevity snapshot — your Recovery, Sleep, Stress and overall Daily score — plus a
        personalized insight and an AI health coach you can chat with.
      </p>
      <p style="margin:0 0 8px;font-size:15px;font-weight:600;">To get started:</p>
      <ol style="margin:0 0 16px;padding-left:20px;font-size:15px;line-height:22px;color:#333;">
        <li>Open the app and grant Apple Health access when prompted.</li>
        <li>Give it a moment to sync, then watch your scores populate.</li>
        <li>Set your birthdate so we can estimate your biological age.</li>
      </ol>
      <p style="margin:0;font-size:15px;line-height:22px;">
        We're just getting started and would love your feedback — simply reply to this email.
      </p>
      <p style="margin:20px 0 0;font-size:15px;">— The UpVital team</p>
    </div>
    <p style="margin:20px 0 0;font-size:12px;color:#999;text-align:center;">
      You're receiving this because you created an UpVital account.
    </p>
  </div>
</body></html>`;
  const text = `Welcome, ${greetingText}!

Your UpVital account is ready. Each morning UpVital turns your Apple Health data into a daily longevity snapshot — your Recovery, Sleep, Stress and overall Daily score — plus a personalized insight and an AI health coach you can chat with.

To get started:
1. Open the app and grant Apple Health access when prompted.
2. Give it a moment to sync, then watch your scores populate.
3. Set your birthdate so we can estimate your biological age.

We're just getting started and would love your feedback — simply reply to this email.

— The UpVital team`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: WELCOME_FROM,
      to: email,
      reply_to: WELCOME_REPLY_TO,
      subject: "Welcome to UpVital 🎉",
      html,
      text,
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Resend ${response.status}: ${body}`);
  }
}

router.post("/internal/welcome", async (req, res) => {
  if (!secretOk(req.header("x-welcome-secret"))) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  if (!RESEND_API_KEY) {
    // Not configured — ack so the DB trigger doesn't record a failure, but log it.
    console.warn("[welcome] RESEND_API_KEY not set — welcome email skipped.");
    res.json({ ok: true, skipped: true });
    return;
  }
  const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
  const name = typeof req.body?.name === "string" ? req.body.name : "";
  // The caller is the trusted DB trigger, but validate the shape anyway (defense-in-depth):
  // a malformed address is never worth a send attempt.
  if (!email || !EMAIL_RE.test(email)) {
    res.status(400).json({ error: "valid email required" });
    return;
  }
  try {
    await sendWelcome(name, email);
    res.json({ ok: true });
  } catch (err) {
    console.error("[welcome] send failed:", err);
    res.status(502).json({ error: "send failed" });
  }
});

export default router;
