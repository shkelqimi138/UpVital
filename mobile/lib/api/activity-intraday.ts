// API client for today's steps and active calories hour by hour
import { apiGet } from "./client";

/** Cumulative totals at the end of each hour of the day. */
export type ActivityIntradayPoint = { hour: number; calories: number; steps: number };

export type ActivityIntraday = { hourly: ActivityIntradayPoint[] };

export async function getActivityIntraday(date: string): Promise<ActivityIntraday> {
  return apiGet<ActivityIntraday>(`/activity-intraday?date=${date}`);
}
