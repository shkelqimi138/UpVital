// Activity tab screen: Day Strain gauge, hourly effort chart, and the workouts list.
import { Link } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Canvas, LinearGradient, Rect, RadialGradient, vec } from "@shopify/react-native-skia";
import { LoadError } from "../../components/ui/LoadError";
import { OfflineBanner } from "../../components/ui/OfflineBanner";
import { Card } from "../../components/ui/Card";
import { Icon } from "../../components/ui/Icon";
import { Skeleton } from "../../components/ui/Skeleton";
import { StrainGauge } from "../../components/ui/StrainGauge";
import { friendlyMessage } from "../../lib/api/client";
import { getStrain, Strain } from "../../lib/api/strain";
import {
  brand,
  data as dataColors,
  layout,
  radius,
  shadows,
  spacing,
  tabularNums,
  typography,
  useTheme,
} from "../../lib/theme";
import { usePreferences } from "../../lib/preferences";
import { toDisplayEnergy, UNIT_LABEL } from "../../lib/units";
import { workoutLabel } from "../../lib/workout-labels";
import { getWorkouts, Workout } from "../../lib/api/workouts";

/** Hour labels under the effort chart. */
const EFFORT_AXIS = [
  { hour: 6, label: "6a" },
  { hour: 10, label: "10a" },
  { hour: 14, label: "2p" },
  { hour: 18, label: "6p" },
  { hour: 22, label: "10p" },
];

const EFFORT_MAX_HEIGHT = 92;

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "–";
  return `${Math.round(seconds / 60)} min`;
}

/** Bar colour by the hour's peak zone: hard work reads brand-dark, moderate reads bright,
 *  anything at or below easy aerobic stays muted so the shape of the day is legible. */
function zoneColor(zone: number): string {
  if (zone >= 3) return brand.greenDeep;
  if (zone >= 1) return brand.greenBright;
  return "rgba(120,130,125,0.35)";
}

