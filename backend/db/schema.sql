create extension if not exists pgcrypto;

-- Users and sessions are managed by Supabase Auth (auth.users) — no custom
-- users/sessions tables here. App tables reference auth.users(id) directly.

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  birthdate date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- profiles predates the timezone column (added in Stage 5) and the goals/notification
-- columns (added in Stage 6) — CREATE TABLE IF NOT EXISTS above won't backfill columns
-- onto an already-existing table, so add them explicitly.
alter table profiles add column if not exists timezone text not null default 'UTC';
alter table profiles add column if not exists step_goal integer;
alter table profiles add column if not exists sleep_goal_hours numeric;
-- Active-energy daily goal (kcal), user-set like the step/sleep goals; null = no goal shown.
alter table profiles add column if not exists active_calorie_goal integer;
alter table profiles add column if not exists notifications_enabled boolean not null default true;
-- Display name + avatar (added in the design-handoff rebuild): the redesigned Home header
-- greets the user by name and shows an avatar, and Profile shows both. Avatar falls back to
-- initials derived from the name when avatar_url is null, so no storage bucket is required.
alter table profiles add column if not exists display_name text;
alter table profiles add column if not exists avatar_url text;
-- Personal info + goals (Profile rebuild): height in cm, and a weight goal with a target date.
-- All nullable — null means "not set". Weight itself is NOT stored here; it's the time-series in
-- raw_health_samples (the Profile shows the latest logged value read-only).
alter table profiles add column if not exists height_cm integer;
alter table profiles add column if not exists weight_goal_kg numeric;
alter table profiles add column if not exists weight_goal_target_date date;
-- AI insights & Coach consent (GDPR Art. 9 explicit consent; App Store guideline 5.1.2(i) for
-- third-party AI). Off until the user switches it on: while false, nothing about the user is
-- sent to Anthropic (no daily insight, no coach reply). The timestamp records the last change.
alter table profiles add column if not exists ai_consent boolean not null default false;
alter table profiles add column if not exists ai_consent_updated_at timestamptz;
-- Local hour (0-23) the daily AI insight is written and pushed; the user picks it in Profile.
alter table profiles add column if not exists insight_hour smallint not null default 7
  check (insight_hour between 0 and 23);

create table if not exists push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now()
);
-- The login session that registered the token (the access token's session_id claim). Pushes go
-- only while that session exists in auth.sessions, so a phone whose session ended (logout,
-- revoked, expired) gets nothing even if the app couldn't remove its token. Null = registered
-- before this column; treated as live until the app registers again.
alter table push_tokens add column if not exists session_id uuid;

create index if not exists push_tokens_user_id_idx on push_tokens(user_id);

create table if not exists daily_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  recovery_score numeric,
  sleep_score numeric,
  stress_score numeric,
  daily_score numeric,
  biological_age numeric,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

create table if not exists raw_health_samples (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  data_source text not null,
  sample_type text not null,
  value numeric,
  unit text,
  start_date timestamptz not null,
  end_date timestamptz not null,
  source_uuid text,
  created_at timestamptz not null default now(),
  unique (user_id, data_source, source_uuid)
);

create index if not exists raw_health_samples_user_type_idx on raw_health_samples(user_id, sample_type, start_date);

create table if not exists workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  data_source text not null,
  workout_type text not null,
  start_date timestamptz not null,
  end_date timestamptz not null,
  duration_seconds numeric,
  calories numeric,
  avg_heart_rate numeric,
  max_heart_rate numeric,
  raw_data jsonb,
  source_uuid text,
  created_at timestamptz not null default now(),
  unique (user_id, data_source, source_uuid)
);

create index if not exists workouts_user_id_idx on workouts(user_id, start_date);

create table if not exists daily_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  content text not null,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

-- ---------------------------------------------------------------------------
-- Row Level Security (2026-08-04 security hardening)
--
-- Each table is reached two ways:
--   1. The Express backend, connecting via DATABASE_URL as the table-OWNER
--      `postgres` role. Owners are exempt from RLS unless FORCE ROW LEVEL
--      SECURITY is set — we deliberately do NOT set it, so the backend keeps
--      full access and nothing server-side changes.
--   2. Supabase's PostgREST endpoint, reachable with the anon key that ships
--      inside the mobile app. With RLS OFF this path could read/write EVERY
--      user's rows. Enabling RLS closes it: the `anon` role gets no policy at
--      all (fully denied), and an `authenticated` user can touch only rows that
--      match their own auth.uid(). The app uses PostgREST only for auth, never
--      for these tables, so the app is unaffected.
--
-- `create policy` is not idempotent and schema.sql re-runs in full on every
-- `npm run migrate`, so each policy is dropped-if-exists first.
-- ---------------------------------------------------------------------------

alter table profiles            enable row level security;
alter table push_tokens         enable row level security;
alter table daily_metrics       enable row level security;
alter table raw_health_samples  enable row level security;
alter table workouts            enable row level security;
alter table daily_insights      enable row level security;

drop policy if exists profiles_own on profiles;
create policy profiles_own on profiles
  for all to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists push_tokens_own on push_tokens;
create policy push_tokens_own on push_tokens
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists daily_metrics_own on daily_metrics;
create policy daily_metrics_own on daily_metrics
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists raw_health_samples_own on raw_health_samples;
create policy raw_health_samples_own on raw_health_samples
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists workouts_own on workouts;
create policy workouts_own on workouts
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists daily_insights_own on daily_insights;
create policy daily_insights_own on daily_insights
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Public contact-form submissions (landing page). Written only by the backend (direct
-- DATABASE_URL connection, which bypasses RLS); no user_id. RLS is enabled with no policy
-- so the anon/authenticated Supabase API cannot read these messages.
create table if not exists contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  message text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
alter table contact_messages enable row level security;
