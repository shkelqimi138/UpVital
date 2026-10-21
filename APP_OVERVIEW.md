# UpVital — App Overview

A complete description of what UpVital is, what it does, how it's built, and where it stands.
Written to be understood on its own. For how to run and build it, see [`README.md`](README.md).

---

## 1. Purpose

UpVital turns a person's **Apple Health** data into a daily **longevity snapshot**. Each morning it
computes four scores — **Recovery, Sleep, Stress, and an overall Daily score** — from metrics like
sleep stages, heart rate, HRV, resting heart rate, and activity, then adds a personalized daily
insight and an AI health coach the user can chat with. It also estimates **biological age** and
**pace of aging**, and surfaces body composition, caffeine load, and local air quality.

It is **iPhone-only** (HealthKit is the core data source; plus a widget and an Apple Watch app) and
currently in **TestFlight beta**, being prepared for App Store submission.

---

## 2. Core features

- **Daily scores** — Recovery / Sleep / Stress / Daily, shown as ring gauges on the dashboard with
  band labels (e.g. "Optimal", "Good") and a "+N vs 7-day average" comparison.
- **Score detail sheets** — tap any score for the breakdown (contributing metrics, trends, a
  "today" marker on the chart).
- **Biological age & pace of aging** — an estimate derived from health metrics vs chronological age.
- **Health overview tiles** — heart rate, HRV, steps, active calories, blood oxygen, body temp.
- **Goals** — daily step, nightly sleep, and daily active-energy goals, tracked against actuals.
- **AI daily insight** — a short Claude-generated readout at the hour the user picks (local time,
  default 07:00): last night's sleep and this morning's recovery, plus yesterday's stress. It waits
  up to 3 hours for the night's sleep to sync; the push shows its first sentence or two.
- **AI coach** — a chat interface backed by Claude for health questions.
- **AI opt-in** — the insight and the coach only run for users who switched on *AI insights & Coach* (`profiles.ai_consent`, off by default; asked on the Apple Health sheet, in Profile and on the Coach screens). Without it nothing is sent to Anthropic.
- **Caffeine tracking** — logged intake with a half-life decay model ("active mg" now).
- **Air quality** — local AQI via device location.
- **Streaks** — consecutive scored days, with a one-day grace.
- **iOS Home Screen widgets** (S/M/L) and an **Apple Watch app + complications**, sharing the
  latest scores through an App Group.
- **Account** — email/password (with confirmation + CAPTCHA) and Sign in with Apple; profile,
  caffeine logging, data export, delete account.
- **Profile settings** — an iOS-style grouped list (Your account / App settings / Preferences)
  with a page per item (`app/profile/*`). **Units** (kg/lb, cm/ft-in, kcal/kJ, °C/°F) are saved on
  the device per account (`lib/preferences.ts`); data stays
  metric and is converted only on screen (`lib/units.ts`). **Daily insight time** (any hour) is
  saved on the server (`profiles.insight_hour`).

---

## 3. Tech stack

**Mobile app** (`mobile/`)
- Expo SDK 57, React Native 0.86, **New Architecture** (bridgeless), TypeScript. Built with Xcode 27
  (iOS 27 SDK), which requires the **UIScene life cycle** — `SceneDelegate.swift` uses Expo's
  `ExpoAppSceneDelegate` (never `expo prebuild --clean`, it would drop it).
- **expo-router v57** — file-based routing; auth vs tabs gated by `Stack.Protected` guards.
- **@kingstinct/react-native-healthkit** (Nitro module) — HealthKit reads + background delivery.
- **@shopify/react-native-skia** — all ring gauges, charts, and the share card (iOS-only visuals).
- **Supabase JS** — auth; access tokens stored in the **iOS Keychain** (`expo-secure-store`).
- **@gorhom/bottom-sheet**, gesture-handler, AsyncStorage (offline cache), Cloudflare **Turnstile**
  CAPTCHA (WebView).
- Native **WidgetKit** extension + **Watch app** + complications (Swift), App Group
  `group.com.upvital.app`.

**Backend** (`backend/`)
- Node + **Express**, TypeScript, **node-postgres** (`pg`) pool against **Supabase Postgres**.
- **Anthropic SDK** — `claude-haiku-4-5` for the coach and daily insights (do not change the model).
- **Resend** — transactional email (welcome-on-confirm, account notices, contact-form forward to support).
- **node-cron** — in-process hourly insights job (gated by `RUN_INSIGHTS_CRON=true`).
- `helmet`, `cors`, `express-rate-limit`, `express-async-errors`.

