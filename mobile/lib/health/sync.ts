// Apple Health connection and sync: imports samples and workouts and uploads them to the backend
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";
import { apiSend, ApiError } from "../api/client";
import { getProfile, updateProfile } from "../api/profile";
import { supabase } from "../auth/supabase";
import { refreshWidgetNow } from "../widget";
import { healthAdapter } from "./index";
import { syncWindowStart } from "./sync-window";
import type { CommonHealthSample, CommonWorkout, SyncAnchors } from "./types";

// Connection + last-sync state is scoped per Supabase user id, so switching accounts on a
// shared device (e.g. a test account) doesn't inherit the previous user's "connected" flag
// or sync cursor — which showed a stale "Apple Health connected" with no data.
const CONNECTED_PREFIX = "health:connected:";
const LAST_SYNCED_PREFIX = "health:lastSyncedAt:";
// Where the last sync left off in Apple Health (a JSON map of data type -> HealthKit anchor), so
// the next sync gets exactly what was added since, including records dated in the past.
const ANCHORS_PREFIX = "health:anchors:";
// Set on connect to the older history still to import (a JSON {from, until}); removed once
// the background backfill finishes. Its presence lets an interrupted backfill resume.
const BACKFILL_PREFIX = "health:backfill:";

// The connect sheet's choice of how much history to import, per user: JSON {choice, from}, where
// `from` is the oldest day that import reaches. Absent for connections made before the choice
// existed — those imported the full history.
const HISTORY_PREFIX = "health:history:";

const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORICAL_IMPORT_DAYS = 730; // ~2 years back — "Full history"

/** How much older history to import on connect: the last 60 days (enough for the 60-day
 *  baselines behind the scores) or the full ~2 years. */
export type HistoryChoice = "60d" | "full";
const HISTORY_DAYS: Record<HistoryChoice, number> = { "60d": 60, full: HISTORICAL_IMPORT_DAYS };

function parseHistory(raw: string | null): { choice: HistoryChoice; from: string } | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    return (value?.choice === "60d" || value?.choice === "full") && typeof value.from === "string"
      ? value
      : null;
  } catch {
    return null;
  }
}
// On connect we import only this most-recent window synchronously, so scores appear in
// seconds instead of after the whole 2-year pull. The rest streams in via runBackfill().
const RECENT_WINDOW_DAYS = 30;

// Bumped whenever the sync position is reset (Delete my data, Disconnect). A sync or history import
// that started before the reset must not save its old position afterwards, which would undo the
// reset; each one checks this and starts over from the reset state instead.
let resetGeneration = 0;

