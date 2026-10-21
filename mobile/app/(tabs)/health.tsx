// Health tab screen: lists tracked health metrics with links to their detail screens
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LoadError } from "../../components/ui/LoadError";
import { OfflineBanner } from "../../components/ui/OfflineBanner";
import { Card } from "../../components/ui/Card";
import { GradientStatCard } from "../../components/ui/GradientStatCard";
import { Icon } from "../../components/ui/Icon";
import { MetricRow } from "../../components/ui/MetricRow";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { Skeleton } from "../../components/ui/Skeleton";
import { friendlyMessage } from "../../lib/api/client";
import { ActivityIntradayPoint, getActivityIntraday } from "../../lib/api/activity-intraday";
import { BodyFatEntry, getBodyFatEntries } from "../../lib/api/body-fat";
import { BodyTemperatureEntry, getBodyTemperatureEntries } from "../../lib/api/body-temperature";
import { CaffeineEntry, getCaffeineEntries, totalRemainingAt } from "../../lib/api/caffeine";
import { getOxygenSaturationEntries, OxygenSaturationEntry } from "../../lib/api/oxygen-saturation";
import { DailyActuals, getDailyActuals } from "../../lib/api/daily-actuals";
import { DailyMetric, getMetricForDate } from "../../lib/api/daily-metrics";
import { getRecoveryDetail, RecoveryDetail } from "../../lib/api/recovery-detail";
import { getSleepDetail, SleepDetail } from "../../lib/api/sleep-detail";
import { brand, data as dataColors, layout, spacing, typography, useTheme } from "../../lib/theme";
import { usePreferences } from "../../lib/preferences";
import { toDisplayEnergy, toDisplayTemperature, toPercent, UNIT_LABEL } from "../../lib/units";

/** Range options for the header's segmented control. */
const RANGES = [
  { value: "Today", label: "Today" },
  { value: "7D", label: "7D" },
  { value: "30D", label: "30D" },
  { value: "90D", label: "90D" },
] as const;
type Range = (typeof RANGES)[number]["value"];

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function recoveryBand(score: number): string {
  if (score >= 85) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 40) return "Fair";
  return "Low";
}

