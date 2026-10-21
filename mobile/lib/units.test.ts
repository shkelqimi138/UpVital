// Unit tests for unit conversion (units.ts), the stored-preferences parser (preferences-core.ts)
// and the unit-aware Profile checks (profile-validation.ts).
// Run with `npm test` (mobile) via tsx — no React Native / Expo imports here.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  cmToFeetInches,
  feetInchesToCm,
  formatHeight,
  fromDisplayEnergy,
  fromDisplayWeight,
  toDisplayEnergy,
  toDisplayTemperature,
  toDisplayWeight,
  toPercent,
} from "./units";
import { DEFAULT_PREFERENCES, parsePreferences, unitSystemLabel } from "./preferences-core";
import { validateGoals, validatePersonalInfo } from "./profile-validation";

describe("weight", () => {
  it("shows kg as stored and converts to lb", () => {
    assert.equal(toDisplayWeight(72.4, "kg"), 72.4);
    assert.equal(toDisplayWeight(72.4, "lb"), 159.6);
  });

  it("round-trips a value typed in lb", () => {
    for (const lb of [100, 154.5, 180, 220.3]) {
      assert.equal(toDisplayWeight(fromDisplayWeight(lb, "lb"), "lb"), lb);
    }
  });
});

describe("energy", () => {
  it("converts kcal to kJ as whole numbers", () => {
    assert.equal(toDisplayEnergy(500, "kcal"), 500);
    assert.equal(toDisplayEnergy(500, "kJ"), 2092);
  });

  it("stores a kJ goal as whole kcal", () => {
    assert.equal(fromDisplayEnergy(2092, "kJ"), 500);
    assert.equal(fromDisplayEnergy(500, "kcal"), 500);
  });
});

describe("temperature", () => {
  it("converts °C to °F to 1 decimal", () => {
    assert.equal(toDisplayTemperature(36.6, "C"), 36.6);
    assert.equal(toDisplayTemperature(36.6, "F"), 97.9);
    assert.equal(toDisplayTemperature(0, "F"), 32);
  });
});

describe("percent", () => {
  it("reads HealthKit fractions as percents and leaves percents alone", () => {
    assert.equal(toPercent(0.97), 97);
    assert.equal(toPercent(1), 100);
    assert.equal(Math.round(toPercent(0.183) * 10) / 10, 18.3);
    assert.equal(toPercent(97), 97);
    assert.equal(toPercent(18.3), 18.3);
  });
});

describe("height", () => {
  it("converts cm to feet + inches and back", () => {
    assert.deepEqual(cmToFeetInches(178), { feet: 5, inches: 10 });
    assert.deepEqual(cmToFeetInches(152.4), { feet: 5, inches: 0 });
    assert.equal(feetInchesToCm(5, 10), 178);
  });

  it("formats for display", () => {
    assert.equal(formatHeight(178, "cm"), "178 cm");
    assert.equal(formatHeight(178, "ftin"), "5 ft 10 in");
  });
});

describe("parsePreferences", () => {
  it("falls back to the defaults for nothing, garbage or non-objects", () => {
    assert.deepEqual(parsePreferences(null), DEFAULT_PREFERENCES);
    assert.deepEqual(parsePreferences("{not json"), DEFAULT_PREFERENCES);
    assert.deepEqual(parsePreferences("42"), DEFAULT_PREFERENCES);
  });

  it("keeps valid fields and drops invalid ones", () => {
    // "theme" is from before the app went dark-only: ignored like any unknown key.
    const prefs = parsePreferences(
      JSON.stringify({ theme: "light", weight: "stone", energy: "kJ", extra: 1 }),
    );
    assert.deepEqual(prefs, { ...DEFAULT_PREFERENCES, energy: "kJ" });
  });
});

describe("unitSystemLabel", () => {
  it("names all-metric, imperial and mixed settings", () => {
    assert.equal(unitSystemLabel(DEFAULT_PREFERENCES), "Metric");
    assert.equal(
      unitSystemLabel({ ...DEFAULT_PREFERENCES, weight: "lb", height: "ftin", temperature: "F" }),
      "Imperial",
    );
    assert.equal(
      unitSystemLabel({
        ...DEFAULT_PREFERENCES,
        weight: "lb",
        height: "ftin",
        temperature: "F",
        energy: "kJ",
      }),
      "Imperial",
    );
    assert.equal(unitSystemLabel({ ...DEFAULT_PREFERENCES, weight: "lb" }), "Custom");
  });
});

describe("validatePersonalInfo", () => {
  const base = { displayName: "Alex", birthdate: "", heightCm: null, heightUnit: "cm" as const };

  it("accepts an empty height and a normal one", () => {
    assert.equal(validatePersonalInfo(base), null);
    assert.equal(validatePersonalInfo({ ...base, heightCm: 178 }), null);
  });

  it("explains the height limit in the chosen unit", () => {
    assert.equal(validatePersonalInfo({ ...base, heightCm: 999 }), "Enter your height in cm (1–300).");
    assert.equal(
      validatePersonalInfo({ ...base, heightCm: Number.NaN, heightUnit: "ftin" }),
      "Enter your height in feet and inches (up to 9 ft 10 in).",
    );
  });
});

describe("validateGoals", () => {
  const base = {
    weightGoal: "",
    weightUnit: "kg" as const,
    weightGoalTargetDate: "",
    stepGoal: "",
    sleepGoalHours: "",
    activeEnergyGoal: "",
    energyUnit: "kcal" as const,
  };

  it("accepts an empty form and normal values", () => {
    assert.equal(validateGoals(base), null);
    assert.equal(
      validateGoals({
        ...base,
        weightGoal: "165",
        weightUnit: "lb",
        activeEnergyGoal: "2000",
        energyUnit: "kJ",
      }),
      null,
    );
  });

  it("states the weight limit in the chosen unit", () => {
    assert.equal(validateGoals({ ...base, weightGoal: "501" }), "Set a weight goal between 1 and 500 kg.");
    assert.equal(
      validateGoals({ ...base, weightGoal: "1200", weightUnit: "lb" }),
      "Set a weight goal between 1 and 1,102 lb.",
    );
  });

  it("asks for a step goal of at least 1,000", () => {
    const message = "Set a daily step goal between 1,000 and 100,000 steps.";
    assert.equal(validateGoals({ ...base, stepGoal: "81" }), message);
    assert.equal(validateGoals({ ...base, stepGoal: "100001" }), message);
    assert.equal(validateGoals({ ...base, stepGoal: "1000" }), null);
  });

  it("lets an untouched step goal saved before the floor through, so the other goals still save", () => {
    assert.equal(
      validateGoals({ ...base, stepGoal: "81", stepGoalUnchanged: true, sleepGoalHours: "8" }),
      null,
    );
    assert.equal(
      validateGoals({ ...base, stepGoal: "100001", stepGoalUnchanged: true }),
      "Set a daily step goal between 1,000 and 100,000 steps.",
    );
  });

  it("states the active-energy limit in the chosen unit", () => {
    assert.equal(
      validateGoals({ ...base, activeEnergyGoal: "90000", energyUnit: "kJ" }),
      "Set a daily active-energy goal between 4 and 83,680 kJ.",
    );
    assert.equal(
      validateGoals({ ...base, activeEnergyGoal: "1.5" }),
      "Set a daily active-energy goal between 1 and 20,000 kcal.",
    );
  });
});
