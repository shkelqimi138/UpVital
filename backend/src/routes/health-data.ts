// API routes to bulk-upload Apple Health samples and workouts and trigger score recompute
import { Router } from "express";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import type { PoolClient } from "pg";
import { pool } from "../db";
import { checkBatch, validSample, validWorkout, withoutDeviceDetails } from "../lib/health-validation";
import { isYmd } from "../lib/validate";
import { requireAuth } from "../middleware/auth";
import { computeForDateRange } from "../scoring";

const router = Router();

// A single Apple Health backfill (~2 years) is legitimately dozens of chunked bulk
// requests, which would trip the app-wide general limiter (that one is exempted
// for these paths — see INGEST_PATHS in index.ts). This limiter guards the ingest routes
// instead, keyed by USER id rather than IP: fairer on shared networks, and it still caps a
// runaway client. 1200/15min leaves generous headroom for the largest real backfill.
// Applied AFTER requireAuth so req.userId is set; falls back to IP if it somehow isn't.
const ingestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1200,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.userId ?? ipKeyGenerator(req.ip ?? "unknown"),
  message: { error: "Too many requests — please slow down and try again shortly." },
});

// Insert rows in multi-row statements rather than one query per row. The first
// Apple Health sync imports ~2 years of history (tens of thousands of samples);
// one-INSERT-per-row meant thousands of sequential round-trips per request, which
// ran long enough to hit Postgres's statement timeout and stall the mobile client.
// Batching collapses that to a handful of statements. `rowSql(base)` builds one
// row's placeholder tuple starting at parameter $base+1; `rows` are the flattened
// params per row (in the same column order).
const INSERT_BATCH = 1000;

// Drop rows that repeat a source_uuid within the same request. `on conflict` only
// sees rows already committed, not other rows of the same multi-row INSERT, so a
// duplicate inside one statement would raise a cardinality error. Rows without a
// uuid are kept as-is (the constraint treats NULLs as distinct, matching the
// previous row-by-row behaviour).
function dedupeByUuid<T extends { sourceUuid?: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!item.sourceUuid) return true;
    if (seen.has(item.sourceUuid)) return false;
    seen.add(item.sourceUuid);
    return true;
  });
}

async function batchInsert(
  client: PoolClient,
  head: string,
  tail: string,
  rows: unknown[][],
  rowSql: (base: number) => string,
): Promise<number> {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    const batch = rows.slice(i, i + INSERT_BATCH);
    const params: unknown[] = [];
    const tuples: string[] = [];
    for (const row of batch) {
      tuples.push(rowSql(params.length));
      params.push(...row);
    }
    const result = await client.query(`${head}${tuples.join(", ")}${tail}`, params);
    inserted += result.rowCount ?? 0;
  }
  return inserted;
}

function dateRangeOf(
  items: Array<{ startDate: string; endDate: string }>,
): { start: string; end: string } | null {
  if (items.length === 0) return null;
  let min = items[0].startDate;
  let max = items[0].endDate;
  for (const item of items) {
    if (item.startDate < min) min = item.startDate;
    if (item.endDate > max) max = item.endDate;
  }
  return { start: min.slice(0, 10), end: max.slice(0, 10) };
}

router.post("/health-samples/bulk", requireAuth, ingestLimiter, async (req, res) => {
  const parsed = checkBatch(req.body?.samples, "samples", validSample);
  if ("error" in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const samples = parsed.items;

  const client = await pool.connect();
  try {
    await client.query("begin");
    const inserted = await batchInsert(
      client,
      `insert into raw_health_samples (user_id, data_source, sample_type, value, unit, start_date, end_date, source_uuid) values `,
      ` on conflict (user_id, data_source, source_uuid) do nothing`,
      dedupeByUuid(samples).map((s) => [
        req.userId,
        s.sampleType,
        s.value,
        s.unit,
        s.startDate,
        s.endDate,
        s.sourceUuid ?? null,
      ]),
      (b) => `($${b + 1}, 'healthkit', $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7})`,
    );
    await client.query("commit");

    // The mobile background backfill sends recompute:false so it can insert its ~2 years
    // of history cheaply, then triggers one recompute over the whole span via /recompute.
    // Foreground syncs omit the flag (undefined) and recompute inline as before.
    const range = dateRangeOf(samples);
    if (range && req.body?.recompute !== false) {
      await computeForDateRange(req.userId!, range.start, range.end);
    }

    res.json({ received: samples.length, inserted });
  } catch (err) {
    await client.query("rollback");
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
});

router.post("/workouts/bulk", requireAuth, ingestLimiter, async (req, res) => {
  const parsed = checkBatch(req.body?.workouts, "workouts", validWorkout);
  if ("error" in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const workouts = parsed.items;

  const client = await pool.connect();
  try {
    await client.query("begin");
    const inserted = await batchInsert(
      client,
      `insert into workouts (user_id, data_source, workout_type, start_date, end_date, duration_seconds, calories, avg_heart_rate, max_heart_rate, raw_data, source_uuid) values `,
      ` on conflict (user_id, data_source, source_uuid) do nothing`,
      dedupeByUuid(workouts).map((w) => [
        req.userId,
        w.workoutType,
        w.startDate,
        w.endDate,
        w.durationSeconds ?? null,
        w.calories ?? null,
        w.avgHeartRate ?? null,
        w.maxHeartRate ?? null,
        w.raw ? JSON.stringify(withoutDeviceDetails(w.raw)) : null,
        w.sourceUuid ?? null,
      ]),
      (b) =>
        `($${b + 1}, 'healthkit', $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7}, $${b + 8}, $${b + 9}, $${b + 10})`,
    );
    await client.query("commit");

    const range = dateRangeOf(workouts);
    if (range && req.body?.recompute !== false) {
      await computeForDateRange(req.userId!, range.start, range.end);
    }

    res.json({ received: workouts.length, inserted });
  } catch (err) {
    await client.query("rollback");
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
});

// Recompute daily scores for a date range without ingesting new samples. The mobile
// background backfill calls this once (in bounded windows) after uploading its history
// with recompute:false, so the ~2-year import isn't recomputed 35 times chunk-by-chunk.
const MAX_RECOMPUTE_DAYS = 800;

router.post("/recompute", requireAuth, ingestLimiter, async (req, res) => {
  const from = req.body?.from;
  const to = req.body?.to;
  if (!isYmd(from) || !isYmd(to)) {
    res.status(400).json({ error: "Expected { from, to } as YYYY-MM-DD" });
    return;
  }
  // The app recomputes in <=90-day chunks; anything past ~2 years of history is not a real request.
  const spanDays = (Date.parse(to) - Date.parse(from)) / 86_400_000;
  if (spanDays < 0 || spanDays > MAX_RECOMPUTE_DAYS) {
    res.status(400).json({ error: `from must be on or before to, at most ${MAX_RECOMPUTE_DAYS} days apart` });
    return;
  }
  try {
    await computeForDateRange(req.userId!, from, to);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
