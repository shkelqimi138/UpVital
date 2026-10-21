// Detail sheet for biological age + pace of aging, opened from the Dashboard bio-age card.
// Defaults to today (like the other detail sheets, which take no date param).
import { StyleSheet, Text, View } from "react-native";
import { BottomSheetScreen } from "../components/ui/BottomSheetScreen";
import { Icon } from "../components/ui/Icon";
import { LoadError } from "../components/ui/LoadError";
import { SheetSkeleton } from "../components/ui/SheetSkeleton";
import { TickScaleBar } from "../components/ui/TickScaleBar";
import { getLongevity } from "../lib/api/longevity";
import { getProfile } from "../lib/api/profile";
import { data as dataColors, typography, useTheme } from "../lib/theme";
import { useAsyncData } from "../lib/hooks/use-async-data";

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function chronologicalAgeYears(birthdate: string): number {
  return (Date.now() - new Date(birthdate).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
}

export default function BiologicalAgeDetailScreen() {
  const { colors, textColor, subtleColor, radius, spacing } = useTheme();
  const { data, loading, failed, reload } = useAsyncData(
    () => Promise.all([getLongevity(todayString()), getProfile()]),
    [],
  );
  const longevity = data?.[0] ?? null;
  const profile = data?.[1] ?? null;

  const icon = <Icon name="heartPulse" size={20} color={dataColors.hrv} />;

  if (failed) {
    return (
      <BottomSheetScreen title="Biological age" leadingIcon={icon}>
        <LoadError what="your biological age" onRetry={reload} />
      </BottomSheetScreen>
    );
  }

  // First load only — the sheet used to sit blank until the data landed.
  if (loading && data == null) {
    return (
      <BottomSheetScreen title="Biological age" leadingIcon={icon}>
        <SheetSkeleton />
      </BottomSheetScreen>
    );
  }

  const bioAge = longevity?.biologicalAge ?? null;
  const hasBirthdate = !!profile?.birthdate;

  // Empty state (only once the request actually succeeded — never while still loading).
  if (!loading && (!hasBirthdate || bioAge == null)) {
    return (
      <BottomSheetScreen title="Biological age" leadingIcon={icon}>
        <View
          style={[
            styles.panel,
            { backgroundColor: colors.cardInset, borderRadius: radius.lg, padding: spacing.lg },
          ]}
        >
          <Text style={{ color: subtleColor, lineHeight: 20 }}>
            {!hasBirthdate
              ? "Add your birthdate in Settings, then sync Apple Health, to see your biological age."
              : "Not enough data yet — biological age needs a few weeks of HRV history to settle. Keep syncing."}
          </Text>
        </View>
      </BottomSheetScreen>
    );
  }

  const actualAge = hasBirthdate ? chronologicalAgeYears(profile!.birthdate!) : null;
  const younger = actualAge != null && bioAge != null ? actualAge - bioAge : null;

  return (
    <BottomSheetScreen title="Biological age" leadingIcon={icon}>
      {bioAge != null && (
        <>
          <View style={styles.valueRow}>
            <Text style={[styles.value, { color: textColor }]}>{bioAge.toFixed(1)}</Text>
            <Text style={[styles.unit, { color: subtleColor }]}>yrs</Text>
            {younger != null && (
              <View style={[styles.pill, { backgroundColor: dataColors.soft.hrv }]}>
                <Text style={[typography.label, { color: dataColors.hrv }]}>
                  {younger >= 0
                    ? `${younger.toFixed(1)} yrs younger`
                    : `${Math.abs(younger).toFixed(1)} yrs older`}
                </Text>
              </View>
            )}
          </View>
          {actualAge != null && (
            <Text style={{ color: subtleColor, fontSize: 13 }}>vs {Math.round(actualAge)} actual</Text>
          )}

          {longevity?.paceOfAging != null && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: textColor }]}>Pace of aging</Text>
              <TickScaleBar
                value={longevity.paceOfAging}
                min={0.5}
                max={1.5}
                labels={[
                  { value: 0.5, label: "0.5×" },
                  { value: 1, label: "Actual 1.0×" },
                  { value: 1.5, label: "1.5×" },
                ]}
              />
              <Text style={{ color: subtleColor, fontSize: 13, lineHeight: 19 }}>
                How fast you're aging right now relative to the calendar. Below 1.0× means your recent HRV
                trend is aging you slower than one year per year.
              </Text>
            </View>
          )}

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>How this is estimated</Text>
            <Text style={{ color: subtleColor, fontSize: 13, lineHeight: 19 }}>
              Biological age is estimated from your heart-rate-variability (HRV) baseline against typical
              values for your age. It's an approximate wellness signal, not a clinical or diagnostic measure —
              treat it as a trend to nudge, not a number to fixate on.
            </Text>
          </View>
        </>
      )}
    </BottomSheetScreen>
  );
}

const styles = StyleSheet.create({
  panel: {},
  valueRow: { flexDirection: "row", alignItems: "baseline", gap: 8, flexWrap: "wrap" },
  value: { fontSize: 44, fontWeight: "700", fontVariant: ["tabular-nums"] },
  unit: { fontSize: 17 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  section: { gap: 8, marginTop: 4 },
  sectionTitle: { fontSize: 15, fontWeight: "700" },
});
