// Client API wrapper for a day's actual activity totals (steps, calories, etc.)
import { apiGet } from "./client";

export type DailyActuals = { steps: number; activeCalories: number; sleepHours: number | null };

export async function getDailyActuals(date: string): Promise<DailyActuals> {
  return apiGet<DailyActuals>(`/daily-actuals?date=${date}`);
}
