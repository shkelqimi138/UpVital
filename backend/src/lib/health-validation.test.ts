// Unit tests for the bulk health-ingest runtime validation (health-validation.ts).
// Run with `npm test` (backend) — pure functions, no DB, no network.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validSample,
  validWorkout,
  checkBatch,
  MAX_BATCH_ITEMS,
  MAX_ABS_VALUE,
  withoutDeviceDetails,
} from "./health-validation";

const goodSample = {
  sampleType: "HKQuantityTypeIdentifierHeartRate",
  value: 62,
  unit: "count/min",
  startDate: "2026-09-10T08:00:00Z",
  endDate: "2026-09-10T08:01:00Z",
};

const goodWorkout = {
  workoutType: "HKWorkoutActivityTypeRunning",
  startDate: "2026-09-10T08:00:00Z",
  endDate: "2026-09-10T08:45:00Z",
};

describe("validSample", () => {
  it("accepts a well-formed sample", () => {
    assert.equal(validSample(goodSample), true);
    assert.equal(validSample({ ...goodSample, sourceUuid: "abc-123" }), true);
  });

  it("rejects absurd / non-finite values (the corruption guard)", () => {
    assert.equal(validSample({ ...goodSample, value: 1e308 }), false); // > MAX_ABS_VALUE
    assert.equal(validSample({ ...goodSample, value: MAX_ABS_VALUE + 1 }), false);
    assert.equal(validSample({ ...goodSample, value: Infinity }), false);
    assert.equal(validSample({ ...goodSample, value: NaN }), false);
    assert.equal(validSample({ ...goodSample, value: "62" }), false); // string, not number
  });

  it("rejects missing / empty required strings", () => {
    const { unit, ...noUnit } = goodSample;
    assert.equal(validSample(noUnit), false);
    assert.equal(validSample({ ...goodSample, sampleType: "" }), false);
  });

  it("rejects unparseable dates", () => {
    assert.equal(validSample({ ...goodSample, startDate: "not-a-date" }), false);
    assert.equal(validSample({ ...goodSample, endDate: 12345 }), false);
  });

  it("rejects a non-string sourceUuid but allows it absent", () => {
    assert.equal(validSample({ ...goodSample, sourceUuid: 123 }), false);
    assert.equal(validSample({ ...goodSample, sourceUuid: undefined }), true);
    assert.equal(validSample({ ...goodSample, sourceUuid: null }), true);
  });

  it("rejects non-objects", () => {
    assert.equal(validSample(null), false);
    assert.equal(validSample([goodSample]), false);
    assert.equal(validSample("x"), false);
  });
});

describe("validWorkout", () => {
  it("accepts a well-formed workout, optional numbers absent", () => {
    assert.equal(validWorkout(goodWorkout), true);
    assert.equal(
      validWorkout({ ...goodWorkout, durationSeconds: 2700, calories: 410, avgHeartRate: 150 }),
      true,
    );
  });

  it("rejects bad optional numbers and missing type", () => {
    assert.equal(validWorkout({ ...goodWorkout, calories: "410" }), false);
    assert.equal(validWorkout({ ...goodWorkout, avgHeartRate: Infinity }), false);
    const { workoutType, ...noType } = goodWorkout;
    assert.equal(validWorkout(noType), false);
  });
});

describe("checkBatch", () => {
  it("narrows a valid array to { items }", () => {
    const res = checkBatch([goodSample, goodSample], "samples", validSample);
    assert.ok("items" in res);
    assert.equal(res.items.length, 2);
  });

  it("reports a non-array", () => {
    const res = checkBatch({ nope: true }, "samples", validSample);
    assert.ok("error" in res);
    assert.match(res.error, /Expected \{ samples: \[\.\.\.\] \}/);
  });

  it("reports the index of the first invalid entry", () => {
    const res = checkBatch([goodSample, goodSample, { bad: true }], "samples", validSample);
    assert.ok("error" in res);
    assert.match(res.error, /index 2/);
  });

  it("rejects an over-cap batch by length before validating contents", () => {
    const tooMany = new Array(MAX_BATCH_ITEMS + 1).fill(0); // contents irrelevant
    const res = checkBatch(tooMany, "samples", validSample);
    assert.ok("error" in res);
    assert.match(res.error, new RegExp(`max ${MAX_BATCH_ITEMS}`));
  });

  it("accepts a batch exactly at the cap", () => {
    const atCap = new Array(MAX_BATCH_ITEMS).fill(goodSample);
    const res = checkBatch(atCap, "samples", validSample);
    assert.ok("items" in res);
    assert.equal(res.items.length, MAX_BATCH_ITEMS);
  });
});

describe("withoutDeviceDetails", () => {
  it("drops the device and source parts and keeps the rest of the workout", () => {
    const raw = {
      uuid: "abc",
      workoutActivityType: 37,
      metadata: { HKIndoorWorkout: false },
      device: { name: "Alex's Apple Watch", model: "Watch", localIdentifier: "id-1" },
      sourceRevision: { source: { name: "Workout", bundleIdentifier: "com.apple.health" } },
    };
    assert.deepEqual(withoutDeviceDetails(raw), {
      uuid: "abc",
      workoutActivityType: 37,
      metadata: { HKIndoorWorkout: false },
    });
    assert.ok("device" in raw); // the input isn't changed
  });

  it("leaves anything that isn't a plain object alone", () => {
    assert.equal(withoutDeviceDetails(null), null);
    assert.equal(withoutDeviceDetails("x"), "x");
    assert.deepEqual(withoutDeviceDetails([1, 2]), [1, 2]);
  });
});