function formatSleepDuration(minutes: number | null): string | null {
  if (minutes === null) return null;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h ${m}m`;
}

// Shown on first load instead of a bare spinner — mirrors the Recovery/Sleep card pair and
// the metric list below it.
function HealthSkeleton() {
  return (
    <View style={{ gap: layout.cardGap }} accessible accessibilityLabel="Loading">
      <View style={styles.pairRow}>
        <Skeleton height={128} radius={20} style={{ flex: 1 }} />
        <Skeleton height={128} radius={20} style={{ flex: 1 }} />
      </View>
      <Skeleton height={360} radius={16} />
    </View>
  );
}

export default function HealthScreen() {
  const { colors, textColor, subtleColor, shadows } = useTheme();
  const { energy: energyUnit, temperature: temperatureUnit } = usePreferences();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const today = toDateString(new Date());
  const [range, setRange] = useState<Range>("Today");
  const [metric, setMetric] = useState<DailyMetric | null>(null);
  const [actuals, setActuals] = useState<DailyActuals | null>(null);
  const [recovery, setRecovery] = useState<RecoveryDetail | null>(null);
  const [sleep, setSleep] = useState<SleepDetail | null>(null);
  const [bodyFat, setBodyFat] = useState<BodyFatEntry | null>(null);
  const [spo2, setSpo2] = useState<OxygenSaturationEntry | null>(null);
  const [bodyTemp, setBodyTemp] = useState<BodyTemperatureEntry | null>(null);
  const [caffeine, setCaffeine] = useState<CaffeineEntry[]>([]);
  const [intraday, setIntraday] = useState<ActivityIntradayPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [m, a, r, s, bf, spo, temp, caf, intra] = await Promise.all([
        getMetricForDate(today),
        getDailyActuals(today),
        getRecoveryDetail(today).catch(() => null),
        getSleepDetail(today).catch(() => null),
        getBodyFatEntries()
          .then((entries) => entries[0] ?? null)
          .catch(() => null),
        getOxygenSaturationEntries()
          .then((entries) => entries[0] ?? null)
          .catch(() => null),
        getBodyTemperatureEntries()
          .then((entries) => entries[0] ?? null)
          .catch(() => null),
        getCaffeineEntries(today).catch(() => []),
        getActivityIntraday(today).catch(() => ({ hourly: [] })),
      ]);
      setMetric(m);
      setActuals(a);
      setRecovery(r);
      setSleep(s);
      setBodyFat(bf);
      setSpo2(spo);
      setBodyTemp(temp);
      setCaffeine(caf);
      setIntraday(intra.hourly);
    } catch (err) {
      setError(friendlyMessage(err));
    }
  }, [today]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const caffeineNow = caffeine.length ? Math.round(totalRemainingAt(caffeine, new Date())) : null;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.sm }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
    >
      <View style={styles.header}>
        <Text style={[typography.screenTitle, { color: textColor }]}>Health</Text>
        <Pressable onPress={() => router.push("/settings")} hitSlop={8}>
          <Text style={[typography.body, { color: colors.link, fontWeight: "600" }]}>Edit</Text>
        </Pressable>
      </View>

      {/* The handoff's Today / 7D / 30D / 90D control. Only "Today" has backing data on
          this screen so far — the multi-day aggregates aren't built, so the other ranges
          route to the full Trends chart rather than silently showing today's numbers. */}
      <SegmentedControl
        options={RANGES.map((r) => ({ value: r.value, label: r.label }))}
        value={range}
        onChange={(next) => {
          setRange(next);
          if (next !== "Today") router.push("/health-trends");
        }}
      />

      <OfflineBanner />

      {loading ? (
        <HealthSkeleton />
      ) : error ? (
        <View style={{ marginTop: spacing.lg }}>
          <LoadError what="your health overview" message={error} onRetry={() => void load()} />
        </View>
      ) : (
        <>
          <View style={styles.pairRow}>
            <GradientStatCard
              label="Recovery"
              value={metric?.recovery_score ?? null}
              unit="%"
              caption={metric?.recovery_score != null ? recoveryBand(metric.recovery_score) : null}
              colors={brand.heroGradient}
              shadow={shadows.greenHero}
              onPress={() => router.push("/recovery-detail")}
            />
            <GradientStatCard
              label="Sleep"
              value={metric?.sleep_score ?? null}
              unit="score"
              caption={formatSleepDuration(sleep?.totalAsleepMinutes ?? null)}
              colors={brand.sleepGradient}
              shadow={shadows.sleepHero}
              moon
              cutoutColor="#232558"
              onPress={() => router.push("/sleep-detail")}
            />
          </View>

          <Card style={[styles.listCard, shadows.card]}>
            <MetricRow
              name="Heart Rate"
              display={
                recovery?.restingHeartRate.value != null
                  ? Math.round(recovery.restingHeartRate.value).toString()
                  : null
              }
              unit="bpm"
              icon="heart"
              color={dataColors.heart}
              softColor={dataColors.soft.heart}
              series={recovery?.restingHeartRate.series}
              onPress={() => router.push("/metric-detail?metric=heart_rate")}
            />
            <MetricRow
              name="HRV"
              display={recovery?.hrv.value != null ? Math.round(recovery.hrv.value).toString() : null}
              unit="ms"
              icon="heartPulse"
              color={dataColors.hrv}
              softColor={dataColors.soft.hrv}
              series={recovery?.hrv.series}
              onPress={() => router.push("/metric-detail?metric=hrv")}
            />
            <MetricRow
              name="Steps"
              display={actuals ? actuals.steps.toLocaleString() : null}
              unit="steps"
              icon="footprints"
              color={dataColors.steps}
              softColor={dataColors.soft.steps}
              series={intraday.map((p) => p.steps)}
              onPress={() => router.push("/metric-detail?metric=steps")}
            />
            <MetricRow
              name="Calories"
              display={actuals ? toDisplayEnergy(actuals.activeCalories, energyUnit).toLocaleString() : null}
              unit={UNIT_LABEL[energyUnit]}
              icon="flame"
              color={dataColors.calories}
              softColor={dataColors.soft.calories}
              series={intraday.map((p) => p.calories)}
              onPress={() => router.push("/metric-detail?metric=calories")}
            />
            <MetricRow
              name="Blood Oxygen"
              display={spo2 ? Math.round(toPercent(spo2.value)).toString() : null}
              unit="%"
              icon="lungs"
              color={dataColors.spo2}
              softColor={dataColors.soft.sleep}
            />
            <MetricRow
              name="Body Temp"
              display={bodyTemp ? toDisplayTemperature(bodyTemp.value, temperatureUnit).toFixed(1) : null}
              unit={UNIT_LABEL[temperatureUnit]}
              icon="thermometer"
              color={dataColors.bodyTemp}
              softColor={dataColors.soft.bodyTemp}
            />
            {/* Kept from the existing app — the handoff's list has no slot for these. */}
            <MetricRow
              name="Body Fat"
              display={bodyFat ? toPercent(bodyFat.value).toFixed(1) : null}
              unit="%"
              icon="percent"
              color={dataColors.sleep}
              softColor={dataColors.soft.sleep}
              onPress={() => router.push("/body-fat-detail")}
            />
            <MetricRow
              name="Caffeine"
              display={caffeineNow !== null ? caffeineNow.toString() : null}
              unit="mg active"
              icon="coffee"
              color={dataColors.calories}
              softColor={dataColors.soft.calories}
              isLast
              onPress={() => router.push("/caffeine-detail")}
            />
          </Card>

          <Pressable onPress={() => router.push("/health-trends")}>
            <Card style={[styles.trendsRow, shadows.card]}>
              <View style={[styles.iconChip, { backgroundColor: dataColors.soft.steps }]}>
                <Icon name="chart" size={15} color={dataColors.steps} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[typography.bodyLarge, { color: textColor, fontWeight: "600" }]}>Trends</Text>
                <Text style={[typography.body, { color: subtleColor }]}>View all health trends</Text>
              </View>
              <Icon name="chevronRight" size={16} color={subtleColor} />
            </Card>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: layout.screenPadding, paddingBottom: 40, gap: layout.cardGap },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  centered: { textAlign: "center", marginTop: 40 },
  pairRow: { flexDirection: "row", gap: layout.gridGap },
  listCard: { padding: 0 },
  trendsRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  iconChip: { width: 26, height: 26, borderRadius: 9, alignItems: "center", justifyContent: "center" },
});
