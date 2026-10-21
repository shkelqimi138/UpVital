# Branded Supabase auth email templates

Branded HTML for the auth emails **Supabase** sends (confirm signup, reset password, etc.),
styled to match UpVital (green `#16A34A`, white card). Supabase's `{{ .Variable }}`
placeholders are already in place — do **not** edit those.

> **Two email systems — don't confuse them.** These templates are for **Supabase-sent** auth mail.
> Some account emails are instead **sent by our backend** over the Resend HTTP API (Railway blocks
> SMTP) and live in code, not here: **welcome** (`src/routes/welcome.ts`), the **contact-form forward** to support
> (`src/routes/contact.ts`; no auto-reply to the sender), and **account closure** + **password-changed** (`src/routes/account.ts`).
> The password-changed notice is ours on purpose — Supabase only emits its own on the secure/reauth
> flow, which the app doesn't use — so leave Supabase's "password changed" notification off.

## How to apply (👤, Supabase dashboard)

For each file: **Authentication → Emails → Templates → [pick the template]**, then paste the
file's contents into the **Message body (HTML)** and set the subject:

| File | Supabase template | Suggested subject |
|------|-------------------|-------------------|
| `confirm-signup.html` | Confirm signup | Confirm your UpVital email |
| `reset-password.html` | Reset Password | Reset your UpVital password |
| `change-email.html` | Change Email Address | Confirm your new UpVital email |
| `magic-link.html` | Magic Link | Your UpVital sign-in link |
| `reauthentication.html` | Reauthentication | Your UpVital verification code |

**Priority:** `confirm-signup` and `reset-password` are the ones users actually hit today.
`magic-link` and `reauthentication` are only sent if those flows are enabled — branded here
so nothing looks unbranded if you turn them on later.

## Custom SMTP — ✅ configured

Supabase auth mail is already sent from `send.upvital.app` via Resend custom SMTP (host
`smtp.resend.com`, port `465`, user `resend`, sender `no-reply@send.upvital.app`). No action needed;
recorded here for reference. Without it, Supabase's built-in mailer is rate-limited and not
production-grade.

## Security-notification emails (Supabase settings)

Supabase can also email the user when their email/password changes (Authentication → the Email
provider settings). Current stance:
- **Email changed** — Supabase's "Secure email change" is **ON**, so a change confirms on **both**
  the old and new address (that's the notification + the confirmation).
- **Password changed** — sent by **our backend** (see the note at the top), so Supabase's own
  "password changed" notification stays **off** to avoid duplicates.
- **Require current password when updating** — **ON** (since 2026-10-05). Profile → Password sends
  the current password with the change and Supabase rejects a wrong one; password-reset links are
  exempt. "Secure password change" (emailed code) stays **off** — the app has no screen for it.
