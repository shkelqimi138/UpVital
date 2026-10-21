// API routes to delete the account, wipe health data and send the password-changed email
import { Router } from "express";
import { pool } from "../db";
import { supabaseAdmin } from "../supabase";
import { requireAuth } from "../middleware/auth";
import { canonicalEmail } from "../lib/validate";
import { revokeAppleSignIn } from "../lib/apple-revoke";

const router = Router();

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const ACCOUNT_FROM = process.env.CONTACT_FROM || "UpVital <no-reply@send.upvital.app>";
const ACCOUNT_REPLY_TO = process.env.CONTACT_TO || "support@upvital.app";

// Small branded shell so account emails match the welcome/closure look.
function accountEmailHtml(heading: string, body: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px;">
    <div style="font-size:20px;font-weight:700;color:#16A34A;margin-bottom:24px;">UpVital</div>
    <div style="background:#ffffff;border-radius:12px;padding:28px 24px;">
      <p style="margin:0 0 16px;font-size:16px;font-weight:600;">${heading}</p>
      ${body}
      <p style="margin:20px 0 0;font-size:15px;">— The UpVital team</p>
    </div>
  </div>
</body></html>`;
}

// Best-effort transactional send over Resend's HTTP API (Railway Hobby blocks SMTP). Never throws —
// these run after the account action already succeeded, so a mail failure must not fail the request.
async function sendAccountEmail(email: string, subject: string, html: string, text: string): Promise<void> {
  if (!RESEND_API_KEY) {
    console.warn(`[account] RESEND_API_KEY not set — "${subject}" email skipped.`);
    return;
  }
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: ACCOUNT_FROM,
        to: email,
        reply_to: ACCOUNT_REPLY_TO,
        subject,
        html,
        text,
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error(`[account] "${subject}" Resend ${response.status}: ${body}`);
    }
  } catch (err) {
    console.error(`[account] "${subject}" email failed:`, err);
  }
}

async function sendClosureEmail(email: string): Promise<void> {
  const html = accountEmailHtml(
    "Your account has been closed",
    `<p style="margin:0 0 16px;font-size:15px;line-height:22px;">We've permanently deleted your UpVital account and all of the data associated with it — your health data, scores, and profile. This can't be undone.</p>
     <p style="margin:0;font-size:15px;line-height:22px;">If you didn't request this, reply to this email right away and we'll help.</p>`,
  );
  const text = `Your UpVital account has been closed.

We've permanently deleted your UpVital account and all of the data associated with it — your health data, scores, and profile. This can't be undone.

If you didn't request this, reply to this email right away and we'll help.

— The UpVital team`;
  await sendAccountEmail(email, "Your UpVital account has been closed", html, text);
}

async function sendPasswordChangedEmail(email: string): Promise<void> {
  const html = accountEmailHtml(
    "Your password was changed",
    `<p style="margin:0 0 16px;font-size:15px;line-height:22px;">The password for your UpVital account was just changed. If this was you, you're all set — no action needed.</p>
     <p style="margin:0;font-size:15px;line-height:22px;">If this <strong>wasn't</strong> you, reset your password from the app right away and reply to this email so we can help secure your account.</p>`,
  );
  const text = `Your UpVital password was changed.

The password for your UpVital account was just changed. If this was you, you're all set — no action needed.

If this wasn't you, reset your password from the app right away and reply to this email so we can help secure your account.

— The UpVital team`;
  await sendAccountEmail(email, "Your UpVital password was changed", html, text);
}

// Deletes the Supabase Auth user; every app table's FK is `references auth.users(id) on delete
// cascade`, so this removes all of the user's data in one shot. Requires the caller to re-type
// their own email (verified server-side) as a deliberate confirmation. Apple-ID accounts also send
// a fresh Apple authorization code so the Sign in with Apple link is revoked (lib/apple-revoke.ts).
router.delete("/account", requireAuth, async (req, res) => {
  const typed = typeof req.body?.email === "string" ? canonicalEmail(req.body.email) : "";
  const appleCode =
    typeof req.body?.appleAuthorizationCode === "string" && req.body.appleAuthorizationCode.length <= 2000
      ? req.body.appleAuthorizationCode
      : null;
  if (!typed) {
    res.status(400).json({ error: "Type your email address to confirm account deletion." });
    return;
  }
  try {
    const { data: userData, error: getErr } = await supabaseAdmin.auth.admin.getUserById(req.userId!);
    if (getErr) throw getErr;
    const accountEmail = userData.user?.email ?? null;
    // Canonical on both sides: accounts are stored with Gmail dots/+tags folded (older ones may
    // not be), and people re-type their address either way.
    if (!accountEmail || typed !== canonicalEmail(accountEmail)) {
      res.status(400).json({ error: "The email you entered doesn't match this account." });
      return;
    }

    // Best-effort, before the account goes: the deletion must not depend on Apple being reachable.
    // Revoke first because Apple's code expires within 5 minutes; if the delete below then fails,
    // the account stays and the user's next Apple sign-in simply asks for permission again.
    if (userData.user?.identities?.some((identity) => identity.provider === "apple")) {
      if (appleCode) await revokeAppleSignIn(appleCode);
      else
        console.warn(
          "[account] Apple account deleted without an authorization code; Apple link not revoked.",
        );
    }

    const { error } = await supabaseAdmin.auth.admin.deleteUser(req.userId!);
    if (error) throw error;

    await sendClosureEmail(accountEmail); // best-effort, never fails the request
    res.json({ ok: true });
  } catch (err) {
    console.error("[account] delete failed:", err);
    res.status(500).json({ error: "Could not delete your account. Please try again." });
  }
});

// Wipes the user's health data (samples, workouts, computed metrics, insights) but KEEPS the
// account, profile/settings, and push registration. All-or-nothing.
router.post("/account/wipe-data", requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("delete from raw_health_samples where user_id = $1", [req.userId]);
    await client.query("delete from workouts where user_id = $1", [req.userId]);
    await client.query("delete from daily_metrics where user_id = $1", [req.userId]);
    await client.query("delete from daily_insights where user_id = $1", [req.userId]);
    await client.query("commit");
    res.json({ ok: true });
  } catch (err) {
    await client.query("rollback").catch(() => {});
    console.error("[account] wipe-data failed:", err);
    res.status(500).json({ error: "Could not delete your data. Please try again." });
  } finally {
    client.release();
  }
});

// Sends the "your password was changed" security email. The password change itself happens
// client-side against Supabase (updateUser); Supabase only emits its own notification on the
// secure/reauth flow, which we don't use — so the app calls this right after a successful change.
// Best-effort: always 200 so a mail hiccup never looks like the change failed.
router.post("/account/notify-password-change", requireAuth, async (req, res) => {
  try {
    const { data } = await supabaseAdmin.auth.admin.getUserById(req.userId!);
    const email = data.user?.email;
    if (email) await sendPasswordChangedEmail(email);
  } catch (err) {
    console.error("[account] notify-password-change failed:", err);
  }
  res.json({ ok: true });
});

export default router;