function parseAnchors(raw: string | null): SyncAnchors {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

async function authedFetch(path: string, body: unknown) {
  // A backfill batch is thousands of samples; on a weak connection the upload itself can
  // outlast the default 20s cap, so this path gets a much longer one.
  await apiSend("POST", path, body, { timeoutMs: 120_000 });
}

// The first sync can import up to ~2 years of history, which for active users is tens of
// thousands of samples — far past the backend's 10 MB JSON body limit if sent as one
// request (returns HTTP 413). Upload in batches so every request stays small.
const UPLOAD_CHUNK = 5000;

// When `recompute` is false the backend only inserts and skips per-request score
// recomputation. The background backfill uses this so it doesn't fire ~35 recompute
// passes; it recomputes the whole backfilled span once at the end instead.
async function pushSamples(samples: CommonHealthSample[], opts?: { recompute?: boolean }) {
  // Sort by date before batching. The backend recomputes scores for each batch's
  // date range, so contiguous time-ordered batches keep that work ~linear; the raw
  // array is grouped by sample type (each spanning the full window), which would
  // otherwise make every batch re-trigger a full-history recompute. ISO date
  // strings sort chronologically.
  const sorted = [...samples].sort((a, b) =>
    a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0,
  );
  const recompute = opts?.recompute;
  for (let i = 0; i < sorted.length; i += UPLOAD_CHUNK) {
    await authedFetch("/health-samples/bulk", {
      samples: sorted.slice(i, i + UPLOAD_CHUNK),
      ...(recompute === false ? { recompute: false } : {}),
    });
  }
}

async function pushWorkouts(workouts: CommonWorkout[], opts?: { recompute?: boolean }) {
  const recompute = opts?.recompute;
  for (let i = 0; i < workouts.length; i += UPLOAD_CHUNK) {
    await authedFetch("/workouts/bulk", {
      workouts: workouts.slice(i, i + UPLOAD_CHUNK),
      ...(recompute === false ? { recompute: false } : {}),
    });
  }
}

export async function isConnected(): Promise<boolean> {
  const uid = await currentUserId();
  if (!uid) return false;
  return (await AsyncStorage.getItem(CONNECTED_PREFIX + uid)) === "true";
}

export async function getLastSyncedAt(): Promise<Date | null> {
  const uid = await currentUserId();
  if (!uid) return null;
  const raw = await AsyncStorage.getItem(LAST_SYNCED_PREFIX + uid);
  return raw ? new Date(raw) : null;
}

// Leaving the app freezes it (iOS): requests in flight then fail, and HealthKit can't be read at
// all while the phone is locked — and the first request after reopening can still hit a dropped
// connection. A sync or import step that fails that way is retried once UpVital is open again, so
// it picks itself back up without a "Sync now" tap. Real errors (server, auth) aren't retried, and
// a connection that keeps failing while the app stays open gives up after a few tries.
const ATTEMPTS_WHILE_OPEN = 3;
const RETRY_DELAYS_MS = [2_000, 5_000];

// Bumped each time the app leaves the foreground, so a retry can tell an interruption from an error.
let backgroundTransitions = 0;
AppState.addEventListener("change", (state) => {
  if (state !== "active") backgroundTransitions++;
});

function untilActive(): Promise<void> {
  if (AppState.currentState === "active") return Promise.resolve();
  return new Promise((resolve) => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        subscription.remove();
        resolve();
      }
    });
  });
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function retryWhenInterrupted(work: () => Promise<void>): Promise<void> {
  let failures = 0;
  for (;;) {
    const transitionsBefore = backgroundTransitions;
    try {
      await work();
      return;
    } catch (err) {
      const interrupted = backgroundTransitions !== transitionsBefore || AppState.currentState !== "active";
      const connectionDropped = err instanceof ApiError && (err.kind === "offline" || err.kind === "timeout");
      if (!interrupted && !connectionDropped) throw err;
      if (!interrupted && ++failures >= ATTEMPTS_WHILE_OPEN) throw err;
      await untilActive();
      await sleep(interrupted ? 1_500 : RETRY_DELAYS_MS[failures - 1]);
    }
  }
}

/** Uploads what's new and saves where it left off. Returns false, without saving, if the sync
 *  position was reset meanwhile (the caller then runs again from the reset state). */
async function pullAndPush(uid: string, lastSynced: Date | null, generation: number): Promise<boolean> {
  let anchors: SyncAnchors | null = null;
  if (healthAdapter.fetchChanges) {
    // Only what's new in Apple Health since the last sync, whatever date it carries: Fitbit, for
    // one, writes last night's sleep hours after waking, and a "since the last sync" date filter
    // skipped it for good. The first anchored sync (after connecting, or after updating the app)
    // reads the whole window, and the server skips what it already has.
    const saved = parseAnchors(await AsyncStorage.getItem(ANCHORS_PREFIX + uid));
    const changes = await healthAdapter.fetchChanges(saved, syncWindowStart(lastSynced, new Date()));
    await pushSamples(changes.samples);
    await pushWorkouts(changes.workouts);
    anchors = changes.anchors;
  } else {
    const since = lastSynced ?? new Date(Date.now() - RECENT_WINDOW_DAYS * DAY_MS);
    const [samples, workouts] = await Promise.all([
      healthAdapter.fetchSamples(since),
      healthAdapter.fetchWorkouts(since),
    ]);
    await pushSamples(samples);
    await pushWorkouts(workouts);
  }
  if (generation !== resetGeneration) return false;
  // Saved only after the upload, so anything that didn't make it is fetched again next time. One
  // write, issued right after the check, so a reset can't land between the two values.
  const position: [string, string][] = [[LAST_SYNCED_PREFIX + uid, new Date().toISOString()]];
  if (anchors) position.push([ANCHORS_PREFIX + uid, JSON.stringify(anchors)]);
  await AsyncStorage.multiSet(position);
  return true;
}

// Guards a rapid double-tap (or a re-tap after a slow first attempt) from launching a second
// concurrent connect within one app session. The persisted CONNECTED flag guards across launches.
let connectInProgress = false;

