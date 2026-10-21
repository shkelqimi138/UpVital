// Trends screen: metric history charts with period selection and summary stats
import { matchFont } from "@shopify/react-native-skia";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { CartesianChart, Line, useChartTransformState } from "victory-native";
import { LoadError } from "../components/ui/LoadError";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { Skeleton } from "../components/ui/Skeleton";
import { friendlyMessage } from "../lib/api/client";
import { DailyMetric, getDailyMetrics } from "../lib/api/daily-metrics";
import { useTheme } from "../lib/theme";

type MetricKey = "daily_score" | "recovery_score" | "sleep_score" | "stress_score";

const METRICS: { key: MetricKey; label: string }[] = [
  { key: "daily_score", label: "Daily" },
  { key: "recovery_score", label: "Recovery" },
  { key: "sleep_score", label: "Sleep" },
  { key: "stress_score", label: "Stress" },
];

const PERIODS = [
  { value: "7", label: "7D", days: 7 },
  { value: "30", label: "30D", days: 30 },
  { value: "90", label: "90D", days: 90 },
  { value: "365", label: "1Y", days: 365 },
] as const;
type PeriodValue = (typeof PERIODS)[number]["value"];

// Fetch the widest window once, then slice per selected period client-side so switching
// metric/period is instant (no refetch). All four metrics are 0-100, higher = better
// (including Stress, where higher = calmer), so the trend direction is uniform.
const FETCH_DAYS = 365;
// A shift smaller than this reads as noise, not a real trend.
const TREND_EPSILON = 2;

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

// Shown on first load instead of a bare spinner — mirrors the headline, the four stat tiles
// and the chart.
function TrendsSkeleton() {
  return (
    <View style={{ gap: 14 }} accessible accessibilityLabel="Loading">
      <Skeleton width="55%" height={20} />
      <View style={styles.statRow}>
        <Skeleton height={64} radius={12} style={{ flex: 1 }} />
        <Skeleton height={64} radius={12} style={{ flex: 1 }} />
        <Skeleton height={64} radius={12} style={{ flex: 1 }} />
        <Skeleton height={64} radius={12} style={{ flex: 1 }} />
      </View>
      <Skeleton height={240} radius={16} />
    </View>
  );
}