**Infrastructure**
- **Railway** — backend host. Deploy with `railway up` from `backend/`.
- **Cloudflare** — DNS/proxy + Pages. `upvital.app` (landing + legal pages) and `api.upvital.app`
  (proxied → Railway, origin-locked). SSL Full-strict.
- **Supabase** — auth (email confirm, CAPTCHA, disposable-email hook) + Postgres with **RLS**.
- **OpenWeather** — air quality. **Cloudflare Turnstile** — signup/login CAPTCHA.

**Marketing site** (`web/`) — a self-contained static site (landing, `/privacy`, `/terms`,
`/confirmed`) on Cloudflare Pages. Not part of the app runtime. `web/privacy.html` and
`web/terms.html` are the **only copy** of the policy and terms: the landing-page popups load them,
the app links to them (sign-up + Profile footer), and the API's old `/privacy` + `/terms` redirect there.

---

## 4. Architecture & data flow

1. **Auth** — Supabase email/password (confirmation + Turnstile) or Sign in with Apple. The app
   holds a Supabase session; the backend authenticates every request by the Bearer access token
   (`middleware/auth.ts` → `req.userId`). Tokens live in the Keychain; auto-refresh on foreground.
2. **Health ingest** — on device, the HealthKit adapter (`mobile/lib/health/`) reads samples +
   workouts and pushes them to the backend bulk endpoints. Connect imports a recent window first
   (fast first scores), then a resumable ~2-year backfill streams in the background. Every later
   sync uses HealthKit **anchored queries**: it uploads what's new in Apple Health since the last
   sync, whatever date it carries, so data that lands late (e.g. Fitbit sleep written hours after
   waking) isn't skipped. "Delete my data" resets the anchors, so the next sync re-imports. The backend
   validates payloads (`lib/health-validation.ts`) and stores raw samples/workouts.
3. **Scoring** — server-side and per-user (`backend/src/scoring/`). Day bucketing is
   **timezone-aware** (keys off `profiles.timezone`). Produces the daily metrics rows (Recovery /
   Sleep / Stress / Daily) plus biological age and pace of aging.
4. **Reads** — the app fetches computed metrics, daily actuals, and per-detail series through ~26
   feature route files. **Every** mobile → backend call goes through `mobile/lib/api/client.ts`
   (`apiGet`/`apiSend`): auth header, request timeout, friendly error mapping, and a **per-user
   offline cache** (AsyncStorage, 14-day TTL) so Airplane Mode shows last-synced scores instead of a
   blank screen. No screen calls `fetch` directly.
5. **Insights & push** — an in-process hourly job generates each user's daily Claude insight from
   their chosen **local** hour (`profiles.insight_hour`), waiting up to 3 hours for last night's
   sleep, saves it under that day, and sends the push straight to Apple (APNs, HTTP/2, the team's Apple key in Railway; no Expo push service).
6. **Coach** — `/coach` proxies a Claude chat, on a tighter per-user rate limit (it spends tokens).
7. **Widgets / Watch** — the app writes the latest scores to the App Group; the WidgetKit extension
   and Watch complications read from it.
8. **Email** — welcome-on-confirm (Supabase auth hook → `/internal/welcome`) and the contact form
   forwarded to the support inbox (no auto-reply to the sender), both via Resend. The contact form
   also stores to the DB.

**Security posture** — per-user Postgres RLS; Cloudflare-only origin lock on the API; helmet/HSTS;
IP + per-user rate limiters; DB TLS verification (CA-pinned); disposable-email block; three
transitive-CVE patches applied in-tree via `patch-package`, and `audit:check` gates CI (one guarded
accepted risks: node-forge in the Expo CLI and braces in build tools, no fixed release). Full history in `git log`.

**Accessibility** — VoiceOver labels on icon-only controls; form and load messages are spoken
(`lib/hooks/announce.ts`); Dynamic Type caps on fixed-size numerals; Reduce Motion respected; named
status colors (`colors.status`).

---

## 5. Repository layout

```
mobile/     Expo Router iOS app (app/, lib/, components/, ios/ native project + widget/watch targets)
backend/    Express API (src/routes ~26 features, src/scoring, src/insights, src/lib, src/middleware; db/schema.sql + db/hooks)
web/        Static marketing + legal site (Cloudflare Pages)
docs/       Reference specs (project-spec.md = product spec + approved scoring formulas)
```

---

## 6. Current status

In TestFlight beta and being prepared for App Store submission (Kosovo + EU). The backend
(Railway), database (Supabase) and marketing site (Cloudflare Pages) are live.
