-- Welcome email on email-confirm — Supabase database trigger.
--
-- WHY: Supabase has no native "welcome" email. This trigger fires the instant a user's
-- email becomes confirmed (email_confirmed_at goes NULL -> set) and calls the backend's
-- private /internal/welcome endpoint over HTTPS via pg_net; the backend sends the branded
-- welcome via Resend. Firing on *confirm* (not signup) means real, verified addresses only.
--
-- SECURITY: the request carries a shared secret in the x-welcome-secret header. That SAME
-- secret must be set in the backend (Railway) as WELCOME_HOOK_SECRET, or the endpoint 401s.
-- The secret is NOT hardcoded here — it's read at runtime from Supabase Vault, so it never
-- lives in source control.
--
-- SETUP (👤, one time — do these in order):
--   1. Supabase → SQL Editor → store the secret in Vault (replace with your rotated value):
--        select vault.create_secret('<YOUR_SECRET>', 'welcome_hook_secret');
--      (To rotate later: `select vault.update_secret((select id from vault.secrets
--       where name='welcome_hook_secret'), '<NEW_SECRET>');`)
--   2. Railway → backend service → Variables → set WELCOME_HOOK_SECRET=<the SAME value> → redeploy.
--   3. Supabase → SQL Editor → run this whole file.
--   4. Test: sign up a fresh address, click the confirm link → a welcome email should arrive.
--   (URL below is the API host — https://api.upvital.app/internal/welcome.)
--
-- Re-running is safe: the function is CREATE OR REPLACE and the trigger is dropped first.

create extension if not exists pg_net;

create or replace function public.send_welcome_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  hook_url    text := 'https://api.upvital.app/internal/welcome';
  hook_secret text;
  just_confirmed boolean;
begin
  -- Read the shared secret from Vault (never hardcoded in this function / the repo).
  select decrypted_secret into hook_secret
    from vault.decrypted_secrets
    where name = 'welcome_hook_secret';
  if hook_secret is null then
    raise warning '[welcome] vault secret welcome_hook_secret not set — skipping welcome email';
    return new;
  end if;

  -- Fire only when an EXISTING unconfirmed user becomes confirmed — i.e. the real
  -- email-confirm click (an UPDATE flipping email_confirmed_at NULL -> set). Rows that are
  -- born already-confirmed (admin-created, the seeded demo account, or auto-confirm) arrive
  -- as INSERTs and are intentionally skipped: they didn't just sign up, so no welcome.
  just_confirmed := (tg_op = 'UPDATE')
    and (new.email_confirmed_at is not null)
    and (old.email_confirmed_at is null);

  if not just_confirmed or new.email is null then
    return new;
  end if;

  perform net.http_post(
    url     := hook_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-welcome-secret', hook_secret
    ),
    body    := jsonb_build_object(
      'email', new.email,
      -- Best-effort display name from signup metadata; the email falls back to "there".
      'name', coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'name', '')
    )
  );

  return new;
end;
$$;

drop trigger if exists send_welcome_email on auth.users;
create trigger send_welcome_email
  after insert or update of email_confirmed_at on auth.users
  for each row execute function public.send_welcome_email();
