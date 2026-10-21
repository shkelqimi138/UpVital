import { useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { BottomSheetScreen } from "../components/ui/BottomSheetScreen";
import { DeltaBadge } from "../components/ui/DeltaBadge";
import { Icon } from "../components/ui/Icon";
import { SheetSkeleton } from "../components/ui/SheetSkeleton";
import { getActivityIntraday } from "../lib/api/activity-intraday";
import { getDailyActuals } from "../lib/api/daily-actuals";
import { getRecoveryDetail } from "../lib/api/recovery-detail";
import { data as dataColors, useTheme } from "../lib/theme";
import { usePreferences } from "../lib/preferences";
import { type EnergyUnit, toDisplayEnergy, UNIT_LABEL } from "../lib/units";
import { useAsyncData } from "../lib/hooks/use-async-data";

// One focused detail screen for the Health-screen metric rows, parameterized by ?metric=.
// Each metric has its own units (ms, bpm, steps, kcal), so the chart normalizes to the
// series' own min/max rather than the 0-100 assumption TrendBarChart makes.
type MetricKey = "hrv" | "heart_rate" | "steps" | "calories";

type IconName = React.ComponentProps<typeof Icon>["name"];

const CONFIG: Record<
  MetricKey,
  {
    title: string;
    icon: IconName;
    color: string;
    unit: string;
    higherIsBetter: boolean;
    kind: "recovery" | "activity";
  }
> = {
  hrv: {
    title: "HRV",
    icon: "heartPulse",
    color: dataColors.hrv,
    unit: "ms",
    higherIsBetter: true,
    kind: "recovery",
  },
  heart_rate: {
    title: "Resting Heart Rate",
    icon: "heart",
    color: dataColors.heart,
    unit: "bpm",
    higherIsBetter: false,
    kind: "recovery",
  },
  steps: {
    title: "Steps",
    icon: "footprints",
    color: dataColors.steps,
    unit: "steps",
    higherIsBetter: true,
    kind: "activity",
  },
  calories: {
    title: "Active Calories",
    icon: "flame",
    color: dataColors.calories,
    unit: "kcal",
    higherIsBetter: true,
    kind: "activity",
  },
};

type Loaded = {
  valueText: string;
  unit: string;
  delta: number | null;
  higherIsBetter: boolean;
  bars: number[];
  barsLabel: string;
  baselineText: string | null;
};

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function loadMetric(metric: MetricKey, today: string, energyUnit: EnergyUnit): Promise<Loaded> {
  const cfg = CONFIG[metric];

  if (cfg.kind === "recovery") {
    const detail = await getRecoveryDetail(today);
    const m = metric === "hrv" ? detail.hrv : detail.restingHeartRate;
    const delta = m.value != null && m.previousValue != null ? m.value - m.previousValue : null;
    const series = m.series ?? [];
    return {
      valueText: m.value != null ? Math.round(m.value).toString() : "—",
      unit: cfg.unit,
      delta,
      higherIsBetter: cfg.higherIsBetter,
      bars: series,
      barsLabel: series.length > 0 ? `Last ${series.length} days` : "No recent data",
      baselineText:
        m.baselineMean != null ? `Your baseline: ${Math.round(m.baselineMean)} ${cfg.unit}` : null,
    };
  }

  const [actuals, intra] = await Promise.all([getDailyActuals(today), getActivityIntraday(today)]);
  const bars = intra.hourly.map((p) => (metric === "steps" ? p.steps : p.calories));
  const total = metric === "steps" ? actuals.steps : actuals.activeCalories;
  return {
    valueText: (metric === "calories" ? toDisplayEnergy(total, energyUnit) : total).toLocaleString(),
    unit: metric === "calories" ? UNIT_LABEL[energyUnit] : cfg.unit,
    delta: null,
    higherIsBetter: cfg.higherIsBetter,
    bars,
    barsLabel: bars.length > 0 ? "Today, by hour" : "No data yet today",
    baselineText: null,
  };
}

/** Bars normalized to the series' own min/max — works for any unit. Latest bar is
 *  highlighted; earlier bars are dimmed. */
function MiniBars({ values, color, height = 128 }: { values: number[]; color: string; height?: number }) {
  if (values.length === 0) {
    return <View style={{ height, justifyContent: "center" }} />;
  }
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  return (
    <View style={[styles.bars, { height }]}>
      {values.map((v, i) => {
        const h = Math.max(4, ((v - min) / range) * (height - 8) + 4);
        return (
          <View
            key={i}
            style={{
              flex: 1,
              height: h,
              backgroundColor: color,
              borderRadius: 5,
              opacity: i === values.length - 1 ? 1 : 0.5,
            }}
          />
        );
      })}
    </View>
  );
}

export default function MetricDetailScreen() {
  const { colors, textColor, subtleColor } = useTheme();
  const params = useLocalSearchParams<{ metric?: string | string[] }>();
  const raw = Array.isArray(params.metric) ? params.metric[0] : params.metric;
  const metric: MetricKey = raw && raw in CONFIG ? (raw as MetricKey) : "hrv";
  const cfg = CONFIG[metric];

  const today = useMemo(() => toDateString(new Date()), []);
  // Keyed on `metric` (a route param), so switching metrics quickly could previously let a
  // slow earlier response overwrite a newer one. useAsyncData cancels the superseded load.
  const { energy: energyUnit } = usePreferences();
  const {
    data: loaded,
    loading,
    failed,
  } = useAsyncData(() => loadMetric(metric, today, energyUnit), [metric, today, energyUnit]);

  return (
    <BottomSheetScreen title={cfg.title} leadingIcon={<Icon name={cfg.icon} size={20} color={cfg.color} />}>
      {failed ? (
        <Text style={[styles.caption, { color: colors.status.error, marginTop: 24 }]}>
          Couldn't load this metric.
        </Text>
      ) : loading || loaded == null ? (
        // Gate on `loading`, not just `loaded == null`: the hook keeps the previous result
        // while refetching, and that data belongs to the metric we just navigated away from.
        <SheetSkeleton />
      ) : (
        <View style={{ gap: 20 }}>
          <View style={styles.valueRow}>
            <Text style={[styles.bigValue, { color: textColor }]}>{loaded.valueText}</Text>
            <Text style={[styles.unit, { color: subtleColor }]}>{loaded.unit}</Text>
            {loaded.delta != null && (
              <View style={{ marginLeft: "auto" }}>
                <DeltaBadge delta={loaded.delta} higherIsBetter={loaded.higherIsBetter} decimals={0} />
              </View>
            )}
          </View>

          {loaded.baselineText && (
            <Text style={[styles.caption, { color: subtleColor }]}>{loaded.baselineText}</Text>
          )}

          <View>
            <MiniBars values={loaded.bars} color={cfg.color} />
            <Text style={[styles.caption, { color: subtleColor, marginTop: 8 }]}>{loaded.barsLabel}</Text>
          </View>
        </View>
      )}
    </BottomSheetScreen>
  );
}

const styles = StyleSheet.create({
  valueRow: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  bigValue: { fontSize: 44, fontWeight: "700" },
  unit: { fontSize: 16 },
  caption: { fontSize: 13 },
  bars: { flexDirection: "row", alignItems: "flex-end", gap: 5 },
});
