// Client API wrapper for intraday stress data points
import { apiGet } from "./client";
import { RecoveryMetricValue } from "./recovery-detail";

export type StressIntraday = {
  hourly: { hour: string; avgHeartRate: number }[];
  daytimeHeartRate: RecoveryMetricValue;
};

export async function getStressIntraday(date: string): Promise<StressIntraday> {
  return apiGet<StressIntraday>(`/stress-intraday?date=${date}`);
}
