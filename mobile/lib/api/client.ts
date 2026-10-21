// Base API URL + the shared request layer every backend call goes through.
//
// Three jobs, all of which used to be duplicated (or missing) in ~20 call sites:
//
//  1. FRIENDLY ERRORS. Screens used to render `err.message` straight out of a rejected
//     fetch, so a plane-mode tap showed the user "TypeError: Network request failed" or
//     "GET /daily-metrics failed: 500". Everything thrown from here is a UserFacingError
//     whose message is a sentence a person can act on; `friendlyMessage()` sanitises
//     anything else so a raw string can never reach the UI.
//  2. OFFLINE FALLBACK. A successful GET is cached per user; if a later GET can't reach
//     the network, the cached body is served instead of throwing. That's why the app
//     still shows yesterday's scores in Airplane Mode instead of one red error line.
//     `<OfflineBanner />` tells the user the numbers are the last synced ones — showing
//     stale health data silently would be worse than showing none.
//  3. TIMEOUTS. RN's fetch has no default timeout; a dead network could hang a screen
//     on its spinner indefinitely.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";
import {
  GENERIC_MESSAGE,
  OFFLINE_MESSAGE,
  OFFLINE_PATTERNS,
  TIMEOUT_MESSAGE,
  TIMEOUT_PATTERNS,
  UserFacingError,
  errorText,
} from "../net-errors";
import { supabase } from "../auth/supabase";

export const API_URL: string = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

const REQUEST_TIMEOUT_MS = 20_000;

// A cold/just-woken backend — or a burst of contention when the on-open health sync's
// recompute runs alongside the dashboard's dozen reads — can make the first GET after an idle
// stretch time out or bounce a 5xx. Without a retry the first screen flips straight to the
// "couldn't load — Retry" state even though the server answers fine a moment later. Retrying
// an idempotent GET a couple of times with a short backoff lets that first load resolve on its
// own the instant the server responds. Writes are never auto-retried — a POST that timed out
// may still have committed, so replaying it could double-apply.
const GET_MAX_RETRIES = 2;
const GET_RETRY_DELAY_MS = 1_000;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Errors  (classification lives in ./net-errors so it stays unit-testable)
// ---------------------------------------------------------------------------

export { UserFacingError, friendlyMessage, isOfflineError, relativeTime } from "../net-errors";

export type ApiErrorKind = "offline" | "timeout" | "auth" | "client" | "server" | "unknown";

export class ApiError extends UserFacingError {
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  constructor(kind: ApiErrorKind, message: string, status: number | null = null) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
  }
}

function classify(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  const raw = errorText(err);
  if (TIMEOUT_PATTERNS.test(raw)) return new ApiError("timeout", TIMEOUT_MESSAGE);
  if (OFFLINE_PATTERNS.test(raw)) return new ApiError("offline", OFFLINE_MESSAGE);
  return new ApiError("unknown", GENERIC_MESSAGE);
}

// ---------------------------------------------------------------------------
// Offline state (subscribable; <OfflineBanner /> reads it via useSyncExternalStore)
// ---------------------------------------------------------------------------

export type OfflineState = {
  /** True while the most recent request had to be served from cache. */
  offline: boolean;
  /** When the newest data currently on screen was actually fetched, or null if unknown. */
  lastSyncedAt: number | null;
};

// A single frozen value for the online case: emit() compares by field, so a run of
// successful requests notifies subscribers exactly once (on the first) instead of on each.
// While online nothing needs lastSyncedAt — when we do fall back to the cache, the age
// comes from that entry's own envelope.
const ONLINE: OfflineState = { offline: false, lastSyncedAt: null };

let offlineState: OfflineState = ONLINE;
const listeners = new Set<() => void>();

function emit(next: OfflineState) {
  if (next.offline === offlineState.offline && next.lastSyncedAt === offlineState.lastSyncedAt) return;
  offlineState = next;
  for (const listener of listeners) listener();
}

