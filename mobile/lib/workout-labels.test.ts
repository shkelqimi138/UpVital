// Unit tests for workout-labels.ts. Run with `npm test` (mobile) via tsx.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { workoutLabel } from "./workout-labels";

describe("workoutLabel", () => {
  it("splits HealthKit's camelCase names into words", () => {
    assert.equal(workoutLabel("traditionalStrengthTraining"), "Traditional Strength Training");
    assert.equal(workoutLabel("functionalStrengthTraining"), "Functional Strength Training");
    assert.equal(workoutLabel("running"), "Running");
    assert.equal(workoutLabel("tableTennis"), "Table Tennis");
    assert.equal(workoutLabel("trackAndField"), "Track and Field");
  });

  it("uses Apple's own names where a split wouldn't match", () => {
    assert.equal(workoutLabel("highIntensityIntervalTraining"), "HIIT");
    assert.equal(workoutLabel("swimBikeRun"), "Multisport");
    assert.equal(workoutLabel("mindAndBody"), "Mind & Body");
    assert.equal(workoutLabel("HKWorkoutActivityTypeHighIntensityIntervalTraining"), "HIIT");
  });

  it("falls back to 'Workout' for other, empty and unknown numeric types", () => {
    assert.equal(workoutLabel("other"), "Workout");
    assert.equal(workoutLabel(""), "Workout");
    assert.equal(workoutLabel(null), "Workout");
    assert.equal(workoutLabel("3000"), "Workout");
  });

  it("strips HealthKit's prefix and leaves readable names alone", () => {
    assert.equal(workoutLabel("HKWorkoutActivityTypeCycling"), "Cycling");
    assert.equal(workoutLabel("Yoga"), "Yoga");
  });
});
