// Detail screen for the Stress score breakdown
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { CartesianChart, Line } from "victory-native";
import { BottomSheetScreen } from "../components/ui/BottomSheetScreen";
import { DeltaBadge } from "../components/ui/DeltaBadge";
import { Icon } from "../components/ui/Icon";
import { LoadError } from "../components/ui/LoadError";
import { SheetSkeleton } from "../components/ui/SheetSkeleton";
import { ThresholdBar } from "../components/ui/ThresholdBar";
import { getMetricForDate } from "../lib/api/daily-metrics";
import { getStressIntraday } from "../lib/api/stress-intraday";
import { useTheme } from "../lib/theme";
import { useAsyncData } from "../lib/hooks/use-async-data";

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function interpretation(score: number | null): string | null {
  if (score === null) return null;
  if (score >= 70) return "Calm";
  if (score >= 40) return "Moderate stress";
  return "High stress";
}

export default function StressDetailScreen() {
  const { colors, textColor, subtleColor } = useTheme();
  const today = useMemo(() => toDateString(new Date()), []);

  const {
    data: metric,
    loading: metricLoading,
    failed: metricFailed,
    reload: reloadMetric,
  } = useAsyncData(() => getMetricForDate(today), [today]);
  const {
    data: intraday,
    loading: intradayLoading,
    failed: intradayFailed,
    reload: reloadIntraday,
  } = useAsyncData(() => getStressIntraday(today), [today]);
  // Yesterday is only used for the delta badge, so a failure here degrades gracefully
  // (no badge) rather than taking the whole screen down.
  const { data: prevMetric } = useAsyncData(
    () => getMetricForDate(toDateString(new Date(Date.now() - 24 * 60 * 60 * 1000))),
    [today],
  );

  const loadFailed = metricFailed || intradayFailed;

  const chartData = (intraday?.hourly ?? []).map((h) => ({
    hour: new Date(h.hour).getUTCHours(),
    value: h.avgHeartRate,
  }));

  const delta =
    metric?.stress_score != null && prevMetric?.stress_score != null
      ? metric.stress_score - prevMetric.stress_score
      : null;

  const hr = intraday?.daytimeHeartRate;
  const hrPosition =
    hr && hr.value !== null && hr.baselineMean !== null && hr.baselineMean > 0
      ? Math.max(0, Math.min(1, hr.value / (hr.baselineMean * 1.6)))
      : 0.5;

  // hrPosition above falls back to a neutral 0.5 — fine as a placeholder, but it must never be
  // painted as if it were a measurement, so a failed load short-circuits to the error state.
  if (loadFailed) {
    return (
      <BottomSheetScreen
        title="Real-time stress"
        leadingIcon={<Icon name="heartPulse" size={20} color={colors.accent.red} />}
      >
        <LoadError
          what="stress details"
          onRetry={() => {
            reloadMetric();
            reloadIntraday();
          }}
        />
      </BottomSheetScreen>
    );
  }

  // First load only — otherwise the sheet would briefly claim "No heart-rate data synced".
  if ((metricLoading && metric == null) || (intradayLoading && intraday == null)) {
    return (
      <BottomSheetScreen
        title="Real-time stress"
        leadingIcon={<Icon name="heartPulse" size={20} color={colors.accent.red} />}
      >
        <SheetSkeleton />
      </BottomSheetScreen>
    );
  }

  return (
    <BottomSheetScreen
      title="Real-time stress"
      leadingIcon={<Icon name="heartPulse" size={20} color={colors.accent.red} />}
    >
      <View style={styles.scoreRow}>
        <Text style={[styles.score, { color: textColor }]}>
          {metric?.stress_score !== null && metric?.stress_score !== undefined
            ? Math.round(metric.stress_score)
            : "–"}
        </Text>
        <Text style={[styles.scoreSuffix, { color: subtleColor }]}>/100</Text>
        {delta !== null && <DeltaBadge delta={delta} higherIsBetter />}
      </View>

      <Text style={{ color: subtleColor, fontSize: 13, marginTop: -8 }}>
        Based on heart-rate data synced so far today — not a continuous live feed.
      </Text>

      <View style={styles.chartSection}>
        <View style={styles.chartLabelRow}>
          <Text style={{ color: subtleColor, fontSize: 12 }}>00:00</Text>
          <Text style={{ color: subtleColor, fontSize: 12 }}>23:59</Text>
        </View>
        {chartData.length > 0 ? (
          <View style={styles.chartWrap}>
            <CartesianChart data={chartData} xKey="hour" yKeys={["value"]} domain={{ x: [0, 23] }}>
              {({ points }) => (
                <Line points={points.value} color={colors.accent.red} strokeWidth={2} curveType="natural" />
              )}
            </CartesianChart>
          </View>
        ) : (
          <Text style={{ color: subtleColor }}>No heart-rate data synced for today yet.</Text>
        )}
      </View>

      <View style={styles.interpretationRow}>
        <Text style={{ color: textColor, fontWeight: "600" }}>Interpretation</Text>
        <Text
          style={{
            color:
              interpretation(metric?.stress_score ?? null) === "Calm"
                ? colors.status.success
                : colors.status.error,
            fontWeight: "600",
          }}
        >
          {interpretation(metric?.stress_score ?? null) ?? "–"}
        </Text>
      </View>
      {hr && hr.value !== null && (
        <ThresholdBar
          position={hrPosition}
          colors={[colors.accent.green, colors.accent.yellow, colors.accent.red]}
        />
      )}

      <Text style={{ color: subtleColor, fontSize: 13, lineHeight: 19 }}>
        Stress reflects how much physiologic load your nervous system and cardiovascular system are carrying —
        for Upvital's score, higher is calmer (better).
      </Text>
    </BottomSheetScreen>
  );
}

const styles = StyleSheet.create({
  scoreRow: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  score: { fontSize: 44, fontWeight: "700", fontVariant: ["tabular-nums"] },
  scoreSuffix: { fontSize: 17 },
  chartSection: { gap: 8 },
  chartLabelRow: { flexDirection: "row", justifyContent: "space-between" },
  chartWrap: { height: 180 },
  interpretationRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
});
