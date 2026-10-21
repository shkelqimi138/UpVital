# UpVital

Turn Apple Health data into a daily longevity snapshot: Recovery, Sleep, Stress and an overall Daily
score, a biological-age estimate, an opt-in AI insight and an AI coach.

Website: [upvital.app](https://upvital.app). iOS app, App Store release in preparation.

## About

UpVital is an iOS app that reads the metrics Apple Watch and iPhone already record in Apple Health and
turns them into daily scores, trends and a biological-age estimate. Scores are computed server-side
from sleep, heart rate, HRV, resting heart rate and activity. An optional, opt-in AI layer adds a short
daily insight delivered by push and a coach chat grounded in the user's recent data.

## Features

- Daily Recovery, Sleep, Stress and overall Daily scores as ring gauges, with a 7-day comparison
- Score detail sheets with the contributing metrics and trends
- Biological-age and pace-of-aging estimate
- Health tiles (heart rate, HRV, blood oxygen, body temperature, body fat) and activity (steps,
  active energy, day strain, workouts)
- Opt-in AI daily insight by push and an AI coach chat
- Caffeine tracking with a half-life decay model, and local air quality
- iOS Home Screen widgets and an Apple Watch app with complications
- Email/password and Sign in with Apple, data export, and account deletion

## Tech stack

Mobile: Expo SDK 57, React Native 0.86, TypeScript, expo-router, Skia, `@kingstinct/react-native-healthkit`.
Backend: Node, Express, TypeScript, node-postgres.
Data and auth: Supabase (Postgres and Auth, row-level security).
AI: Anthropic Claude (Haiku), opt-in only.
Infrastructure: Railway (API), Cloudflare (DNS and Pages), Resend (email).

## Getting started

```bash
# Prerequisites: Node.js 22, a Supabase project, and (to build the app) macOS with Xcode 27.

# Backend API
cd backend
npm install
cp .env.example .env     # fill in DATABASE_URL, SUPABASE_URL, SUPABASE_SECRET_KEY and any optional keys
npm run dev              # health check at http://localhost:3000/health

# iOS app (the backend must be reachable from the phone)
cd ../mobile
npm install
cp .env.example .env     # fill in the EXPO_PUBLIC_* values
npx expo run:ios --device
```

Do not run `expo prebuild --clean`: the native project carries hand-written files it would drop.

## Scripts

Run from the repository root:

| Command | Description |
| --- | --- |
| `npm test` | Backend and mobile unit tests plus the dependency-audit gate |
| `npm run lint` | ESLint across backend and mobile |
| `npm run format` | Format the TypeScript sources with Prettier |
| `npm run format:check` | Verify formatting without writing |

## License and author

All rights reserved. This source is published for portfolio and reference purposes and is not licensed
for reuse or redistribution.

Shkelqim Surkishi - [GitHub](https://github.com/shkelqimi138) - [Portfolio](https://www.shkelqim.me) - [LinkedIn](https://www.linkedin.com/in/shkelqimsurkishi)
