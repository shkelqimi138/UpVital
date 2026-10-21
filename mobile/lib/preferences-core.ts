// The device-side app preferences (units): types, defaults and the parsing of what was stored.
// Pure, so it's unit-tested; lib/preferences.ts holds the store. (There's no theme: the app is
// dark-only; an older stored "theme" value is simply ignored.)
import type { EnergyUnit, HeightUnit, TemperatureUnit, WeightUnit } from "./units";

export type Preferences = {
  weight: WeightUnit;
  height: HeightUnit;
  energy: EnergyUnit;
  temperature: TemperatureUnit;
};

/** Metric units. */
export const DEFAULT_PREFERENCES: Preferences = {
  weight: "kg",
  height: "cm",
  energy: "kcal",
  temperature: "C",
};

const ALLOWED: { [K in keyof Preferences]: readonly Preferences[K][] } = {
  weight: ["kg", "lb"],
  height: ["cm", "ftin"],
  energy: ["kcal", "kJ"],
  temperature: ["C", "F"],
};

/** Stored JSON → preferences. Unknown or invalid fields fall back to the default, so a corrupt
 *  or older stored value can never break the app. */
export function parsePreferences(raw: string | null): Preferences {
  if (!raw) return DEFAULT_PREFERENCES;
  let stored: unknown;
  try {
    stored = JSON.parse(raw);
  } catch {
    return DEFAULT_PREFERENCES;
  }
  if (typeof stored !== "object" || stored === null) return DEFAULT_PREFERENCES;
  const result = { ...DEFAULT_PREFERENCES };
  for (const key of Object.keys(ALLOWED) as (keyof Preferences)[]) {
    const value = (stored as Record<string, unknown>)[key];
    if ((ALLOWED[key] as readonly unknown[]).includes(value)) {
      (result as Record<string, unknown>)[key] = value;
    }
  }
  return result;
}

/** One-word summary for the Units row: all metric, all imperial, or a mix. */
export function unitSystemLabel(prefs: Preferences): "Metric" | "Imperial" | "Custom" {
  const metric = [
    prefs.weight === "kg",
    prefs.height === "cm",
    prefs.energy === "kcal",
    prefs.temperature === "C",
  ];
  if (metric.every(Boolean)) return "Metric";
  // Imperial = lb, ft/in, °F. Calories stay kcal in the US, so energy doesn't decide it.
  if (!metric[0] && !metric[1] && !metric[3]) return "Imperial";
  return "Custom";
}
