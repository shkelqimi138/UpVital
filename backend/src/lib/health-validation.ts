// Runtime validation for the bulk health-ingest payloads (routes/health-data.ts).
//
// WHY THIS EXISTS: the routes previously did `req.body?.samples as IncomingSample[]` and checked
// only `Array.isArray`. That cast is COMPILE-TIME ONLY and asserts nothing at runtime, so a
// client could post `value: 1e308` (which flows into scoring and corrupts daily scores and
// biological age) or a 200k-element array (one enormous transaction). Neither is an injection
// risk — every query is parameterized — but both are real data-integrity and resource problems.
//
// Kept in its own module, free of DB imports, so it stays pure and directly unit-testable.

export type IncomingSample = {
  sampleType: string;
  value: number;
  unit: string;
  startDate: string;
  endDate: string;
  sourceUuid?: string;
};

export type IncomingWorkout = {
  workoutType: string;
  startDate: string;
  endDate: string;
  durationSeconds?: number;
  calories?: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  sourceUuid?: string;
  raw?: unknown;
};

/** One request's worth of samples. ~2 years of HealthKit history is sent in chunks well under
 *  this; the cap exists so a single request can't open an unbounded transaction. */
export const MAX_BATCH_ITEMS = 50_000;
/** No real HealthKit quantity comes close — this only has to exclude the absurd. */
export const MAX_ABS_VALUE = 1e9;
export const MAX_STRING = 256;

const isNonEmptyString = (v: unknown, max = MAX_STRING): v is string =>
  typeof v === "string" && v.length > 0 && v.length <= max;

// HealthKit dates arrive as ISO-8601 strings. Require something Date can actually parse:
// dateRangeOf() compares these lexicographically and hands them to computeForDateRange().
const isIsoDate = (v: unknown): v is string =>
  typeof v === "string" && v.length <= 40 && !Number.isNaN(Date.parse(v));

const isOptionalUuid = (v: unknown): boolean => v === undefined || v === null || isNonEmptyString(v, 128);

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= MAX_ABS_VALUE;

const isOptionalNumber = (v: unknown): boolean => v === undefined || v === null || isFiniteNumber(v);

export function validSample(s: unknown): s is IncomingSample {
  if (typeof s !== "object" || s === null || Array.isArray(s)) return false;
  const x = s as Record<string, unknown>;
  return (
    isNonEmptyString(x.sampleType) &&
    isFiniteNumber(x.value) &&
    isNonEmptyString(x.unit) &&
    isIsoDate(x.startDate) &&
    isIsoDate(x.endDate) &&
    isOptionalUuid(x.sourceUuid)
  );
}

export function validWorkout(w: unknown): w is IncomingWorkout {
  if (typeof w !== "object" || w === null || Array.isArray(w)) return false;
  const x = w as Record<string, unknown>;
  return (
    isNonEmptyString(x.workoutType) &&
    isIsoDate(x.startDate) &&
    isIsoDate(x.endDate) &&
    isOptionalNumber(x.durationSeconds) &&
    isOptionalNumber(x.calories) &&
    isOptionalNumber(x.avgHeartRate) &&
    isOptionalNumber(x.maxHeartRate) &&
    isOptionalUuid(x.sourceUuid)
  );
}

/** Either the narrowed array or a client-facing error message, so callers get a properly typed
 *  `T[]` instead of re-asserting with a cast. */
export type BatchResult<T> = { error: string } | { items: T[] };

export function checkBatch<T>(
  items: unknown,
  field: string,
  isValid: (v: unknown) => v is T,
): BatchResult<T> {
  if (!Array.isArray(items)) return { error: `Expected { ${field}: [...] }` };
  if (items.length > MAX_BATCH_ITEMS) {
    return {
      error: `Too many ${field} in one request (max ${MAX_BATCH_ITEMS}) — send them in smaller batches.`,
    };
  }
  const badIndex = items.findIndex((item) => !isValid(item));
  if (badIndex !== -1) return { error: `Invalid ${field} entry at index ${badIndex}.` };
  return { items: items as T[] };
}

/** A workout's raw HealthKit payload without its `device` and `sourceRevision` parts (the
 *  device's name, model, versions and identifier, and the recording app): personal data UpVital
 *  doesn't need. The app already leaves them out; this also covers older app versions. */
export function withoutDeviceDetails(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return raw;
  const copy: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
  delete copy.device;
  delete copy.sourceRevision;
  return copy;
}
