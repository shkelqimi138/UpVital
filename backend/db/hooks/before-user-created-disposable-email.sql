-- Supabase "Before User Created" auth hook — server-side disposable-email block.
--
-- WHY: mobile/lib/auth/disposable-emails.ts already blocks throwaway domains at the signup
-- screen, but that guard is bypassable (a client can call Supabase Auth directly). This
-- Postgres hook runs the SAME check inside the auth flow, so it holds no matter how the
-- signup request arrives. Keep the domain list here in sync with disposable-emails.ts.
--
-- HOW TO ENABLE (👤, one time, in the Supabase dashboard):
--   1. SQL Editor → paste + run this whole file (creates the function + grants).
--   2. Authentication → Hooks → "Before User Created" → enable →
--      choose "Postgres" → schema `public`, function `before_user_created_block_disposable_email`.
--   3. Test: signing up with e.g. foo@mailinator.com must fail with the message below;
--      a normal address must still succeed.
--
-- Contract (Supabase Postgres auth hook): the function takes the event jsonb and returns
-- jsonb. Return '{}'::jsonb to allow; return an { error: { message, http_code } } object to
-- reject. The user's email is at event->'user'->>'email'.

create or replace function public.before_user_created_block_disposable_email(event jsonb)
returns jsonb
language plpgsql
as $$
declare
  email  text := lower(event->'user'->>'email');
  domain text;
  -- Keep in sync with DISPOSABLE_DOMAINS in mobile/lib/auth/disposable-emails.ts.
  disposable text[] := array[
    'mailinator.com',
    'guerrillamail.com',
    'guerrillamail.info',
    'sharklasers.com',
    'grr.la',
    '10minutemail.com',
    '10minutemail.net',
    'temp-mail.org',
    'tempmail.com',
    'tempmailo.com',
    'tempr.email',
    'yopmail.com',
    'yopmail.fr',
    'throwawaymail.com',
    'getnada.com',
    'nada.email',
    'maildrop.cc',
    'dispostable.com',
    'trashmail.com',
    'trashmail.de',
    'mailnesia.com',
    'fakeinbox.com',
    'spamgourmet.com',
    'mohmal.com',
    'mintemail.com',
    'moakt.com',
    'emailondeck.com',
    'burnermail.io',
    'mailsac.com',
    'inboxbear.com',
    'tempmail.plus',
    '1secmail.com'
  ];
begin
  -- No email on the event (e.g. phone/OAuth signups) → nothing to check, let it through
  -- and leave format validation to Supabase.
  if email is null or position('@' in email) = 0 then
    return '{}'::jsonb;
  end if;

  domain := split_part(email, '@', 2);

  if domain = any (disposable) then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'message', 'Please use a permanent email address — disposable email providers aren''t allowed.',
        'http_code', 403
      )
    );
  end if;

  return '{}'::jsonb;
end;
$$;

-- The auth system runs the hook as the `supabase_auth_admin` role; no one else should be
-- able to call it.
grant execute on function public.before_user_created_block_disposable_email to supabase_auth_admin;
revoke execute on function public.before_user_created_block_disposable_email from authenticated, anon, public;
