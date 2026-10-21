// Client API wrapper for a night's detailed sleep breakdown (stages, wakeups)
import { apiGet } from "./client";

export type SleepStage = {
  minutes: number;
  percent: number;
  typicalRange: { minMinutes: number; maxMinutes: number };
};

export type SleepDetail = {
  sleepStart: string | null;
  sleepEnd: string | null;
  totalAsleepMinutes: number;
  totalInBedMinutes: number;
  stages: { awake: SleepStage; rem: SleepStage; core: SleepStage; deep: SleepStage };
  restorative: { deepMinutes: number; remMinutes: number; totalMinutes: number };
};

export async function getSleepDetail(date: string): Promise<SleepDetail | null> {
  const body = await apiGet<{ sleep: SleepDetail | null }>(`/sleep-detail?date=${date}`);
  return body.sleep;
}
