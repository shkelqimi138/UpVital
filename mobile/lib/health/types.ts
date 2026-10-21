// Shared types for the HealthKit adapter: samples, workouts, and the HealthAdapter interface
export type HealthSampleType =
  | "sleep"
  | "hrv"
  | "resting_heart_rate"
  | "heart_rate"
  | "steps"
  | "weight"
  | "active_calories"
  | "body_fat_percentage"
  | "oxygen_saturation"
  | "body_temperature";

export type CommonHealthSample = {
  sampleType: HealthSampleType;
  value: number;
  unit: string;
  startDate: string;
  endDate: string;
  sourceUuid?: string;
};

export type CommonWorkout = {
  workoutType: string;
  startDate: string;
  endDate: string;
  durationSeconds: number;
  calories?: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  sourceUuid?: string;
  raw: unknown;
};

/** Where the last sync left off in the platform's Health store, per data type (opaque strings). */
export type SyncAnchors = Record<string, string>;

export type HealthAdapter = {
  isAvailable(): Promise<boolean>;
  requestPermissions(): Promise<void>;
  /** `until` bounds the query's end (exclusive-ish). Omit to fetch through "now" — the
   *  incremental sync does that; the historical backfill passes it to read one date window
   *  at a time so each read is short and can survive an app suspension. */
  fetchSamples(sinceDate: Date, until?: Date): Promise<CommonHealthSample[]>;
  fetchWorkouts(sinceDate: Date, until?: Date): Promise<CommonWorkout[]>;
  /** Everything added to the Health store since `anchors`, whatever date it carries — so data
   *  that lands late (another app writing last night's sleep hours after waking) still syncs. A
   *  type with no anchor yet returns everything from `windowStart`. Returns the anchors to save
   *  once the upload has succeeded. Optional / platform-specific: without it the sync falls back
   *  to fetchSamples/fetchWorkouts since the last sync. */
  fetchChanges?(
    anchors: SyncAnchors,
    windowStart: Date,
  ): Promise<{ samples: CommonHealthSample[]; workouts: CommonWorkout[]; anchors: SyncAnchors }>;
  /** Date of birth as a YYYY-MM-DD string, if the platform exposes it. Optional — only
   *  used to prefill the profile so biological age isn't hand-entered. */
  fetchDateOfBirth?(): Promise<string | null>;
  /** Ask the OS to wake the app when new data of the sync'd types arrives, so a background
   *  sync can run near-instantly instead of only on the periodic ~few-hour task. Best-effort:
   *  resolves regardless of whether the platform honours it. Optional / platform-specific. */
  enableBackgroundDelivery?(): Promise<void>;
  /** Register a foreground observer that calls `onChange` when the sync'd types change, so a
   *  sync can fire while the app is open without waiting for the next poll. Returns an
   *  unsubscribe. Optional / platform-specific. */
  subscribeToChanges?(onChange: () => void): () => void;
};