export async function connectAppleHealth(history: HistoryChoice): Promise<void> {
  if (connectInProgress) return;
  connectInProgress = true;
  try {
    await healthAdapter.requestPermissions();
    const uid = await currentUserId();
    const recentSince = new Date(Date.now() - RECENT_WINDOW_DAYS * DAY_MS);

    // 1. Persist "connected" + the backfill marker BEFORE the first import runs. If that import
    //    is interrupted (app suspended, connection drops), the app still remembers it's connected
    //    and what history is outstanding, so the ordinary foreground sync resumes it — instead of
    //    dropping back to a bare "Connect" button and a fresh full re-import on the next tap,
    //    which is what used to pile up requests and trip the rate limiter.
    if (uid) {
      await AsyncStorage.setItem(CONNECTED_PREFIX + uid, "true");
      const from = new Date(Date.now() - HISTORY_DAYS[history] * DAY_MS).toISOString();
      await AsyncStorage.setItem(
        BACKFILL_PREFIX + uid,
        JSON.stringify({ from, until: recentSince.toISOString() }),
      );
      await AsyncStorage.setItem(HISTORY_PREFIX + uid, JSON.stringify({ choice: history, from }));
    }

    // 2. Start the import without waiting for it, so the connect sheet closes as soon as iOS
    //    access is granted (uploading 30 days can take a minute). syncNow() pulls the last 30 days
    //    while nothing has synced yet, refreshes the widget, then streams the older history via
    //    the backfill; Profile → Apple Health follows its progress. It retries by itself after an
    //    interruption, and the next sync picks up anything still outstanding.
    void syncNow().catch(() => {});
    void prefillBirthdateFromHealth();

    // Ask iOS to wake us on new data from here on, so future syncs are near-instant instead of
    // waiting for the periodic background task. Best-effort — never blocks connect.
    void enableHealthBackgroundDelivery();
  } finally {
    connectInProgress = false;
  }
}

// The backfill in progress, shared: connectAppleHealth(), syncNow() and the background task all
// join the same run instead of starting a second one (and the background task can wait for it).
let backfillRun: Promise<void> | null = null;

const BACKFILL_WINDOW_DAYS = 90;

/** Import the older history recorded by the last connect, newest window first, recomputing
 *  each window as it lands. Durable + idempotent: the marker is shrunk after every committed
 *  window, so an interrupted run (app suspended, network drop) resumes from the last boundary
 *  instead of re-fetching and re-uploading the whole span — the behaviour that used to hammer
 *  the rate limiter. `on conflict do nothing` server-side makes any overlap a no-op. Each read
 *  is one bounded date window, so it's short enough to survive a brief backgrounding. */
function runBackfill(): Promise<void> {
  if (!backfillRun) {
    backfillRun = backfillOutstanding().finally(() => {
      backfillRun = null;
    });
  }
  return backfillRun;
}

async function backfillOutstanding(): Promise<void> {
  const uid = await currentUserId();
  if (!uid) return;
  // A reset mid-import (Delete my data, Disconnect) replaces or removes the marker: start over
  // from that instead of carrying on with, and saving progress for, the old one.
  for (;;) {
    const generation = resetGeneration;
    if (await importMarkedHistory(uid, generation)) return;
  }
}

/** Imports the history the marker describes. Returns false if the sync position was reset
 *  meanwhile, without touching the (new) marker. */
async function importMarkedHistory(uid: string, generation: number): Promise<boolean> {
  const raw = await AsyncStorage.getItem(BACKFILL_PREFIX + uid);
  if (!raw) return true;

  const marker = JSON.parse(raw) as { from: string; until: string };
  const fromDate = new Date(marker.from);
  let untilDate = new Date(marker.until);

  while (untilDate > fromDate) {
    const windowStart = new Date(
      Math.max(fromDate.getTime(), untilDate.getTime() - BACKFILL_WINDOW_DAYS * DAY_MS),
    );

    const windowEnd = untilDate;
    await retryWhenInterrupted(async () => {
      const [samples, workouts] = await Promise.all([
        healthAdapter.fetchSamples(windowStart, windowEnd),
        healthAdapter.fetchWorkouts(windowStart, windowEnd),
      ]);
      // Re-sending a chunk after an interruption is safe: the server skips rows it already has.
      await pushSamples(samples, { recompute: false });
      await pushWorkouts(workouts, { recompute: false });
      await recomputeRange(windowStart.toISOString().slice(0, 10), windowEnd.toISOString().slice(0, 10));
    });
    if (generation !== resetGeneration) return false;

    // Window committed — shrink the marker so a resume skips it. Cleared entirely once the
    // whole span is done.
    untilDate = windowStart;
    if (untilDate > fromDate) {
      await AsyncStorage.setItem(
        BACKFILL_PREFIX + uid,
        JSON.stringify({ from: marker.from, until: untilDate.toISOString() }),
      );
    }
  }

  await AsyncStorage.removeItem(BACKFILL_PREFIX + uid);
  return true;
}