// A request that fails while the app is NOT in the foreground is almost always iOS suspending us
// on an app switch (it freezes JS and cuts the network mid-request), not a real loss of
// connectivity. Flipping the offline banner for that flashes a scary "you're offline" the moment
// the user leaves — and it's wrong. Serve the cache silently instead; the next foreground load
// (see the dashboard's AppState listener) reflects the true online/offline state.
function emitOfflineIfForeground(next: OfflineState) {
  if (AppState.currentState === "active") emit(next);
}

export function subscribeOffline(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Must stay referentially stable between changes — useSyncExternalStore loops otherwise. */
export function getOfflineState(): OfflineState {
  return offlineState;
}

// ---------------------------------------------------------------------------
// Response cache
// ---------------------------------------------------------------------------

const CACHE_PREFIX = "upvital.cache.v1.";
const CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000; // a fortnight; older than that isn't worth showing

type CacheEnvelope = { at: number; body: unknown };

// Keys are scoped by user id so a second account on the same device can never be shown
// the first one's health data.
function cacheKey(userId: string, path: string): string {
  return `${CACHE_PREFIX}${userId}:${path}`;
}

async function writeCache(userId: string, path: string, body: unknown): Promise<void> {
  try {
    const envelope: CacheEnvelope = { at: Date.now(), body };
    await AsyncStorage.setItem(cacheKey(userId, path), JSON.stringify(envelope));
  } catch {
    // A full disk must never break a request that already succeeded.
  }
}

async function readCache<T>(userId: string, path: string): Promise<{ at: number; body: T } | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(userId, path));
    if (!raw) return null;
    const envelope = JSON.parse(raw) as CacheEnvelope;
    if (typeof envelope?.at !== "number") return null;
    if (Date.now() - envelope.at > CACHE_TTL_MS) return null;
    return { at: envelope.at, body: envelope.body as T };
  } catch {
    return null;
  }
}

/** Drops every cached response. Call on sign-out and on delete-account. */
export async function clearApiCache(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    // Includes LAST_USER_KEY, so a signed-out device has no id left to look a cache up under.
    const ours = keys.filter((k) => k.startsWith(CACHE_PREFIX));
    if (ours.length) await AsyncStorage.multiRemove(ours);
  } catch {
    // Best effort — a stale cache is scoped to the signed-out user's own id anyway.
  }
  emit(ONLINE);
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

// Remembered so an offline launch can still find its own cache. Access tokens expire after
// an hour; with no network supabase-js can't refresh one, and getSession() then reports no
// session at all — indistinguishable from a real sign-out unless we've kept the id.
const LAST_USER_KEY = `${CACHE_PREFIX}lastUserId`;

async function rememberUser(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_USER_KEY, userId);
  } catch {
    // non-fatal
  }
}

async function lastKnownUserId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(LAST_USER_KEY);
  } catch {
    return null;
  }
}

async function session() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const userId = data.session?.user.id;
  if (!token || !userId) {
    throw new ApiError("auth", "You're signed out. Please log in again.");
  }
  void rememberUser(userId);
  return { token, userId };
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function errorFromResponse(res: Response): Promise<ApiError> {
  // Our own routes answer 4xx with { error }. That copy is written for humans and is far
  // more useful than a generic message, so it's the one we show.
  let serverMessage: string | null = null;
  try {
    const body = await res.json();
    if (typeof body?.error === "string" && body.error.length <= 300) serverMessage = body.error;
  } catch {
    // non-JSON body (a proxy error page, most likely)
  }
  if (res.status === 401 || res.status === 403) {
    return new ApiError("auth", "Your session has expired. Please log in again.", res.status);
  }
  if (res.status === 429) {
    return new ApiError("client", "Too many requests. Please wait a moment and try again.", 429);
  }
  if (res.status >= 500) {
    return new ApiError(
      "server",
      "Something went wrong on our end. Please try again in a moment.",
      res.status,
    );
  }
  return new ApiError(
    "client",
    serverMessage ?? "We couldn't complete that request. Please try again.",
    res.status,
  );
}

