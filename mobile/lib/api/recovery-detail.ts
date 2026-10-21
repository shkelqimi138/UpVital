// API client for the HRV and resting-heart-rate data behind the Recovery score
import { apiGet } from "./client";

export type RecoveryMetricValue = {
  value: number | null;
  previousValue?: number | null;
  baselineMean: number | null;
  /** Trailing daily averages, oldest first — drives the Health Overview sparklines. */
  series?: number[];
};

export type RecoveryDetail = {
  hrv: RecoveryMetricValue;
  restingHeartRate: RecoveryMetricValue;
};

export async function getRecoveryDetail(date: string): Promise<RecoveryDetail> {
  return apiGet<RecoveryDetail>(`/recovery-detail?date=${date}`);
}