/** Imports any outstanding older history and resolves when it's done (rejects if it fails). The
 *  background task awaits this so iOS keeps the app running while it works; progress is saved
 *  window by window, so an early stop loses nothing. */
export function finishHistoryImport(): Promise<void> {
  return runBackfill();
}

/** Whether older history is still waiting to be imported (it only moves while the app runs). */
export async function isHistoryImporting(): Promise<boolean> {
  const uid = await currentUserId();
  if (!uid) return false;
  return (await AsyncStorage.getItem(BACKFILL_PREFIX + uid)) !== null;
}

/** True when this user connected with "Last 60 days" and that import has finished — the Apple
 *  Health page then offers "Import full history". */
export async function canImportFullHistory(): Promise<boolean> {
  const uid = await currentUserId();
  if (!uid) return false;
  const [connected, history, pending] = await Promise.all([
    AsyncStorage.getItem(CONNECTED_PREFIX + uid),
    AsyncStorage.getItem(HISTORY_PREFIX + uid),
    AsyncStorage.getItem(BACKFILL_PREFIX + uid),
  ]);
  // Not while an import is still running: a second marker would race the one in progress.
  if (connected !== "true" || pending) return false;
  return parseHistory(history)?.choice === "60d";
}

/** Imports the rest of the history (back to ~2 years) for a user who connected with "Last 60
 *  days". Same durable background backfill as connect — resumes if the app is closed. */
export async function importFullHistory(): Promise<void> {
  const uid = await currentUserId();
  if (!uid) return;
  const stored = parseHistory(await AsyncStorage.getItem(HISTORY_PREFIX + uid));
  const from = new Date(Date.now() - HISTORICAL_IMPORT_DAYS * DAY_MS).toISOString();
  const until = stored?.from ?? new Date(Date.now() - HISTORY_DAYS["60d"] * DAY_MS).toISOString();
  await AsyncStorage.setItem(BACKFILL_PREFIX + uid, JSON.stringify({ from, until }));
  await AsyncStorage.setItem(HISTORY_PREFIX + uid, JSON.stringify({ choice: "full", from }));
  void runBackfill().catch(() => {});
}

/** After "Delete my data": forget where syncing left off, so the next sync imports the last 30
 *  days again and the older history (as far back as the user chose on connect) streams in after
 *  it. Without this the sync only fetched what's new, and the deleted history never came back. */
export async function reimportAfterWipe(): Promise<void> {
  const uid = await currentUserId();
  if (!uid) return;
  if ((await AsyncStorage.getItem(CONNECTED_PREFIX + uid)) !== "true") return;
  const history = parseHistory(await AsyncStorage.getItem(HISTORY_PREFIX + uid));
  const from = history?.from ?? new Date(Date.now() - HISTORICAL_IMPORT_DAYS * DAY_MS).toISOString();
  resetGeneration++; // a sync or import already running must not save its old position back
  await AsyncStorage.multiRemove([LAST_SYNCED_PREFIX + uid, ANCHORS_PREFIX + uid]);
  await AsyncStorage.setItem(
    BACKFILL_PREFIX + uid,
    JSON.stringify({ from, until: new Date(Date.now() - RECENT_WINDOW_DAYS * DAY_MS).toISOString() }),
  );
  // Joins a sync that's already running (it then runs again from the reset state); the sync
  // starts the history import when it's done, and an import already running restarts itself.
  void syncNow().catch(() => {});
}

const RECOMPUTE_CHUNK_DAYS = 90;

/** Recompute daily scores over [fromDate, toDate] in <=90-day windows (dates as YYYY-MM-DD). */
async function recomputeRange(fromDate: string, toDate: string): Promise<void> {
  let start = new Date(fromDate + "T00:00:00.000Z");
  const end = new Date(toDate + "T00:00:00.000Z");
  while (start <= end) {
    const chunkEnd = new Date(Math.min(start.getTime() + (RECOMPUTE_CHUNK_DAYS - 1) * DAY_MS, end.getTime()));
    await authedFetch("/recompute", {
      from: start.toISOString().slice(0, 10),
      to: chunkEnd.toISOString().slice(0, 10),
    });
    start = new Date(chunkEnd.getTime() + DAY_MS);
  }
}

