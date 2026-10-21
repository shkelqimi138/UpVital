// Apple HealthKit adapter (@kingstinct/react-native-healthkit) implementing HealthAdapter: reads samples, workouts, and date of birth.
import {
  configureBackgroundTypes,
  getDateOfBirthAsync,
  isHealthDataAvailable,
  queryCategorySamples,
  queryCategorySamplesWithAnchor,
  queryQuantitySamples,
  queryQuantitySamplesWithAnchor,
  queryWorkoutSamples,
  queryWorkoutSamplesWithAnchor,
  requestAuthorization,
  subscribeToChanges,
  UpdateFrequency,
  WorkoutActivityType,
} from "@kingstinct/react-native-healthkit";
import type {
  CategoryTypeIdentifier,
  ObjectTypeIdentifier,
  QuantityTypeIdentifier,
} from "@kingstinct/react-native-healthkit";
import type { CommonHealthSample, CommonWorkout, HealthAdapter, SyncAnchors } from "./types";

// HealthKit access via @kingstinct/react-native-healthkit — a New-Architecture
// (Nitro) module. We deliberately moved off react-native-health, whose legacy
// bridge module resolves to `undefined` under React Native's bridgeless New Arch,
// so its init call threw before iOS ever showed the permission dialog.

const SLEEP: CategoryTypeIdentifier = "HKCategoryTypeIdentifierSleepAnalysis";
const WORKOUTS = "HKWorkoutTypeIdentifier";

// Quantity types we read, with the HealthKit unit to request and the unit label we
// persist (kept identical to what the scoring backend was calibrated against).
const QUANTITIES: {
  id: QuantityTypeIdentifier;
  sampleType: CommonHealthSample["sampleType"];
  reqUnit: string;
  label: string;
  heartRateWindow?: boolean;
}[] = [
  { id: "HKQuantityTypeIdentifierHeartRateVariabilitySDNN", sampleType: "hrv", reqUnit: "ms", label: "ms" },
  {
    id: "HKQuantityTypeIdentifierRestingHeartRate",
    sampleType: "resting_heart_rate",
    reqUnit: "count/min",
    label: "bpm",
  },
  {
    id: "HKQuantityTypeIdentifierHeartRate",
    sampleType: "heart_rate",
    reqUnit: "count/min",
    label: "bpm",
    heartRateWindow: true,
  },
  { id: "HKQuantityTypeIdentifierStepCount", sampleType: "steps", reqUnit: "count", label: "count" },
  { id: "HKQuantityTypeIdentifierBodyMass", sampleType: "weight", reqUnit: "kg", label: "kg" },
  {
    id: "HKQuantityTypeIdentifierActiveEnergyBurned",
    sampleType: "active_calories",
    reqUnit: "kcal",
    label: "kcal",
  },
  {
    id: "HKQuantityTypeIdentifierBodyFatPercentage",
    sampleType: "body_fat_percentage",
    reqUnit: "%",
    label: "percent",
  },
  {
    id: "HKQuantityTypeIdentifierOxygenSaturation",
    sampleType: "oxygen_saturation",
    reqUnit: "%",
    label: "percent",
  },
  {
    id: "HKQuantityTypeIdentifierBodyTemperature",
    sampleType: "body_temperature",
    reqUnit: "degC",
    label: "degC",
  },
];

const READ_PERMISSIONS: ObjectTypeIdentifier[] = [
  SLEEP,
  ...QUANTITIES.map((q) => q.id),
  WORKOUTS as ObjectTypeIdentifier,
  "HKCharacteristicTypeIdentifierDateOfBirth" as ObjectTypeIdentifier,
];

// Heart rate is far higher-volume than the other metrics (a reading every few
// minutes). It only feeds the Stress score's rolling baseline, so cap how far back
// we ever fetch it rather than pulling the full historical import window.
const HEART_RATE_MAX_LOOKBACK_DAYS = 35;
const DAY_MS = 24 * 60 * 60 * 1000;

// HKCategoryValueSleepAnalysis -> the stage labels the scoring backend expects.
const SLEEP_STAGE: Record<number, string> = {
  0: "INBED",
  1: "ASLEEP", // asleepUnspecified
  2: "AWAKE",
  3: "CORE", // asleepCore
  4: "DEEP", // asleepDeep
  5: "REM", // asleepREM
};

