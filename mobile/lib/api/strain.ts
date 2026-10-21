// API client for Day Strain and its hourly heart-rate zones
import { apiGet } from "./client";

/** Highest heart-rate zone reached in an hour: 0-4, or -1 for at-rest / no data. */
export type StrainHour = { hour: number; zone: number; bpm: number | null };

export type Strain = {
  /** 0-21 day strain. */
  strain: number;
  max: number;
  /** [low, high] band highlighted on the gauge as the productive range. */
  optimal: [number, number];
  maxHeartRate: number;
  activeMinutes: number;
  calories: number;
  steps: number;
  hourly: StrainHour[];
};

export async function getStrain(date: string): Promise<Strain> {
  return apiGet<Strain>(`/strain?date=${date}`);
}
