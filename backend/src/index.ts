// Express app entry point: mounts all API routes and middleware, and starts the in-process hourly insights cron
import "dotenv/config";
// Patches Express 4's Router so a rejected async handler is forwarded to the error middleware
// below instead of becoming an unhandled promise rejection (which, on modern Node, would leave
// the request hanging and can crash the process). MUST be imported before any route module so
// the patch is in place when their routers are created.
import "express-async-errors";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import cron from "node-cron";
import { pool } from "./db";
import { runHourlyInsightsCheck } from "./insights/hourly-job";
import { requireAuth } from "./middleware/auth";
import { requireCloudflareOrigin } from "./middleware/require-cloudflare-origin";
import healthDataRouter from "./routes/health-data";
import dailyMetricsRouter from "./routes/daily-metrics";
import dailyActualsRouter from "./routes/daily-actuals";
import profileRouter from "./routes/profile";
import pushTokenRouter from "./routes/push-token";
import dailyInsightsRouter from "./routes/daily-insights";
import workoutsRouter from "./routes/workouts";
import weightRouter from "./routes/weight";
import exportRouter from "./routes/export";
import accountRouter from "./routes/account";
import recoveryDetailRouter from "./routes/recovery-detail";
import sleepDetailRouter from "./routes/sleep-detail";
import stressIntradayRouter from "./routes/stress-intraday";
import dailyScoreIntradayRouter from "./routes/daily-score-intraday";
import activityIntradayRouter from "./routes/activity-intraday";
import strainRouter from "./routes/strain";
import coachRouter from "./routes/coach";
import bodyFatRouter from "./routes/body-fat";
import oxygenSaturationRouter from "./routes/oxygen-saturation";
import bodyTemperatureRouter from "./routes/body-temperature";
import contactRouter, { deleteOldContactMessages } from "./routes/contact";
import welcomeRouter from "./routes/welcome";
import caffeineRouter from "./routes/caffeine";
import airQualityRouter from "./routes/air-quality";
import longevityRouter from "./routes/longevity";
import legalRouter from "./routes/legal";

const app = express();

// In production the backend sits behind a single reverse proxy (Railway), so the
// real client IP that rate-limiting keys on comes from the first X-Forwarded-For
// hop, not the proxy itself. `1` = trust exactly one hop (the recommended value).
app.set("trust proxy", 1);

// Security headers — sensible defaults for a JSON API (HSTS, nosniff, frameguard, …).
app.use(helmet());

// Cloudflare-only origin lock (no-op unless REQUIRE_CLOUDFLARE_ORIGIN=true). Runs before
// cors/body-parsing so a direct hit to the raw Railway origin is rejected before any work.
app.use(requireCloudflareOrigin);

// Restrict CORS to the landing page (the only browser origin that calls this API — the native
// app sends no Origin header and is unaffected). Bearer-token auth means there are no ambient
// cookies to protect, but scoping origins keeps other sites' JS off the API.
app.use(cors({ origin: ["https://upvital.app", "https://www.upvital.app"] }));
// JSON bodies: 10 MB only for the Apple Health uploads (a backfill batch is thousands of samples);
// every other route — including the public /contact and /internal/welcome — gets 256 KB, so an
// anonymous client can't make the server parse megabytes. (256 KB still fits the coach's
// 60,000-character conversation cap even in multi-byte text.)
const UPLOAD_PATHS = new Set(["/health-samples/bulk", "/workouts/bulk"]);
const uploadJson = express.json({ limit: "10mb" });
const defaultJson = express.json({ limit: "256kb" });
app.use((req, res, next) => (UPLOAD_PATHS.has(req.path) ? uploadJson : defaultJson)(req, res, next));

// General backstop limiter: generous, just guards against runaway clients and
// scraping. `/health` is exempt so uptime monitors can poll it freely, and the
// bulk health-ingest routes are exempt because one legitimate Apple Health
// backfill is many requests — they get their own, higher, per-USER limiter
// inside health-data.ts (keyed by user id, not IP), applied after auth.
//
// The limit is high because the app's Home screen legitimately fires ~a dozen GETs
// per load; a single active session (open + navigate + pull-to-refresh) easily runs
// into the low hundreds, so a tight cap punished normal use. The genuinely costly
// routes (coach, ingest, contact) keep their own tighter, purpose-built limiters.
//
// Keyed by Cloudflare's CF-Connecting-IP (the true client IP — set authoritatively by
// Cloudflare, and the origin lock blocks any direct-origin bypass that would arrive
// without it), NOT req.ip. Behind Cloudflare→Railway, req.ip can resolve to a shared
// Cloudflare edge IP, which would collapse every user into one bucket. Falls back to
// req.ip for local/direct-origin dev where the CF header is absent. Same pattern the
// contact limiter uses below; ipKeyGenerator normalizes IPv6 to a subnet.
const INGEST_PATHS = new Set(["/health-samples/bulk", "/workouts/bulk", "/recompute"]);
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1500,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator((req.headers["cf-connecting-ip"] as string) || req.ip || "unknown"),
  skip: (req) => req.path === "/health" || INGEST_PATHS.has(req.path),
});
app.use(apiLimiter);

