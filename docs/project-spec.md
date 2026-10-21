# Project Spec: UpVital

> The project vision and the decisions behind it. Refreshed 2026-10-07 to match the app as built
> (the first version, 2026-09-09, was written before any code). How it's built in detail:
> [`APP_OVERVIEW.md`](../APP_OVERVIEW.md).

## 1. What this is

**UpVital** is a personal health and fitness insight app. It reads what Apple Watch and iPhone already
record in Apple Health and turns it into daily scores, trends, a biological-age estimate and an
optional AI insight and coach, because Apple's own Health app has good data but little help making
sense of it.

It started from the concept of an app called **Century AI** (gauges, a daily score, "biological
age"), but aims to be honest: the scores are plain formulas, gimmick metrics are labelled as fun
estimates, and nothing is presented as medical advice.

## 2. Phases & audience

1. **Personal use** - done.
2. **TestFlight** - live (1.0.1 (1)); friends test privately.
3. **Public App Store release** - next: 1.0.1 (2), in **Kosovo and the EU**, published from Kosovo by
   an individual developer as a **non-trader** (free app).
4. **Future:** a paid tier (Premium). Not built; the Premium card in Profile is hidden until
   subscriptions exist. Switching to EU trader status comes with it.

## 3. Platform scope

- **iPhone only**, plus Home Screen widgets and an Apple Watch app with complications (they read the
  latest scores from a shared App Group).
- **Android: maybe later**, via Health Connect. The HealthKit code sits behind one adapter
  (`mobile/lib/health/healthkit-adapter.ts`), so scoring, the AI pipeline and the database are
  platform-neutral; Android would mean a second adapter, not a rework.

## 4. Screens

1. **Home** - Daily Score hero, Recovery / Sleep / Stress, goals, biological age and pace of aging, air
   quality, today's AI insight, share card.
2. **Health** - Recovery and Sleep cards, heart rate and HRV, blood oxygen, body temperature, body fat.
3. **Activity** - steps, active energy, day strain (0-21), workouts with full detail.
4. **Coach** - "Today's focus" (local suggestions) plus the AI insight and chat, when AI is on.
5. **Profile** - grouped list: Password, Email, Data & privacy, Apple Health, notifications, Daily
   insight time, AI insights & Coach, Units (metric / imperial per type), Personal info, Goals,
   Caffeine log; Privacy Policy and Terms links.
6. **Detail sheets** - Recovery, Sleep, Stress, caffeine window, air quality, body fat, biological age,
   trends (all-time, zoomable).

## 5. Data sources

From Apple Health (read-only; UpVital never writes to Health): sleep (with stages), heart rate,
HRV, resting heart rate, blood oxygen, body temperature, steps, active energy, workouts, body weight,
body fat and date of birth. Entered in the app: caffeine log, height, goals, display name.
Approximate location (only for air quality, not stored). Weight comes from Apple Health only; manual
weight logging was removed.

**History on connect:** the user chooses **Last 60 days** (pre-selected) or **Full history** (~2 years);
the rest can be imported later from Profile → Apple Health. Heart rate is capped to the last 35 days
(high volume, and only feeds short baselines). Syncing continues by itself whenever the app is open,
plus background delivery and a background task. Each sync uploads what's new in Apple Health since
the last one (HealthKit anchors), including records another app wrote late, up to 30 days back.

## 6. Scores and AI

- **Scores** (0-100, higher is always better; `backend/src/scoring/`):
  - **Recovery** = 70% HRV vs. a 60-day personal baseline + 20% resting HR (inverted) + 10% Sleep.
  - **Sleep** = 35% duration + 30% efficiency + 20% deep/REM share + 15% bedtime consistency (14 days).
    Overlapping sleep records (two sleep apps, or one that rewrote its records) count once.
  - **Stress** = 60% daytime HR vs. a 30-day baseline + 40% training load vs. a 60-day baseline,
    scored so calmer is higher.
  - **Daily Score** = 40% Recovery + 35% Sleep + 25% Stress.
  - **Day strain** (0-21) - an UpVital heuristic from time in heart-rate zones; not comparable to
    other apps' strain.
- **Biological age** - a fun estimate: the 60-day HRV baseline against commonly cited age-decade HRV
  averages, shifting the real age by at most ±8 years. **Pace of aging** - the trend of that estimate
  over 60 days (1.0x = same as calendar time).
- **AI (opt-in)** - Claude Haiku 4.5 (`claude-haiku-4-5`, don't change it) via the Anthropic API:
  - a **daily insight** at the hour the user picks (local time, default 07:00) about last night's
    sleep, this morning's recovery and yesterday's stress, with a push; it waits up to 3 hours for
    the night's sleep to sync;
  - a **coach chat** grounded in the user's last 7 days.
  - Only for users who switch on **AI insights & Coach** (off by default; GDPR explicit consent and
    App Store guideline 5.1.2(i)). Without it nothing is sent to Anthropic.

## 7. Accounts and auth

- **Supabase Auth**: email/password (8+ characters with a letter and a number; changing it needs the
  current password) and **Sign in with Apple**. Reset links use PKCE (they only work on the phone that
  asked). Sign-up doesn't reveal whether an email already has an account.
- The Express backend verifies the Supabase JWT on every request; per-user data isolation (Supabase
  row-level security plus `user_id` checks). No cross-user features.

## 8. Privacy and data control

- In the app: **Export my data** (JSON), **Delete my data** (keeps the account), **Delete my account**
  (everything; Apple-ID accounts also get their Sign in with Apple link revoked), **Disconnect Apple
  Health**, **AI insights & Coach** switch, notifications switch.
- Health data is stored by Supabase in the EU (Ireland). No ads, no tracking, no analytics.
- Legal pages live only on the website (`web/privacy.html`, `web/terms.html`).

## 9. Design

UpVital's own design system (`mobile/lib/theme/`): brand green, per-metric colours, **dark-only**
(no light mode, owner's decision 2026-10-07; the widget is dark too), grey text, links and buttons at 4.5:1 contrast or more,
VoiceOver labels and announcements, reduced-motion support. The Century AI screenshots were the starting reference only.

## 10. Tech stack

| Layer | Choice |
|---|---|
| App | React Native 0.86 + Expo SDK 57, expo-router; built and archived locally in Xcode (no EAS). HealthKit via `@kingstinct/react-native-healthkit`. Native Swift widget + Watch app. |
| Backend | Node/Express on Railway (`api.upvital.app`, behind Cloudflare), deployed with `railway up` from `backend/`. |
| Database / auth | Supabase (Postgres + Auth), EU (Ireland). |
| AI | Anthropic API, Claude Haiku 4.5. |
| Email | Resend (sending domain `send.upvital.app`, EU). |
| Push | Straight to Apple (APNs over HTTP/2) with the team's Apple key; no third-party push service. |
| Website | Static `web/` on Cloudflare Pages (`upvital.app`), self-hosted fonts, Turnstile on the contact form. |

## 11. Roles

- **Claude** writes the code, reviews, audits and keeps the trackers current; changes stay local until
  the owner says to commit.
- **The owner** runs git (merges), Railway deploys, Supabase/Apple/App Store Connect settings, website
  uploads, and all on-device testing.

## 12. Running cost (approx.)

Apple Developer Program $99/yr; Supabase free tier to ~$25/mo; Railway ~$5-10/mo; Anthropic a few
dollars a month at small scale (Haiku, opt-in only); Resend and Cloudflare free tiers. No EAS.

## 13. Open / later

- Paid tier (Premium, in-app subscriptions) and the switch to EU trader status.
- EU representative (GDPR Art. 27) for the EU launch: postponed by the owner.
- Android via Health Connect.
- Friends / sharing features (never designed).
- Cloudflare Web Analytics on the website.
