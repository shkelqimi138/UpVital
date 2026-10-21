import { Platform } from "react-native";
import { reloadWidgets, sendToWatch, setWidgetData } from "../modules/widget-bridge";
import {
  computeStreak,
  DailyMetric,
  getDailyMetrics,
  getMetricForDate,
  STREAK_LOOKBACK_DAYS,
} from "./api/daily-metrics";

// Publishes today's scores to the iOS Home Screen widget. The widget is a native
// WidgetKit extension that can't run our JS or hit the API, so we serialize the scores
// into the shared App Group container (via the WidgetBridge native module) and ask
// WidgetKit to repaint. Everything here is best-effort and iOS-only: it must never
// throw into the caller, so a missing App Group / unlinked module just no-ops.
const APP_GROUP = "group.com.upvital.app";
const STORAGE_KEY = "widgetData";

// Shape the widget's Swift TimelineProvider decodes. Keep field names in sync with the
// WidgetData Codable struct in the widget target.
export type WidgetPayload = {
  date: string;
  daily: number | null;
  recovery: number | null;
  sleep: number | null;
  stress: number | null;
  biologicalAge: number | null;
  streak: number | null;
  updatedAt: string;
};

/** Write today's metric to the widget's shared store and trigger a refresh. Pass the
 *  metric for TODAY only — the widget shows a "sync" prompt when its stored date isn't
 *  the current day, so publishing a past day would make it look stale. */
export function updateWidgetFromMetric(metric: DailyMetric | null, streak: number | null = null): void {
  if (Platform.OS !== "ios" || !metric) return;
  const payload: WidgetPayload = {
    date: metric.date,
    daily: metric.daily_score,
    recovery: metric.recovery_score,
    sleep: metric.sleep_score,
    stress: metric.stress_score,
    biologicalAge: metric.biological_age,
    streak,
    updatedAt: new Date().toISOString(),
  };
  try {
    const json = JSON.stringify(payload);
    setWidgetData(APP_GROUP, STORAGE_KEY, json);
    reloadWidgets();
    // Same payload also goes to the Apple Watch app (which keeps its own copy — App
    // Groups don't cross devices). No-op if there's no paired/installed watch.
    sendToWatch(json);
  } catch {
    // best-effort — widget/watch updates must never break the app
  }
}

/** Fetch today's metric + streak from the backend and publish them to the widget. Use
 *  this after a background sync (when the Home screen isn't mounted to refresh the widget
 *  itself). Best-effort and iOS-only; never throws into the caller. */
export async function refreshWidgetNow(): Promise<void> {
  if (Platform.OS !== "ios") return;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - STREAK_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const [metric, range] = await Promise.all([
      getMetricForDate(today),
      getDailyMetrics(from, today).catch(() => [] as DailyMetric[]),
    ]);
    updateWidgetFromMetric(metric, metric ? computeStreak(range, today) : null);
  } catch {
    // best-effort
  }
}
