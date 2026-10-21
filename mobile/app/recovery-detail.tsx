// Detail screen for the Recovery score breakdown
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { BottomSheetScreen } from "../components/ui/BottomSheetScreen";
import { DeltaBadge } from "../components/ui/DeltaBadge";
import { Icon } from "../components/ui/Icon";
import { LoadError } from "../components/ui/LoadError";
import { RingGauge } from "../components/ui/RingGauge";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { SheetSkeleton } from "../components/ui/SheetSkeleton";
import { ThresholdBar } from "../components/ui/ThresholdBar";
import { TrendBarChart } from "../components/ui/TrendBarChart";
import { getDailyMetrics, getMetricForDate } from "../lib/api/daily-metrics";
import { getRecoveryDetail } from "../lib/api/recovery-detail";
import { useTheme } from "../lib/theme";
import { useAsyncData } from "../lib/hooks/use-async-data";

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function RecoveryDetailScreen() {
  const { colors, textColor, subtleColor, spacing, radius } = useTheme();
  const today = useMemo(() => toDateString(new Date()), []);

  const [trendRange, setTrendRange] = useState<"7" | "14">("7");

  const {
    data: metric,
    loading: metricLoading,
    failed: metricFailed,
    reload: reloadMetric,
  } = useAsyncData(() => getMetricForDate(today), [today]);
  const {
    data: detail,
    loading: detailLoading,
    failed: detailFailed,
    reload: reloadDetail,
  } = useAsyncData(() => getRecoveryDetail(today), [today]);
  // Keyed on trendRange: useAsyncData cancels the superseded request, so toggling 7/14 quickly
  // can't leave a slow earlier response on screen.
  const { data: trend } = useAsyncData(() => {
    const days = trendRange === "7" ? 7 : 14;
    const from = toDateString(new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000));
    return getDailyMetrics(from, today);
  }, [trendRange, today]);
  const trendData = trend ?? [];

  // Don't render gauges built from fallback constants when the numbers never arrived.
  const loadFailed = metricFailed || detailFailed;

  // Marker keys off the actual current date, not `today` (which is the date this sheet was
  // opened for — a past day when browsing history), so a past bar never mislabels as "Today".
  const realToday = toDateString(new Date());
  const chartData = trendData.map((m) => ({
    label: new Date(`${m.date}T00:00:00.000Z`)
      .toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" })
      .slice(0, 3),
    value: m.recovery_score,
    isToday: m.date === realToday,
  }));

  const hrv = detail?.hrv;
  const hrvDelta =
    hrv && hrv.value !== null && hrv.previousValue != null ? hrv.value - hrv.previousValue : null;
  const hrvPosition =
    hrv && hrv.value !== null && hrv.baselineMean !== null && hrv.baselineMean > 0
      ? Math.max(0, Math.min(1, hrv.value / (hrv.baselineMean * 2)))
      : 0.5;
  const hrvStatus =
    hrv && hrv.value !== null && hrv.baselineMean !== null
      ? hrv.value >= hrv.baselineMean
        ? "Balanced"
        : hrv.value >= hrv.baselineMean * 0.8
          ? "Low"
          : "Very low"
      : null;

  if (loadFailed) {
    return (
      <BottomSheetScreen
        title="Recovery score"
        leadingIcon={<Icon name="leaf" size={20} color={colors.accent.green} />}
      >
        <LoadError
          what="recovery details"
          onRetry={() => {
            reloadMetric();
            reloadDetail();
          }}
        />
      </BottomSheetScreen>
    );
  }

  // First load only — otherwise the gauge would paint "–" and then jump to the real score.
  if ((metricLoading && metric == null) || (detailLoading && detail == null)) {
    return (
      <BottomSheetScreen
        title="Recovery score"
        leadingIcon={<Icon name="leaf" size={20} color={colors.accent.green} />}
      >
        <SheetSkeleton hero="ring" />
      </BottomSheetScreen>
    );
  }

  return (
    <BottomSheetScreen
      title="Recovery score"
      leadingIcon={<Icon name="leaf" size={20} color={colors.accent.green} />}
    >
      <View style={styles.gaugeWrap}>
        <RingGauge value={metric?.recovery_score ?? null} label="Recovery" size={220} strokeWidth={18} />
      </View>

      <View
        style={[
          styles.legend,
          { backgroundColor: colors.cardInset, borderRadius: radius.lg, padding: spacing.md },
        ]}
      >
        <LegendDot color={colors.accent.green} label="Ready to train" textColor={textColor} />
        <LegendDot color={colors.accent.yellow} label="Go easy today" textColor={textColor} />
        <LegendDot color={colors.accent.red} label="Rest" textColor={textColor} />
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>Trend</Text>
          <SegmentedControl
            options={[
              { value: "7", label: "7 days" },
              { value: "14", label: "14 days" },
            ]}
            value={trendRange}
            onChange={setTrendRange}
          />
        </View>
        <TrendBarChart data={chartData} />
      </View>

      {hrv && hrv.value !== null && (
        <View style={styles.section}>
          <View style={styles.metricHeader}>
            <Icon name="heartPulse" size={18} color={colors.accent.green} />
            <Text style={[styles.metricTitle, { color: textColor }]}>Overnight HRV</Text>
          </View>
          <View style={styles.metricValueRow}>
            <Text style={[styles.metricValue, { color: textColor }]}>{hrv.value.toFixed(1)}</Text>
            <Text style={[styles.metricUnit, { color: subtleColor }]}>ms</Text>
            {hrvDelta !== null && <DeltaBadge delta={hrvDelta} higherIsBetter />}
            {hrvStatus && (
              <Text
                style={[
                  styles.metricStatus,
                  { color: hrvStatus === "Balanced" ? colors.status.success : colors.status.error },
                ]}
              >
                {hrvStatus}
              </Text>
            )}
          </View>
          <ThresholdBar position={hrvPosition} />
        </View>
      )}
    </BottomSheetScreen>
  );
}

function LegendDot({ color, label, textColor }: { color: string; label: string; textColor: string }) {
  return (
    <View style={styles.legendDotRow}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={{ color: textColor, fontSize: 13 }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  gaugeWrap: { alignItems: "center", paddingTop: 8 },
  legend: { flexDirection: "row", justifyContent: "space-around" },
  legendDotRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  section: { gap: 12 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { fontSize: 17, fontWeight: "700" },
  metricHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  metricTitle: { fontSize: 15 },
  metricValueRow: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  metricValue: { fontSize: 30, fontWeight: "600", fontVariant: ["tabular-nums"] },
  metricUnit: { fontSize: 15 },
  metricStatus: { marginLeft: "auto", fontSize: 13, fontWeight: "600" },
});