// The contact form is public and every message is emailed to the support inbox, so a flood
// would bury it (there's no auto-reply to the submitter, so it can't be used to mail others).
// Cap it hard — a handful per hour is plenty for real use. Key on Cloudflare's CF-Connecting-IP: it's the true client IP, Cloudflare sets it
// authoritatively (a client can't spoof it), and the origin lock blocks any direct-origin
// bypass that would arrive without it. ipKeyGenerator normalizes IPv6 to a subnet.
const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator((req.headers["cf-connecting-ip"] as string) || req.ip || "unknown"),
  message: { error: "Too many messages — please try again in a little while." },
});

app.use(healthDataRouter);
app.use(dailyMetricsRouter);
app.use(dailyActualsRouter);
app.use(profileRouter);
app.use(pushTokenRouter);
app.use(dailyInsightsRouter);
app.use(workoutsRouter);
app.use(weightRouter);
app.use(exportRouter);
app.use(accountRouter);
app.use(recoveryDetailRouter);
app.use(sleepDetailRouter);
app.use(stressIntradayRouter);
app.use(dailyScoreIntradayRouter);
app.use(activityIntradayRouter);
app.use(strainRouter);
app.use(coachRouter); // its own per-user limiter (Claude calls cost money) — see routes/coach.ts
app.use(bodyFatRouter);
app.use(oxygenSaturationRouter);
app.use(bodyTemperatureRouter);
app.use(caffeineRouter);
app.use(airQualityRouter);
app.use(longevityRouter);
app.use(legalRouter); // /privacy and /terms → redirect to the website (the only copy)
app.use("/contact", contactLimiter); // tight limit — /contact triggers outbound email
app.use(contactRouter); // public POST /contact (landing-page form)
app.use(welcomeRouter); // internal POST /internal/welcome (Supabase confirm trigger, secret-gated)

// Still round-trips the DB so the check is meaningful, but reports only reachability.
// The row's timestamp is deliberately NOT returned: this is the one route exempt from the
// Cloudflare origin lock, so anything it echoes is readable by anyone who finds the raw origin.
app.get("/health", async (_req, res) => {
  try {
    await pool.query("select 1");
    res.json({ status: "ok" });
  } catch (err) {
    console.error("health check failed:", err);
    res.status(500).json({ status: "error", message: "Internal server error" });
  }
});

app.get("/me", requireAuth, (req, res) => {
  res.json({ userId: req.userId });
});

// Central error handler — registered LAST so it catches everything the routes throw: a synchronous
// throw, an explicit next(err), or (via express-async-errors above) a rejected async handler. Many
// route handlers are async and don't try/catch; without this, a single DB hiccup on those routes
// would hang the request or crash the process. The real cause is logged server-side; the client
// only ever gets a generic message, so no stack trace or internal detail leaks regardless of NODE_ENV.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (res.headersSent) return;
  // The JSON body parser rejects a body that's too large (413) or isn't valid JSON (400) before
  // any route runs; answer with that status instead of a 500, and don't log it as a server error.
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status === "number" && status >= 400 && status < 500) {
    res.status(status).json({ error: status === 413 ? "Request too large" : "Bad request" });
    return;
  }
  console.error("Unhandled route error:", err);
  res.status(500).json({ error: "Internal server error" });
});

const port = process.env.PORT ? Number(process.env.PORT) : 3000;
app.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
});

// Daily-insight generation runs in-process on this always-on backend rather than a
// separate Railway Cron service, so it needs no dashboard setup. It fires at the top of
// every hour; runHourlyInsightsCheck() itself only acts on users whose LOCAL time is in the
// morning window and skips any day it has already generated, so a repeat run is harmless.
// Gated behind RUN_INSIGHTS_CRON so it never fires during local `npm run dev`.
if (process.env.RUN_INSIGHTS_CRON === "true") {
  cron.schedule("0 * * * *", () => {
    runHourlyInsightsCheck().catch((err) => console.error("Hourly insights job failed:", err));
  });
  // Daily retention clean-up (contact-form messages older than 12 months), off the top of the hour.
  cron.schedule("30 3 * * *", () => {
    deleteOldContactMessages().catch((err) => console.error("Contact clean-up failed:", err));
  });
  console.log("Schedulers enabled: hourly insights (0 * * * *), daily contact clean-up (30 3 * * *).");
}
