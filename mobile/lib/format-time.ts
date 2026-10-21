// Display helper for times of day.

/** An hour of the day as the phone shows times, e.g. "07:00" or "7:00 AM". */
export function formatHour(hour: number): string {
  return new Date(2000, 0, 1, hour).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