export type GetOptions = {
  /** Set false for responses that must never be served stale (exports, one-shot lookups). */
  cache?: boolean;
};

/** Authenticated GET. Caches on success and falls back to that cache when offline. */
export async function apiGet<T>(path: string, options: GetOptions = {}): Promise<T> {
  const useCache = options.cache !== false;

  let token: string;
  let userId: string;
  try {
    ({ token, userId } = await session());
  } catch (err) {
    // Offline with an expired token looks exactly like a sign-out from here. Falling back to
    // the cache under the last known user keeps the app usable instead of telling someone in
    // Airplane Mode that they've been logged out. A real sign-out clears both, so there's
    // nothing left to serve then.
    if (useCache) {
      const previous = await lastKnownUserId();
      if (previous) {
        const cached = await readCache<T>(previous, path);
        if (cached) {
          emitOfflineIfForeground({ offline: true, lastSyncedAt: cached.at });
          return cached.body;
        }
      }
    }
    throw err;
  }

  let apiError: ApiError = new ApiError("unknown", GENERIC_MESSAGE);
  for (let attempt = 0; attempt <= GET_MAX_RETRIES; attempt++) {
    try {
      const res = await fetchWithTimeout(`${API_URL}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw await errorFromResponse(res);
      const body = (await res.json()) as T;
      emit(ONLINE);
      if (useCache) void writeCache(userId, path, body);
      return body;
    } catch (err) {
      apiError = classify(err);
      // A 4xx/auth error is a real answer, and an offline error can't be retried — both drop to
      // the fallback below. A timeout or 5xx while the backend is momentarily busy (e.g. the
      // on-open sync's recompute contending with these reads) is usually transient.
      const retryable = apiError.kind === "timeout" || apiError.kind === "server";
      if (!retryable) break;
      // A returning user already has cached scores: show those instantly (the OfflineBanner
      // marks them as last-synced) rather than making them sit through the backoff. Only wait
      // out the retries when there's nothing cached to show — a genuine first load — so that
      // resolves into fresh data the moment the backend frees up, instead of the "Retry" error.
      if (useCache) {
        const cached = await readCache<T>(userId, path);
        if (cached) {
          emitOfflineIfForeground({ offline: true, lastSyncedAt: cached.at });
          return cached.body;
        }
      }
      if (attempt < GET_MAX_RETRIES) {
        await delay(GET_RETRY_DELAY_MS * (attempt + 1));
        continue;
      }
      break;
    }
  }
  // Retries exhausted (or a non-retryable failure). Substitute cached data only for a
  // connectivity failure — a 4xx is a real answer, and papering over it with stale numbers
  // would hide the problem.
  if (useCache && (apiError.kind === "offline" || apiError.kind === "timeout")) {
    const cached = await readCache<T>(userId, path);
    if (cached) {
      emit({ offline: true, lastSyncedAt: cached.at });
      return cached.body;
    }
  }
  throw apiError;
}

export type SendOptions = {
  /** Override the default 20s cap. Bulk HealthKit uploads legitimately take longer. */
  timeoutMs?: number;
};

/** Authenticated write. Never cached and never served stale — a write either happened or didn't. */
export async function apiSend<T = void>(
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
  options: SendOptions = {},
): Promise<T> {
  const { token } = await session();
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  try {
    const res = await fetchWithTimeout(
      `${API_URL}${path}`,
      {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      options.timeoutMs,
    );
    if (!res.ok) throw await errorFromResponse(res);
    emit(ONLINE);
    if (res.status === 204) return undefined as T;
    return (await res.json().catch(() => undefined)) as T;
  } catch (err) {
    throw classify(err);
  }
}
