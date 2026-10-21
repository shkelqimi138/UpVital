// Client API wrapper for fetching the user's workouts
import { apiGet } from "./client";

export type Workout = {
  id: string;
  workout_type: string;
  start_date: string;
  end_date: string;
  duration_seconds: number | null;
  calories: number | null;
  avg_heart_rate: number | null;
  max_heart_rate: number | null;
  raw_data: unknown;
};

export async function getWorkouts(date?: string): Promise<Workout[]> {
  const body = await apiGet<{ workouts: Workout[] }>(date ? `/workouts?date=${date}` : "/workouts");
  return body.workouts;
}
