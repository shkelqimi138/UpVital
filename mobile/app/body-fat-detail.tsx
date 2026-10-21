// Detail screen for body-fat / body composition
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { BottomSheetScreen } from "../components/ui/BottomSheetScreen";
import { DeltaBadge } from "../components/ui/DeltaBadge";
import { Icon } from "../components/ui/Icon";
import { LoadError } from "../components/ui/LoadError";
import { SheetSkeleton } from "../components/ui/SheetSkeleton";
import { getBodyFatEntries } from "../lib/api/body-fat";
import { useTheme } from "../lib/theme";
import { toPercent } from "../lib/units";
import { useAsyncData } from "../lib/hooks/use-async-data";

export default function BodyFatDetailScreen() {
  const { colors, textColor, subtleColor, radius, spacing } = useTheme();
  const [showWhy, setShowWhy] = useState(false);
  const { data: loadedEntries, loading, failed, reload } = useAsyncData(() => getBodyFatEntries(), []);
  // HealthKit stores body fat as a fraction (0.18) — shown here as a percent (18.0).
  const entries = (loadedEntries ?? []).map((e) => ({ ...e, value: toPercent(e.value) }));

  const latest = entries[0] ?? null;
  const previous = entries[1] ?? null;
  const delta = latest && previous ? latest.value - previous.value : null;

  // A failed request must not render the "No data available / why do I have no data?" panel —
  // that explains an empty result the server never actually gave us.
  if (failed) {
    return (
      <BottomSheetScreen
        title="Body Fat Percentage"
        leadingIcon={<Icon name="percent" size={20} color={colors.accent.indigo} />}
      >
        <LoadError what="body fat history" onRetry={reload} />
      </BottomSheetScreen>
    );
  }

  // First load only — the sheet used to sit blank until the data landed.
  if (loading && loadedEntries == null) {
    return (
      <BottomSheetScreen
        title="Body Fat Percentage"
        leadingIcon={<Icon name="percent" size={20} color={colors.accent.indigo} />}
      >
        <SheetSkeleton />
      </BottomSheetScreen>
    );
  }

  if (!loading && entries.length === 0) {
    return (
      <BottomSheetScreen
        title="Body Fat Percentage"
        leadingIcon={<Icon name="percent" size={20} color={colors.accent.indigo} />}
      >
        <View
          style={[
            styles.panel,
            { backgroundColor: colors.cardInset, borderRadius: radius.lg, padding: spacing.lg },
          ]}
        >
          <Text style={{ color: subtleColor }}>No body-fat readings yet.</Text>
          <Pressable onPress={() => setShowWhy((v) => !v)}>
            <Text style={{ color: colors.status.info, textDecorationLine: "underline" }}>
              Why do I have no data?
            </Text>
          </Pressable>
        </View>
        {showWhy && (
          <Text style={{ color: subtleColor, fontSize: 13, lineHeight: 19 }}>
            Body fat % comes from a HealthKit-connected smart scale or manual entry in the Health app —
            Upvital reads it, but doesn't measure it directly. Log a reading in Health and sync to see it
            here.
          </Text>
        )}
      </BottomSheetScreen>
    );
  }

  return (
    <BottomSheetScreen
      title="Body Fat Percentage"
      leadingIcon={<Icon name="percent" size={20} color={colors.accent.indigo} />}
    >
      {latest && (
        <>
          <View style={styles.valueRow}>
            <Text style={[styles.value, { color: textColor }]}>{latest.value.toFixed(1)}</Text>
            <Text style={[styles.unit, { color: subtleColor }]}>%</Text>
            {delta !== null && <DeltaBadge delta={delta} higherIsBetter={false} />}
          </View>
          <Text style={{ color: subtleColor, fontSize: 13 }}>
            {new Date(latest.date).toLocaleDateString()} • {latest.data_source}
          </Text>

          {entries.length > 1 && (
            <View style={styles.history}>
              {entries.slice(1, 6).map((e, i) => (
                <View key={i} style={styles.historyRow}>
                  <Text style={{ color: subtleColor }}>{new Date(e.date).toLocaleDateString()}</Text>
                  <Text style={{ color: textColor }}>{e.value.toFixed(1)}%</Text>
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </BottomSheetScreen>
  );
}

const styles = StyleSheet.create({
  panel: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  valueRow: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  value: { fontSize: 44, fontWeight: "700", fontVariant: ["tabular-nums"] },
  unit: { fontSize: 17 },
  history: { gap: 8 },
  historyRow: { flexDirection: "row", justifyContent: "space-between" },
});