async function requestPermissions(): Promise<void> {
  // Must run before any query — querying an un-requested type crashes HealthKit.
  await requestAuthorization({ toRead: READ_PERMISSIONS });
}

// Types we ask iOS to deliver in the background / observe for changes. Deliberately EXCLUDES
// raw heart rate (`heartRateWindow`) — it updates every few minutes and would wake the app (and
// fire the observer) almost constantly for no scoring benefit, since it only feeds a rolling
// baseline. Sleep/HRV/RHR/steps/energy/workouts are the meaningful, lower-frequency signals.
const BACKGROUND_TYPES: string[] = [
  SLEEP,
  ...QUANTITIES.filter((q) => !q.heartRateWindow).map((q) => q.id),
  "HKWorkoutTypeIdentifier",
];

async function enableBackgroundDelivery(): Promise<void> {
  // `immediate` asks HealthKit to wake the app as soon as new data lands. iOS still throttles
  // many quantity types to ~hourly regardless, but this is the correct push mechanism and far
  // tighter than the periodic background task's ~few-hour cadence. Needs the
  // com.apple.developer.healthkit.background-delivery entitlement (already present).
  await configureBackgroundTypes(BACKGROUND_TYPES, UpdateFrequency.immediate);
}

function subscribeToChangesAdapter(onChange: () => void): () => void {
  // One observer query per type; each returns a `remove` handle. The caller debounces, so a
  // burst across several types collapses into a single sync.
  const subs = BACKGROUND_TYPES.map((id) =>
    subscribeToChanges(id as Parameters<typeof subscribeToChanges>[0], onChange),
  );
  return () => subs.forEach((s) => s.remove());
}

// Shapes shared by the date-window reads (connect, history import) and the anchored sync.
type Quantity = (typeof QUANTITIES)[number];
type QuantityRecord = { quantity: number; startDate: Date; endDate: Date; uuid: string };
type SleepRecord = { value: number; startDate: Date; endDate: Date; uuid: string };
type WorkoutRecord = Awaited<ReturnType<typeof queryWorkoutSamples>>[number];

function toQuantitySample(q: Quantity, s: QuantityRecord): CommonHealthSample {
  return {
    sampleType: q.sampleType,
    value: s.quantity,
    unit: q.label,
    startDate: s.startDate.toISOString(),
    endDate: s.endDate.toISOString(),
    sourceUuid: s.uuid,
  };
}

// react-native-health returned sleep as a stage-label string in `value`; this
// library returns a numeric HKCategoryValueSleepAnalysis. We keep the backend's
// contract: stage label in `unit`, interval duration (minutes) in `value`.
function toSleepSample(s: SleepRecord): CommonHealthSample {
  return {
    sampleType: "sleep",
    value: (s.endDate.getTime() - s.startDate.getTime()) / 60000,
    unit: SLEEP_STAGE[s.value] ?? String(s.value),
    startDate: s.startDate.toISOString(),
    endDate: s.endDate.toISOString(),
    sourceUuid: s.uuid,
  };
}

function toWorkout(w: WorkoutRecord): CommonWorkout {
  const ws = w.toJSON();
  // The device and source parts are left out of the stored copy: they hold the device's name
  // (usually its owner's name), model, versions and identifier, which UpVital doesn't need.
  const raw: Record<string, unknown> = { ...ws };
  delete raw.device;
  delete raw.sourceRevision;
  return {
    workoutType: String(WorkoutActivityType[ws.workoutActivityType] ?? ws.workoutActivityType),
    startDate: new Date(ws.startDate).toISOString(),
    endDate: new Date(ws.endDate).toISOString(),
    durationSeconds:
      ws.duration?.quantity ?? (new Date(ws.endDate).getTime() - new Date(ws.startDate).getTime()) / 1000,
    calories: ws.totalEnergyBurned?.quantity,
    sourceUuid: ws.uuid,
    raw,
  };
}