function relativeDay(date: string): string {
  const then = new Date(`${date.slice(0, 10)}T00:00:00.000Z`).getTime();
  const today = new Date(`${toDateString(new Date())}T00:00:00.000Z`).getTime();
  const days = Math.round((today - then) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(date).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function ProgressStat({
  label,
  value,
  unit,
  color,
  pct,
}: {
  label: string;
  value: string;
  unit: string;
  color: string;
  pct: number;
}) {
  const { colors, textColor } = useTheme();
  return (
    <View style={[styles.statCard, { backgroundColor: colors.card }, shadows.card]}>
      <Text style={[typography.micro, { color: colors.textTertiary }]}>{label}</Text>
      <View style={styles.statValueRow}>
        <Text style={[typography.cardStat, tabularNums, { color: textColor }]}>{value}</Text>
        <Text style={[typography.body, { color: colors.textTertiary }]}>{unit}</Text>
      </View>
      <View style={[styles.statTrack, { backgroundColor: colors.pill }]}>
        <View style={[styles.statFill, { width: `${Math.min(100, pct * 100)}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

// Shown on first load instead of a bare spinner — mirrors the strain gauge card, the stat
// row and the effort/workouts section below it.
function ActivitySkeleton() {
  return (
    <View style={{ gap: layout.cardGap }} accessible accessibilityLabel="Loading">
      <Skeleton height={300} radius={24} />
      <Skeleton height={96} radius={16} />
      <Skeleton height={200} radius={16} />
    </View>
  );
}

export default function ActivityScreen() {
  const { colors, textColor, subtleColor } = useTheme();
  const { energy: energyUnit } = usePreferences();
  const insets = useSafeAreaInsets();

  const today = toDateString(new Date());
  const [strain, setStrain] = useState<Strain | null>(null);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [gaugeWidth, setGaugeWidth] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [s, w] = await Promise.all([getStrain(today), getWorkouts().catch(() => [])]);
      setStrain(s);
      setWorkouts(w);
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

  const inOptimal =
    strain !== null && strain.strain >= strain.optimal[0] && strain.strain <= strain.optimal[1];
  const headroom = strain ? Math.max(0, strain.optimal[1] - strain.strain) : 0;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.sm }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
    >
      <Text style={[typography.screenTitle, { color: textColor }]}>Activity</Text>

      <OfflineBanner />

      {loading ? (
        <ActivitySkeleton />
      ) : error ? (
        <View style={{ marginTop: spacing.lg }}>
          <LoadError what="your activity" message={error} onRetry={() => void load()} />
        </View>
      ) : strain ? (
        <>
          {/* Glass strain gauge */}
          <View
            style={[styles.glassCard, shadows.glass]}
            onLayout={(e) => setGaugeWidth(e.nativeEvent.layout.width - spacing.xl * 2)}
          >
            <Canvas style={StyleSheet.absoluteFill}>
              <Rect x={0} y={0} width={520} height={520}>
                <LinearGradient start={vec(0, 0)} end={vec(0, 420)} colors={["#101A15", "#0A0F0C"]} />
              </Rect>
              <Rect x={0} y={0} width={520} height={520}>
                <RadialGradient
                  c={vec(150, 130)}
                  r={230}
                  colors={["rgba(34,197,94,0.22)", "rgba(34,197,94,0)"]}
                />
              </Rect>
            </Canvas>

            <View style={styles.glassHeader}>
              <View style={styles.glassEyebrowGroup}>
                <View style={styles.glassChip}>
                  <View style={styles.glassDot} />
                </View>
                <Text style={styles.glassEyebrow}>AI STRAIN GAUGE</Text>
              </View>
              <View style={styles.adaptivePill}>
                <Text style={styles.adaptiveText}>Adaptive</Text>
              </View>
            </View>

            {gaugeWidth > 0 && (
              <StrainGauge
                value={strain.strain}
                max={strain.max}
                optimal={strain.optimal}
                width={gaugeWidth}
              />
            )}

            <View style={styles.glassStatRow}>
              <View style={styles.glassStat}>
                <Text style={styles.glassStatLabel}>STATUS</Text>
                <Text style={styles.glassStatValue}>
                  {inOptimal
                    ? "On target"
                    : strain.strain < strain.optimal[0]
                      ? "Below target"
                      : "Overreaching"}
                </Text>
              </View>
              <View style={styles.glassStat}>
                <Text style={styles.glassStatLabel}>HEADROOM</Text>
                <Text style={styles.glassStatValue}>{headroom.toFixed(1)} strain</Text>
              </View>
            </View>

            <Text style={styles.glassNote}>
              {inOptimal
                ? "You're inside today's productive band. One more moderate session keeps you there."
                : strain.strain < strain.optimal[0]
                  ? `Room for more load today — about ${headroom.toFixed(1)} strain to reach the optimal band.`
                  : "Above the optimal band. Prioritise recovery so tomorrow isn't compromised."}
            </Text>
          </View>

          {/* Effort through the day */}
          <Card style={[styles.card, shadows.card]}>
            <View style={styles.cardHeader}>
              <Text style={[typography.sectionTitle, { color: textColor }]}>Effort through the day</Text>
              <Text style={[typography.body, { color: subtleColor }]}>bpm zones</Text>
            </View>
            <View style={styles.effortRow}>
              {strain.hourly.map((h) => {
                // Zone -1 (at rest) still gets a visible stub so the axis reads continuously.
                const ratio = h.zone < 0 ? 0.08 : (h.zone + 1) / 5;
                return (
                  <View
                    key={h.hour}
                    style={{
                      flex: 1,
                      height: Math.max(4, ratio * EFFORT_MAX_HEIGHT),
                      borderRadius: 3,
                      backgroundColor: zoneColor(h.zone),
                    }}
                  />
                );
              })}
            </View>
            <View style={styles.effortAxis}>
              {EFFORT_AXIS.map((a) => (
                <Text key={a.hour} style={[typography.body, { color: subtleColor }]}>
                  {a.label}
                </Text>
              ))}
            </View>
          </Card>

          {/* Progress stats */}
          <View style={styles.statRow}>
            <ProgressStat
              label="CALORIES"
              value={toDisplayEnergy(strain.calories, energyUnit).toLocaleString()}
              unit={UNIT_LABEL[energyUnit]}
              color={dataColors.calories}
              pct={strain.calories / 800}
            />
            <ProgressStat
              label="ACTIVE"
              value={strain.activeMinutes.toString()}
              unit="min"
              color={brand.green}
              pct={strain.activeMinutes / 60}
            />
            <ProgressStat
              label="STEPS"
              value={strain.steps.toLocaleString()}
              unit="steps"
              color={dataColors.steps}
              pct={strain.steps / 10000}
            />
          </View>

          {/* Workouts — moved here from its own tab, per the handoff's Activity screen. */}
          <View style={styles.section}>
            <Text style={[typography.sectionTitle, { color: textColor }]}>Workouts</Text>
            {workouts.length === 0 ? (
              <Text style={[typography.body, { color: subtleColor }]}>
                No workouts yet — sync Apple Health to see your history.
              </Text>
            ) : (
              <Card style={[styles.listCard, shadows.card]}>
                {workouts.slice(0, 8).map((w, i) => (
                  <Link key={w.id} href={`/workouts/${w.id}`} asChild>
                    <Pressable
                      // Flattened, not an array: <Link asChild> renders through expo-router's
                      // Slot, which rejects array styles on its child.
                      style={StyleSheet.flatten([
                        styles.workoutRow,
                        i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
                      ])}
                    >
                      <View style={[styles.workoutIcon, { backgroundColor: dataColors.soft.hrv }]}>
                        <Icon name="dumbbell" size={17} color={dataColors.hrv} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[typography.bodyLarge, { color: textColor, fontWeight: "600" }]}>
                          {workoutLabel(w.workout_type)}
                        </Text>
                        <Text style={[typography.body, { color: subtleColor }]}>
                          {formatDuration(w.duration_seconds)}
                          {w.calories !== null
                            ? ` · ${toDisplayEnergy(w.calories, energyUnit).toLocaleString()} ${UNIT_LABEL[energyUnit]}`
                            : ""}
                        </Text>
                      </View>
                      <Text style={[typography.body, { color: subtleColor }]}>
                        {relativeDay(w.start_date)}
                      </Text>
                    </Pressable>
                  </Link>
                ))}
              </Card>
            )}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: layout.screenPadding, paddingBottom: 40, gap: layout.cardGap },
  centered: { textAlign: "center", marginTop: 40 },
  glassCard: {
    borderRadius: radius.glass,
    padding: spacing.xl,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    gap: spacing.md,
  },
  glassHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  glassEyebrowGroup: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  glassChip: {
    width: 20,
    height: 20,
    borderRadius: 7,
    backgroundColor: brand.green,
    alignItems: "center",
    justifyContent: "center",
  },
  glassDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#FFFFFF" },
  glassEyebrow: { ...typography.micro, color: "rgba(255,255,255,0.7)" },
  adaptivePill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  adaptiveText: { ...typography.body, color: "rgba(255,255,255,0.8)" },
  glassStatRow: { flexDirection: "row", gap: layout.gridGap },
  glassStat: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: radius.field,
    padding: spacing.md,
    gap: 2,
  },
  glassStatLabel: { ...typography.micro, color: "rgba(255,255,255,0.55)" },
  glassStatValue: { ...typography.bodyLarge, color: "#FFFFFF", fontWeight: "700" },
  glassNote: { ...typography.body, color: "rgba(255,255,255,0.65)" },
  card: { gap: spacing.md },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  effortRow: { flexDirection: "row", alignItems: "flex-end", gap: 3, height: EFFORT_MAX_HEIGHT },
  effortAxis: { flexDirection: "row", justifyContent: "space-between" },
  statRow: { flexDirection: "row", gap: layout.gridGap },
  statCard: { flex: 1, borderRadius: radius.tile, padding: spacing.md, gap: spacing.s6 },
  statValueRow: { flexDirection: "row", alignItems: "baseline", gap: 3 },
  statTrack: { height: 4, borderRadius: 999, overflow: "hidden" },
  statFill: { height: "100%", borderRadius: 999 },
  section: { gap: spacing.s10 },
  listCard: { padding: 0 },
  workoutRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg },
  workoutIcon: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center" },
});