/** If Apple Health exposes a date of birth and the user hasn't set one, save it to the
 *  profile (it drives the biological-age estimate). Best-effort — never blocks connect. */
async function prefillBirthdateFromHealth(): Promise<void> {
  try {
    const dob = await healthAdapter.fetchDateOfBirth?.();
    if (!dob) return;
    const profile = await getProfile();
    if (!profile.birthdate) await updateProfile({ birthdate: dob });
  } catch {
    // ignore — birthdate stays manually editable in Profile
  }
}

// The sync in progress, shared like the backfill: the app reopening, the Health observer, the
// background task and the Sync now button all join one run instead of stacking uploads.
let syncRun: Promise<void> | null = null;

/** Whether a sync is running right now (started by connect, the app reopening, the background
 *  task or Sync now) — so a screen can follow it with syncNow(), which joins the running one. */
export function isSyncInProgress(): boolean {
  return syncRun !== null;
}

/** Incremental sync: what's new in Apple Health since the last one. No-ops if Apple Health hasn't been connected yet. */
export function syncNow(): Promise<void> {
  if (!syncRun) {
    syncRun = syncOnce().finally(() => {
      syncRun = null;
    });
  }
  return syncRun;
}

async function syncOnce(): Promise<void> {
  const uid = await currentUserId();
  if (!uid) return;
  // Runs again when the sync position was reset meanwhile (Delete my data, Disconnect): from the
  // cleared position, or not at all once disconnected.
  for (let saved = false; !saved;) {
    const generation = resetGeneration;
    if ((await AsyncStorage.getItem(CONNECTED_PREFIX + uid)) !== "true") return;
    const lastSyncedRaw = await AsyncStorage.getItem(LAST_SYNCED_PREFIX + uid);
    const lastSynced = lastSyncedRaw ? new Date(lastSyncedRaw) : null;
    await retryWhenInterrupted(async () => {
      saved = await pullAndPush(uid, lastSynced, generation);
    });
  }
  // Refresh the Home Screen widget with today's freshly-recomputed scores (the Home
  // screen may not be mounted — e.g. a background/foreground-triggered sync).
  void refreshWidgetNow();
  // Resume a backfill that an earlier connect left unfinished (app closed mid-import).
  void runBackfill().catch(() => {});
}

let bgDeliveryConfigured = false;

/** Fully reset the Health connection for the current user: clears the "connected" flag, the
 *  last-sync cursor and anchors, and any pending backfill marker. After this the Profile screen shows the
 *  "Connect Apple Health" button again, so a user stuck in a "connected but never synced" state
 *  (e.g. the first connect's import failed) has a clean way to start over. HealthKit's own
 *  read authorization is untouched — iOS owns that; the user manages it in Settings → Health. */
export async function disconnectAppleHealth(): Promise<void> {
  const uid = await currentUserId();
  if (!uid) return;
  resetGeneration++; // a sync or import still running must not save its position back
  await AsyncStorage.multiRemove([
    CONNECTED_PREFIX + uid,
    LAST_SYNCED_PREFIX + uid,
    ANCHORS_PREFIX + uid,
    BACKFILL_PREFIX + uid,
    HISTORY_PREFIX + uid,
  ]);
  bgDeliveryConfigured = false;
}

/** Ask HealthKit to wake the app on new data so syncs run near-instantly instead of only on the
 *  periodic background task. Safe to call repeatedly; best-effort; no-ops when Health isn't
 *  connected yet or the adapter doesn't support it (non-iOS). */
export async function enableHealthBackgroundDelivery(): Promise<void> {
  if (bgDeliveryConfigured) return;
  if (!(await isConnected())) return;
  try {
    await healthAdapter.enableBackgroundDelivery?.();
    bgDeliveryConfigured = true;
  } catch {
    // Best-effort — the periodic background task still keeps data flowing.
  }
}

/** Start a foreground observer that syncs shortly after HealthKit reports new data while the app
 *  is open, debounced so a burst of samples across types collapses into one sync. Returns an
 *  unsubscribe. Call only when Health is connected — observing un-authorized types is unsafe. */
export function startHealthChangeObserver(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const unsubscribe = healthAdapter.subscribeToChanges?.(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void syncNow();
    }, 4000);
  });
  return () => {
    if (timer) clearTimeout(timer);
    unsubscribe?.();
  };
}
