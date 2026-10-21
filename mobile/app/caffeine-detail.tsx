// Caffeine detail sheet showing today's caffeine decaying toward bedtime
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { CartesianChart, Line } from "victory-native";
import { BottomSheetScreen } from "../components/ui/BottomSheetScreen";
import { Icon } from "../components/ui/Icon";
import { LoadError } from "../components/ui/LoadError";
import { SheetSkeleton } from "../components/ui/SheetSkeleton";
import { StatusPill } from "../components/ui/StatusPill";
import { getCaffeineEntries, remainingCaffeineMg, totalRemainingAt } from "../lib/api/caffeine";
import { useTheme } from "../lib/theme";
import { useAsyncData } from "../lib/hooks/use-async-data";

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// A nominal reference bedtime and "still active" threshold — Upvital doesn't collect an
// actual bedtime, so this is a fixed, documented approximation, not personalized.
const BEDTIME_HOUR = 22;
const STILL_ACTIVE_THRESHOLD_MG = 50;

const COMMON_SOURCES = [
  { name: "Coffee", volume: "240 ml", mg: 95 },
  { name: "Espresso", volume: "30 ml", mg: 63 },
  { name: "Black Tea", volume: "240 ml", mg: 47 },
  { name: "Green Tea", volume: "240 ml", mg: 28 },
  { name: "Energy Drink", volume: "250 ml", mg: 80 },
  { name: "Cola", volume: "355 ml", mg: 34 },
];

function bedtimeToday(now: Date): Date {
  const bedtime = new Date(now);
  bedtime.setHours(BEDTIME_HOUR, 0, 0, 0);
  if (bedtime.getTime() < now.getTime()) bedtime.setDate(bedtime.getDate() + 1);
  return bedtime;
}

export default function CaffeineDetailScreen() {
  const { colors, textColor, subtleColor } = useTheme();
  const today = useMemo(() => toDateString(new Date()), []);
  const {
    data: loadedEntries,
    loading,
    failed,
    reload,
  } = useAsyncData(() => getCaffeineEntries(today), [today]);
  const entries = loadedEntries ?? [];

  const now = new Date();
  const bedtime = bedtimeToday(now);
  const hoursUntilBedtime = (bedtime.getTime() - now.getTime()) / (1000 * 60 * 60);

  const chartData = useMemo(() => {
    const points: { halfHour: number; value: number }[] = [];
    const dayStart = new Date(`${today}T00:00:00`);
    for (let i = 0; i <= 47; i++) {
      const t = new Date(dayStart.getTime() + i * 30 * 60 * 1000);
      points.push({ halfHour: i, value: totalRemainingAt(entries, t) });
    }
    return points;
  }, [entries, today]);

  const currentRemaining = totalRemainingAt(entries, now);
  const projectedAtBedtime = totalRemainingAt(entries, bedtime);
  const currentlyTooLate = projectedAtBedtime > STILL_ACTIVE_THRESHOLD_MG;

  // First load only — otherwise "0 mg · Sleep safe" flashes before today's entries arrive.
  if (loading && loadedEntries == null) {
    return (
      <BottomSheetScreen
        title="Caffeine window"
        leadingIcon={<Icon name="coffee" size={20} color={colors.accent.pink} />}
      >
        <SheetSkeleton />
      </BottomSheetScreen>
    );
  }

  return (
    <BottomSheetScreen
      title="Caffeine window"
      leadingIcon={<Icon name="coffee" size={20} color={colors.accent.pink} />}
    >
      {failed && <LoadError what="today's caffeine entries" onRetry={reload} />}
      <View style={styles.summaryRow}>
        <Text style={{ color: textColor, fontSize: 15 }}>Active caffeine right now</Text>
        <View style={styles.summaryRight}>
          <Text style={[styles.summaryValue, { color: textColor }]}>{Math.round(currentRemaining)} mg</Text>
          <StatusPill
            label={currentlyTooLate ? "Too late" : "Sleep safe"}
            color={currentlyTooLate ? colors.accent.pink : colors.accent.green}
          />
        </View>
      </View>

      <View style={styles.chartWrap}>
        <CartesianChart data={chartData} xKey="halfHour" yKeys={["value"]} domain={{ x: [0, 47] }}>
          {({ points }) => (
            <Line points={points.value} color={colors.accent.pink} strokeWidth={2} curveType="natural" />
          )}
        </CartesianChart>
      </View>
      <Text style={{ color: subtleColor, fontSize: 12 }}>
        Modeled decay curve (~5h half-life) from what you've logged today — not a measured blood level.
      </Text>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: textColor }]}>Common caffeine sources</Text>
        <Text style={{ color: subtleColor, fontSize: 13 }}>
          Adult limit: ~400 mg/day. "Sleep safe" estimates whether caffeine from that drink, if had right now,
          would likely have cleared below {STILL_ACTIVE_THRESHOLD_MG} mg by{" "}
          {BEDTIME_HOUR > 12 ? BEDTIME_HOUR - 12 : BEDTIME_HOUR}
          {BEDTIME_HOUR >= 12 ? "pm" : "am"}.
        </Text>
        {COMMON_SOURCES.map((source) => {
          const projected = remainingCaffeineMg(source.mg, hoursUntilBedtime);
          const safe = projected <= STILL_ACTIVE_THRESHOLD_MG;
          return (
            <View key={source.name} style={styles.sourceRow}>
              <View>
                <Text style={{ color: textColor }}>
                  {source.name} ({source.volume})
                </Text>
                <Text style={{ color: subtleColor, fontSize: 13 }}>{source.mg} mg caffeine</Text>
              </View>
              <StatusPill
                label={safe ? "Sleep safe" : "Too late"}
                color={safe ? colors.status.success : colors.status.error}
              />
            </View>
          );
        })}
      </View>
    </BottomSheetScreen>
  );
}

const styles = StyleSheet.create({
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  summaryRight: { alignItems: "flex-end", gap: 4 },
  summaryValue: { fontSize: 20, fontWeight: "700", fontVariant: ["tabular-nums"] },
  chartWrap: { height: 160 },
  section: { gap: 12 },
  sectionTitle: { fontSize: 17, fontWeight: "700" },
  sourceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
});
