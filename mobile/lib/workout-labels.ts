// Workout type → the name shown on screen. Workouts are stored with HealthKit's activity-type
// name ("traditionalStrengthTraining"); this turns it into "Traditional Strength Training".
// Display only — the stored value (and what the Coach reads) stays as it is. Pure, so it's tested.

// Where splitting the name wouldn't read the way Apple's own apps show it.
const SPECIAL = new Map<string, string>([
  ["highIntensityIntervalTraining", "HIIT"],
  ["swimBikeRun", "Multisport"],
  ["mindAndBody", "Mind & Body"],
  ["preparationAndRecovery", "Preparation & Recovery"],
  ["other", "Workout"],
]);

export function workoutLabel(type: string | null | undefined): string {
  const name = (type ?? "").trim().replace(/^HKWorkoutActivityType/, "");
  // Empty, or an activity-type number this app version doesn't know by name.
  if (!name || /^\d+$/.test(name)) return "Workout";
  const special = SPECIAL.get(name) ?? SPECIAL.get(name.charAt(0).toLowerCase() + name.slice(1));
  if (special) return special;
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((word, i) =>
      i > 0 && word.toLowerCase() === "and" ? "and" : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
}