async function fetchQuantity(q: Quantity, since: Date, until?: Date): Promise<CommonHealthSample[]> {
  const samples = await queryQuantitySamples(q.id, {
    filter: { date: { startDate: since, ...(until ? { endDate: until } : {}) } },
    unit: q.reqUnit,
    limit: 0, // 0 => all samples in range
    ascending: true,
  });
  return samples.map((s) => toQuantitySample(q, s));
}

async function fetchSamples(sinceDate: Date, until?: Date): Promise<CommonHealthSample[]> {
  const heartRateSince = new Date(
    Math.max(sinceDate.getTime(), Date.now() - HEART_RATE_MAX_LOOKBACK_DAYS * DAY_MS),
  );

  const sleepPromise = queryCategorySamples(SLEEP, {
    filter: { date: { startDate: sinceDate, ...(until ? { endDate: until } : {}) } },
    limit: 0,
    ascending: true,
  });

  const [sleep, quantityGroups] = await Promise.all([
    sleepPromise,
    Promise.all(
      QUANTITIES.map((q) => {
        if (q.heartRateWindow) {
          // Heart rate is capped to the last 35 days. If this window ends before that cap
          // (a historical backfill window), there's nothing to read — skip the query rather
          // than issue one whose start is after its end.
          if (until && heartRateSince >= until) return Promise.resolve([]);
          return fetchQuantity(q, heartRateSince, until);
        }
        return fetchQuantity(q, sinceDate, until);
      }),
    ),
  ]);

  return [...sleep.map(toSleepSample), ...quantityGroups.flat()];
}

async function fetchWorkouts(sinceDate: Date, until?: Date): Promise<CommonWorkout[]> {
  const workouts = await queryWorkoutSamples({
    filter: { date: { startDate: sinceDate, ...(until ? { endDate: until } : {}) } },
    limit: 0,
    ascending: true,
  });
  return workouts.map(toWorkout);
}

// HealthKit anchored queries: each anchor marks a position in the Health store, so the next
// query returns only records added after it, whatever their dates. A date filter alone ("since
// the last sync") skipped records written late, such as Fitbit sleep synced hours after waking.
async function fetchChanges(
  anchors: SyncAnchors,
  windowStart: Date,
): Promise<{ samples: CommonHealthSample[]; workouts: CommonWorkout[]; anchors: SyncAnchors }> {
  const heartRateStart = new Date(
    Math.max(windowStart.getTime(), Date.now() - HEART_RATE_MAX_LOOKBACK_DAYS * DAY_MS),
  );
  const next: SyncAnchors = { ...anchors };

  const [sleep, quantityGroups, workouts] = await Promise.all([
    queryCategorySamplesWithAnchor(SLEEP, {
      filter: { date: { startDate: windowStart } },
      limit: 0,
      anchor: anchors[SLEEP],
    }),
    Promise.all(
      QUANTITIES.map(async (q) => {
        const result = await queryQuantitySamplesWithAnchor(q.id, {
          filter: { date: { startDate: q.heartRateWindow ? heartRateStart : windowStart } },
          unit: q.reqUnit,
          limit: 0,
          anchor: anchors[q.id],
        });
        next[q.id] = result.newAnchor;
        return result.samples.map((s) => toQuantitySample(q, s));
      }),
    ),
    queryWorkoutSamplesWithAnchor({
      filter: { date: { startDate: windowStart } },
      limit: 0,
      anchor: anchors[WORKOUTS],
    }),
  ]);
  next[SLEEP] = sleep.newAnchor;
  next[WORKOUTS] = workouts.newAnchor;

  return {
    samples: [...sleep.samples.map(toSleepSample), ...quantityGroups.flat()],
    workouts: workouts.workouts.map(toWorkout),
    anchors: next,
  };
}

async function fetchDateOfBirth(): Promise<string | null> {
  const dob = await getDateOfBirthAsync();
  return dob ? dob.toISOString().slice(0, 10) : null;
}

export const healthKitAdapter: HealthAdapter = {
  // isHealthDataAvailable() is synchronous in this library; wrap to satisfy the adapter.
  isAvailable: async () => isHealthDataAvailable(),
  requestPermissions,
  fetchSamples,
  fetchWorkouts,
  fetchChanges,
  fetchDateOfBirth,
  enableBackgroundDelivery,
  subscribeToChanges: subscribeToChangesAdapter,
};
