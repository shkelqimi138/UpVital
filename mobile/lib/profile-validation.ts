// Checks for the Profile's Personal info and Goals pages, in the user's chosen units, so the
// user reads a sentence instead of the API's developer-facing error. Limits mirror
// backend/src/routes/profile.ts (stored values: cm, kg, kcal). Pure, so it's unit-tested.
import {
  type EnergyUnit,
  fromDisplayEnergy,
  fromDisplayWeight,
  type HeightUnit,
  toDisplayEnergy,
  toDisplayWeight,
  type WeightUnit,
} from "./units";

export const MAX_DISPLAY_NAME = 200;
// The app asks for at least 1,000 so a slip ("81") can't become the goal; the API still takes 1+.
export const MIN_STEP_GOAL = 1_000;
export const MAX_STEP_GOAL = 100_000;
export const MAX_SLEEP_GOAL_HOURS = 24;
export const MAX_ACTIVE_CALORIE_GOAL = 20_000;
export const MAX_HEIGHT_CM = 300;
export const MAX_WEIGHT_GOAL_KG = 500;

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export function validatePersonalInfo(form: {
  displayName: string;
  birthdate: string;
  /** Height already converted to cm; null when left empty, NaN when what was typed isn't a number. */
  heightCm: number | null;
  heightUnit: HeightUnit;
}): string | null {
  if (form.displayName.trim().length > MAX_DISPLAY_NAME) {
    return `Display name is too long — keep it under ${MAX_DISPLAY_NAME} characters.`;
  }
  if (form.birthdate) {
    if (!YMD.test(form.birthdate)) return "Enter your birthdate as YYYY-MM-DD, for example 1990-04-23.";
    const when = new Date(`${form.birthdate}T00:00:00.000Z`);
    if (Number.isNaN(when.getTime())) return "That birthdate isn't a real date.";
    if (when.getTime() > Date.now()) return "Your birthdate can't be in the future.";
    const years = (Date.now() - when.getTime()) / (365.25 * DAY_MS);
    if (years > 120) return "Please check your birthdate — that's over 120 years ago.";
  }
  if (form.heightCm !== null) {
    const cm = form.heightCm;
    if (!Number.isInteger(cm) || cm < 1 || cm > MAX_HEIGHT_CM) {
      return form.heightUnit === "cm"
        ? `Enter your height in cm (1–${MAX_HEIGHT_CM}).`
        : "Enter your height in feet and inches (up to 9 ft 10 in).";
    }
  }
  return null;
}

export function validateGoals(form: {
  weightGoal: string;
  weightUnit: WeightUnit;
  weightGoalTargetDate: string;
  stepGoal: string;
  /** The step goal is the stored one, untouched — then only the API's range applies (1+), so a
   *  goal saved before the 1,000 floor doesn't block saving the other goals. */
  stepGoalUnchanged?: boolean;
  sleepGoalHours: string;
  activeEnergyGoal: string;
  energyUnit: EnergyUnit;
}): string | null {
  if (form.weightGoal) {
    const value = Number(form.weightGoal);
    if (
      !Number.isFinite(value) ||
      value <= 0 ||
      fromDisplayWeight(value, form.weightUnit) > MAX_WEIGHT_GOAL_KG
    ) {
      const max = Math.floor(toDisplayWeight(MAX_WEIGHT_GOAL_KG, form.weightUnit));
      return `Set a weight goal between 1 and ${max.toLocaleString()} ${form.weightUnit}.`;
    }
  }
  if (form.weightGoalTargetDate) {
    if (!YMD.test(form.weightGoalTargetDate)) return "Enter the target date as YYYY-MM-DD.";
    const when = new Date(`${form.weightGoalTargetDate}T00:00:00.000Z`);
    if (Number.isNaN(when.getTime())) return "That target date isn't a real date.";
    if (when.getTime() < Date.now() - DAY_MS) return "Your target date can't be in the past.";
  }
  if (form.stepGoal) {
    const steps = Number(form.stepGoal);
    const min = form.stepGoalUnchanged ? 1 : MIN_STEP_GOAL;
    if (!Number.isInteger(steps) || steps < min || steps > MAX_STEP_GOAL) {
      return `Set a daily step goal between ${MIN_STEP_GOAL.toLocaleString()} and ${MAX_STEP_GOAL.toLocaleString()} steps.`;
    }
  }
  if (form.sleepGoalHours) {
    const hours = Number(form.sleepGoalHours);
    if (!Number.isFinite(hours) || hours <= 0 || hours > MAX_SLEEP_GOAL_HOURS) {
      return `Set a nightly sleep goal between 1 and ${MAX_SLEEP_GOAL_HOURS} hours.`;
    }
  }
  if (form.activeEnergyGoal) {
    const value = Number(form.activeEnergyGoal);
    const kcal = fromDisplayEnergy(value, form.energyUnit);
    if (!Number.isInteger(value) || kcal < 1 || kcal > MAX_ACTIVE_CALORIE_GOAL) {
      const min = toDisplayEnergy(1, form.energyUnit);
      const max = toDisplayEnergy(MAX_ACTIVE_CALORIE_GOAL, form.energyUnit);
      return `Set a daily active-energy goal between ${min} and ${max.toLocaleString()} ${form.energyUnit}.`;
    }
  }
  return null;
}