export default function HealthTrendsScreen() {
  const { backgroundColor, textColor, subtleColor, colors } = useTheme();
  const [allMetrics, setAllMetrics] = useState<DailyMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metricKey, setMetricKey] = useState<MetricKey>("daily_score");
  const [period, setPeriod] = useState<PeriodValue>("30");

  const router = useRouter();
  const { state: transformState } = useChartTransformState();

  const font = useMemo(
    () =>
      Platform.OS === "web"
        ? null
        : matchFont({ fontFamily: Platform.OS === "ios" ? "Helvetica" : "sans-serif", fontSize: 11 }),
    [],
  );

  const reload = useCallback(() => {
    setError(null);
    setLoading(true);
    const to = toDateString(new Date());
    const from = toDateString(new Date(Date.now() - FETCH_DAYS * 24 * 60 * 60 * 1000));
    getDailyMetrics(from, to)
      .then(setAllMetrics)
      .catch((err) => setError(friendlyMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const periodDays = PERIODS.find((p) => p.value === period)!.days;
  const periodLabel = PERIODS.find((p) => p.value === period)!.label;
  const metricLabel = METRICS.find((m) => m.key === metricKey)!.label;

  // Recovery/Sleep/Stress each have a detail sheet; the Daily score has none, so no link there.
  const detailRoute =
    metricKey === "recovery_score"
      ? "/recovery-detail"
      : metricKey === "sleep_score"
        ? "/sleep-detail"
        : metricKey === "stress_score"
          ? "/stress-detail"
          : null;

  // Days in the selected window that have a value for this metric (recovery/etc. can be
  // null before their baseline warms up).
  const rows = useMemo(() => {
    const cutoff = toDateString(new Date(Date.now() - (periodDays - 1) * 24 * 60 * 60 * 1000));
    return allMetrics.filter((m) => m.date >= cutoff && m[metricKey] != null);
  }, [allMetrics, periodDays, metricKey]);

  const stats = useMemo(() => {
    const values = rows.map((m) => m[metricKey] as number);
    if (values.length === 0) return null;
    const mid = Math.floor(values.length / 2);
    const first = values.slice(0, mid);
    const second = values.slice(mid);
    const delta = first.length > 0 && second.length > 0 ? mean(second) - mean(first) : null;
    return {
      current: values[values.length - 1],
      average: mean(values),
      best: Math.max(...values),
      lowest: Math.min(...values),
      delta,
    };
  }, [rows, metricKey]);

  const chartData = useMemo(
    () =>
      rows.map((m, i) => ({
        dayIndex: i,
        date: m.date,
        value: m[metricKey] as number,
        avg: stats?.average ?? 0,
      })),
    [rows, metricKey, stats],
  );

  const summary = useMemo(() => {
    if (!stats) return "";
    let dir = "";
    if (stats.delta != null) {
      if (stats.delta >= TREND_EPSILON) dir = `, up ${Math.round(stats.delta)} from the start of the period`;
      else if (stats.delta <= -TREND_EPSILON)
        dir = `, down ${Math.abs(Math.round(stats.delta))} from the start of the period`;
      else dir = ", holding steady";
    }
    return `Averaging ${Math.round(stats.average)} over the last ${periodLabel}${dir}.`;
  }, [stats, periodLabel]);

  const trend =
    !stats || stats.delta == null
      ? { label: "—", color: colors.textSecondary, arrow: "" }
      : stats.delta >= TREND_EPSILON
        ? { label: `+${Math.round(stats.delta)}`, color: colors.status.success, arrow: "↑" }
        : stats.delta <= -TREND_EPSILON
          ? { label: `${Math.round(stats.delta)}`, color: colors.status.error, arrow: "↓" }
          : { label: "steady", color: colors.textSecondary, arrow: "→" };

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <Text style={[styles.title, { color: textColor }]}>Trends</Text>

      <SegmentedControl
        options={METRICS.map((m) => ({ value: m.key, label: m.label }))}
        value={metricKey}
        onChange={(v) => setMetricKey(v as MetricKey)}
      />
      <SegmentedControl
        options={PERIODS.map((p) => ({ value: p.value, label: p.label }))}
        value={period}
        onChange={(v) => setPeriod(v as PeriodValue)}
      />

      {loading ? (
        <TrendsSkeleton />
      ) : error ? (
        <LoadError what="your trends" message={error} onRetry={reload} />
      ) : !stats ? (
        <Text style={[styles.center, { color: subtleColor }]}>
          No history yet — sync Apple Health to see trends.
        </Text>
      ) : (
        <>
          <View style={styles.headlineRow}>
            <Text style={[styles.headline, { color: textColor }]}>
              {metricLabel} · last {periodLabel}
            </Text>
            <View style={[styles.badge, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.badgeText, { color: trend.color }]}>
                {trend.arrow} {trend.label}
              </Text>
            </View>
          </View>

          <View style={styles.statRow}>
            <StatTile label="Current" value={stats.current} />
            <StatTile label="Average" value={stats.average} />
            <StatTile label="Best" value={stats.best} />
            <StatTile label="Lowest" value={stats.lowest} />
          </View>

          <View style={styles.chartWrap}>
            <CartesianChart
              data={chartData}
              xKey="dayIndex"
              yKeys={["value", "avg"]}
              padding={{ left: 8, bottom: 8, right: 8, top: 8 }}
              domain={{ y: [0, 100] }}
              transformState={transformState}
              xAxis={
                font
                  ? {
                      font,
                      tickCount: 5,
                      labelColor: subtleColor,
                      formatXLabel: (i) => chartData[Math.round(i)]?.date?.slice(5) ?? "",
                    }
                  : undefined
              }
              yAxis={font ? [{ font, tickCount: 5, labelColor: subtleColor }] : undefined}
            >
              {({ points }) => (
                <>
                  {/* Average reference line (behind), then the actual trend line. */}
                  <Line points={points.avg} color={subtleColor} strokeWidth={1} />
                  <Line
                    points={points.value}
                    color={colors.accent.blue}
                    strokeWidth={2}
                    curveType="natural"
                  />
                </>
              )}
            </CartesianChart>
          </View>

          <Text style={[styles.summary, { color: subtleColor }]}>{summary}</Text>

          {detailRoute && (
            <Pressable onPress={() => router.push(detailRoute)}>
              <Text style={[styles.detailLink, { color: colors.link }]}>View {metricLabel} details ›</Text>
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  const { colors, textColor, subtleColor } = useTheme();
  return (
    <View style={[styles.tile, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.tileValue, { color: textColor }]}>{Math.round(value)}</Text>
      <Text style={[styles.tileLabel, { color: subtleColor }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 14 },
  title: { fontSize: 24, fontWeight: "600" },
  center: { textAlign: "center", marginTop: 40 },
  headlineRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  headline: { fontSize: 16, fontWeight: "600" },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  badgeText: { fontSize: 13, fontWeight: "700" },
  statRow: { flexDirection: "row", gap: 8 },
  tile: { flex: 1, borderRadius: 12, borderWidth: 1, paddingVertical: 12, alignItems: "center", gap: 2 },
  tileValue: { fontSize: 22, fontWeight: "700" },
  tileLabel: { fontSize: 12 },
  chartWrap: { flex: 1, marginTop: 4 },
  summary: { fontSize: 13, lineHeight: 18 },
  detailLink: { fontSize: 14, fontWeight: "600", marginTop: 2 },
});
