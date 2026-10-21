// Client API wrapper for the daily AI-generated insight
import { apiGet } from "./client";

export type DailyInsight = {
  date: string;
  content: string;
  created_at: string;
};

export async function getInsightForDate(date: string): Promise<DailyInsight | null> {
  const body = await apiGet<{ insight: DailyInsight | null }>(`/daily-insights?date=${date}`);
  return body.insight;
}
