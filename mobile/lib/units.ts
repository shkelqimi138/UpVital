// Unit conversion for display and input. Everything is stored metric (kg, cm, kcal, °C) — the
// database and API never change — and converted only when shown or typed, per the user's
// Units preference (lib/preferences.ts). Pure, so it's unit-tested.

export type WeightUnit = "kg" | "lb";
export type HeightUnit = "cm" | "ftin";
export type EnergyUnit = "kcal" | "kJ";
export type TemperatureUnit = "C" | "F";

/** Short label shown next to a value. */
export const UNIT_LABEL = {
  kg: "kg",
  lb: "lb",
  cm: "cm",
  ftin: "ft, in",
  kcal: "kcal",
  kJ: "kJ",
  C: "°C",
  F: "°F",
} as const;

const LB_PER_KG = 2.20462262185;
const KJ_PER_KCAL = 4.184;
const CM_PER_INCH = 2.54;

const round = (value: number, decimals: number) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

/** Stored kg → the number to show (1 decimal). */
export function toDisplayWeight(kg: number, unit: WeightUnit): number {
  return round(unit === "lb" ? kg * LB_PER_KG : kg, 1);
}

/** Typed weight → kg to store. 2 decimals, so a value typed in lb shows the same lb again. */
export function fromDisplayWeight(value: number, unit: WeightUnit): number {
  return round(unit === "lb" ? value / LB_PER_KG : value, 2);
}

/** Stored kcal → the number to show (whole number). */
export function toDisplayEnergy(kcal: number, unit: EnergyUnit): number {
  return Math.round(unit === "kJ" ? kcal * KJ_PER_KCAL : kcal);
}

/** Typed energy → kcal to store (whole number — the goal column is an integer). */
export function fromDisplayEnergy(value: number, unit: EnergyUnit): number {
  return Math.round(unit === "kJ" ? value / KJ_PER_KCAL : value);
}

/** A stored percentage → the number to show. HealthKit gives percentages as fractions (SpO₂ 0.97,
 *  body fat 0.18 = 18%); a few stored values are already percents (the demo account's SpO₂ is
 *  seeded as 96–99). Neither reading is ever really at or below 1%, so ≤ 1 means a fraction. */
export function toPercent(value: number): number {
  return value <= 1 ? value * 100 : value;
}

/** Stored °C → the number to show (1 decimal). */
export function toDisplayTemperature(celsius: number, unit: TemperatureUnit): number {
  return round(unit === "F" ? (celsius * 9) / 5 + 32 : celsius, 1);
}

/** Stored cm → whole feet + inches (rounded to the nearest inch). */
export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const totalInches = Math.round(cm / CM_PER_INCH);
  return { feet: Math.floor(totalInches / 12), inches: totalInches % 12 };
}

/** Feet + inches → whole cm to store (the height column is an integer). */
export function feetInchesToCm(feet: number, inches: number): number {
  return Math.round((feet * 12 + inches) * CM_PER_INCH);
}

/** Height for display, e.g. "178 cm" or "5 ft 10 in". */
export function formatHeight(cm: number, unit: HeightUnit): string {
  if (unit === "cm") return `${Math.round(cm)} cm`;
  const { feet, inches } = cmToFeetInches(cm);
  return `${feet} ft ${inches} in`;
}
