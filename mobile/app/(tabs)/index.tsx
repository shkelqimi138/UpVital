// Dashboard (Home) tab screen: today's scores, rings, and metric tiles
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { AppState, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Card } from "../../components/ui/Card";
import { Skeleton } from "../../components/ui/Skeleton";
import { Icon } from "../../components/ui/Icon";
import { InsightCard } from "../../components/ui/InsightCard";
import { MetricTile } from "../../components/ui/MetricTile";
import { ScoreHeroCard } from "../../components/ui/ScoreHeroCard";
import { ScoreRing } from "../../components/ui/ScoreRing";
import { LoadError } from "../../components/ui/LoadError";
import { OfflineBanner } from "../../components/ui/OfflineBanner";
import { ScreenBackground } from "../../components/ui/ScreenBackground";
import { TickScaleBar } from "../../components/ui/TickScaleBar";
import { ActivityIntradayPoint, getActivityIntraday } from "../../lib/api/activity-intraday";
import { friendlyMessage } from "../../lib/api/client";
import { AirQuality, getAirQuality, getCurrentLocation } from "../../lib/api/air-quality";
import { BodyTemperatureEntry, getBodyTemperatureEntries } from "../../lib/api/body-temperature";
import { getCaffeineEntries, totalRemainingAt } from "../../lib/api/caffeine";
import { DailyActuals, getDailyActuals } from "../../lib/api/daily-actuals";
import { DailyInsight, getInsightForDate } from "../../lib/api/daily-insights";
import {
  computeStreak,
  DailyMetric,
  getDailyMetrics,
  getMetricForDate,
  STREAK_LOOKBACK_DAYS,
} from "../../lib/api/daily-metrics";
import { getLongevity, Longevity } from "../../lib/api/longevity";
import { getOxygenSaturationEntries, OxygenSaturationEntry } from "../../lib/api/oxygen-saturation";
import { avatarInitials, getProfile, greetingName, Profile } from "../../lib/api/profile";
import { getRecoveryDetail, RecoveryDetail } from "../../lib/api/recovery-detail";
import { supabase } from "../../lib/auth/supabase";
import { updateWidgetFromMetric } from "../../lib/widget";
import { data as dataColors, layout, spacing, tabularNums, typography, useTheme } from "../../lib/theme";
import { usePreferences } from "../../lib/preferences";
import { toDisplayEnergy, toDisplayTemperature, toPercent, UNIT_LABEL } from "../../lib/units";

/** Window used for the hero's "+N vs 7-day avg" comparison. */
const COMPARISON_DAYS = 7;

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isToday(date: string): boolean {
  return date === toDateString(new Date());
}

function chronologicalAgeYears(birthdate: string): number {
  return (Date.now() - new Date(birthdate).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

// Band vocabulary. The handoff shows "Optimal" / "Excellent" / "Low" but doesn't define
// thresholds, so these follow the app's existing 0-39 / 40-69 / 70-100 bands.
// Stress is worded for Upvital's polarity — its stress_score is already inverted at the
// source so HIGHER means calmer, the opposite of the reference app's raw number.
function dailyBand(score: number): string {
  if (score >= 85) return "Optimal";
  if (score >= 70) return "Strong";
  if (score >= 40) return "Steady";
  return "Low";
}

function recoveryBand(score: number): string {
  if (score >= 85) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 40) return "Fair";
  return "Low";
}

function stressBand(score: number): string {
  if (score >= 70) return "Calm";
  if (score >= 40) return "Moderate";
  return "High";
}

// Short readiness line under the hero score. The handoff's hero carries a band-specific
// sentence ("Your body is ready to perform at its best today"), NOT the AI insight — the
// insight has its own card lower down, and using it in both places showed the same
// paragraph twice.
function heroMessage(score: number): string {
  if (score >= 85) return "Your body is ready to perform at its best today. Push a little harder.";
  if (score >= 70) return "You're in good shape today — a solid session should land well.";
  if (score >= 40) return "Readiness is middling. Keep the effort moderate and protect tonight's sleep.";
  return "Your body is asking for recovery. Keep today easy.";
}

function formatSleepDuration(hours: number | null): string | null {
  if (hours === null) return null;
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${m}m`;
}

function GoalRow({
  label,
  actual,
  goal,
  unit,
}: {
  label: string;
  actual: number;
  goal: number;
  unit: string;
}) {
  const { colors, textColor, subtleColor } = useTheme();
  const pct = Math.max(0, Math.min(1, actual / goal));
  return (
    <View style={styles.goalRow}>
      <View style={styles.goalHeader}>
        <Text style={[typography.body, { color: textColor }]}>{label}</Text>
        <Text style={[typography.body, tabularNums, { color: subtleColor }]}>
          {actual.toLocaleString(undefined, { maximumFractionDigits: 1 })} / {goal.toLocaleString()} {unit}
        </Text>
      </View>
      <View style={[styles.goalTrack, { backgroundColor: colors.pill }]}>
        <View style={[styles.goalFill, { width: `${pct * 100}%`, backgroundColor: dataColors.steps }]} />
      </View>
    </View>
  );
}

// Shown on first load instead of a bare spinner — mirrors the hero + tile layout so the
// screen's shape is recognisable while the data arrives.
function DashboardSkeleton() {
  return (
    <View style={{ gap: 14, marginTop: 8 }} accessible accessibilityLabel="Loading">
      <Skeleton height={188} radius={20} />
      <View style={styles.grid}>
        <Skeleton height={96} radius={16} style={{ flex: 1 }} />
        <Skeleton height={96} radius={16} style={{ flex: 1 }} />
      </View>
      <View style={styles.grid}>
        <Skeleton height={96} radius={16} style={{ flex: 1 }} />
        <Skeleton height={96} radius={16} style={{ flex: 1 }} />
      </View>
      <Skeleton height={64} radius={16} />
    </View>
  );
}

export default function DashboardScreen() {
  const { colors, textColor, subtleColor, radius, shadows } = useTheme();
  const { energy: energyUnit, temperature: temperatureUnit } = usePreferences();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [selectedDate, setSelectedDate] = useState(() => toDateString(new Date()));
  const [metric, setMetric] = useState<DailyMetric | null>(null);
  const [history, setHistory] = useState<DailyMetric[]>([]);
  const [streak, setStreak] = useState(0);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [actuals, setActuals] = useState<DailyActuals | null>(null);
  const [insight, setInsight] = useState<DailyInsight | null>(null);
  const [longevity, setLongevity] = useState<Longevity | null>(null);
  const [recovery, setRecovery] = useState<RecoveryDetail | null>(null);
  const [spo2, setSpo2] = useState<OxygenSaturationEntry | null>(null);
  const [bodyTemp, setBodyTemp] = useState<BodyTemperatureEntry | null>(null);
  const [intraday, setIntraday] = useState<ActivityIntradayPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [airQuality, setAirQuality] = useState<AirQuality | null>(null);
  // Caffeine still active in the body right now (half-life decay), shown only for today.
  const [caffeineActive, setCaffeineActive] = useState<number | null>(null);

  const load = useCallback(async (date: string) => {
    try {
      setError(null);
      const streakStart = toDateString(
        new Date(new Date(`${date}T00:00:00.000Z`).getTime() - STREAK_LOOKBACK_DAYS * 24 * 60 * 60 * 1000),
      );
      const [
        todayMetric,
        streakRange,
        todayProfile,
        todayActuals,
        todayInsight,
        todayLongevity,
        todayRecovery,
        todayIntraday,
        todaySpo2,
        todayBodyTemp,
        todayCaffeine,
      ] = await Promise.all([
        getMetricForDate(date),
        getDailyMetrics(streakStart, date),
        getProfile(),
        getDailyActuals(date),
        getInsightForDate(date).catch(() => null),
        getLongevity(date).catch(() => null),
        getRecoveryDetail(date).catch(() => null),
        getActivityIntraday(date).catch(() => ({ hourly: [] })),
        getOxygenSaturationEntries()
          .then((entries) => entries[0] ?? null)
          .catch(() => null),
        getBodyTemperatureEntries()
          .then((entries) => entries[0] ?? null)
          .catch(() => null),
        getCaffeineEntries(date).catch(() => [] as Awaited<ReturnType<typeof getCaffeineEntries>>),
      ]);
      setMetric(todayMetric);
      setHistory(streakRange);
      const currentStreak = computeStreak(streakRange, date);
      setStreak(currentStreak);
      // Keep the Home Screen widget in sync — but only when viewing today, since the
      // widget represents the current day (browsing a past date must not overwrite it).
      if (isToday(date)) updateWidgetFromMetric(todayMetric, currentStreak);
      setProfile(todayProfile);
      setActuals(todayActuals);
      setInsight(todayInsight);
      setLongevity(todayLongevity);
      setRecovery(todayRecovery);
      setIntraday(todayIntraday.hourly);
      setSpo2(todaySpo2);
      setBodyTemp(todayBodyTemp);
      // "Active now" only makes sense for today; a past date would show a decayed value
      // against the current clock, so leave it blank when browsing history.
      setCaffeineActive(
        isToday(date) && todayCaffeine.length ? totalRemainingAt(todayCaffeine, new Date()) : null,
      );
    } catch (err) {
      setError(friendlyMessage(err));
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load(selectedDate).finally(() => setLoading(false));
  }, [selectedDate, load]);

  // Re-fetch whenever the app returns to the foreground. Switching to another app suspends us
  // (iOS freezes JS and cuts the network), so a sync in flight is cut off; without this the
  // dashboard would sit on whatever it had — possibly a stale/offline state — until a manual
  // pull-to-refresh. Reloading on return lands on fresh data and clears any offline banner.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void load(selectedDate);
    });
    return () => sub.remove();
  }, [selectedDate, load]);

  // Email backs the avatar/greeting fallback when no display name is set yet.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user.email ?? null));
  }, []);

  // Show air quality inline only if location is ALREADY granted — don't prompt on Home load.
  // Tapping the card still opens the detail (which requests permission on demand).
  useEffect(() => {
    (async () => {
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (!perm.granted) return;
        const loc = await getCurrentLocation();
        setAirQuality(await getAirQuality(loc.latitude, loc.longitude));
      } catch {
        // leave the card as the tappable fallback
      }
    })();
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    await load(selectedDate);
    setRefreshing(false);
  }

  function stepDate(deltaDays: number) {
    const next = new Date(`${selectedDate}T00:00:00.000Z`);
    next.setUTCDate(next.getUTCDate() + deltaDays);
    const nextStr = toDateString(next);
    if (nextStr > toDateString(new Date())) return;
    setSelectedDate(nextStr);
  }

  const dayLabel = isToday(selectedDate) ? "TODAY" : selectedDate;
  const name = greetingName(profile?.displayName ?? null, email);
  const initials = avatarInitials(profile?.displayName ?? null, email);

  const subtitleDate = new Date(`${selectedDate}T00:00:00.000Z`).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });

  // "+N vs 7-day avg" — the trailing week excluding the day being viewed.
  const priorScores = history
    .filter((m) => m.date < selectedDate && m.daily_score != null)
    .slice(-COMPARISON_DAYS)
    .map((m) => m.daily_score as number);
  const average = priorScores.length ? priorScores.reduce((a, b) => a + b, 0) / priorScores.length : null;
  const delta = metric?.daily_score != null && average !== null ? metric.daily_score - average : null;
  const comparison =
    delta === null ? null : `${delta >= 0 ? "+" : ""}${delta.toFixed(0)} vs ${COMPARISON_DAYS}-day avg`;

  const heroSeries = intraday.map((p) => p.calories);

  return (
    <ScreenBackground source={require("../../assets/bg-dashboard.png")} scrim={0.25}>
      <ScrollView
        style={{ backgroundColor: "transparent" }}
        contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.sm }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {/* Greeting row (design) */}
        <View style={styles.greetingRow}>
          <View style={{ flex: 1 }}>
            <Text style={[typography.screenTitle, { color: textColor }]} numberOfLines={1}>
              {greeting()}
              {name ? `, ${name}` : ""}
            </Text>
            <Text style={[typography.body, { color: subtleColor, marginTop: 2 }]}>
              {subtitleDate} · Here&apos;s your day
            </Text>
          </View>
          <Pressable
            onPress={() => router.push("/settings")}
            style={[styles.avatar, { backgroundColor: colors.pill }]}
          >
            <Text style={[typography.label, { color: textColor }]}>{initials}</Text>
          </Pressable>
        </View>

        {/* Controls row — streak, date navigator and share, kept from the existing app. */}
        <View style={styles.controlsRow}>
          <View style={[styles.pill, { backgroundColor: colors.pill }]}>
            <Icon name="flame" size={15} color={colors.accent.orange} />
            <Text style={[typography.label, tabularNums, { color: textColor }]}>{streak}</Text>
          </View>

          <View style={[styles.pill, styles.dateNav, { backgroundColor: colors.pill }]}>
            <Pressable
              onPress={() => stepDate(-1)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Previous day"
            >
              <Icon name="chevronLeft" size={15} color={subtleColor} />
            </Pressable>
            <Text style={[typography.label, { color: textColor }]}>{dayLabel}</Text>
            <Pressable
              onPress={() => stepDate(1)}
              hitSlop={8}
              disabled={isToday(selectedDate)}
              accessibilityRole="button"
              accessibilityLabel="Next day"
            >
              <Icon
                name="chevronRight"
                size={15}
                color={isToday(selectedDate) ? colors.border : subtleColor}
              />
            </Pressable>
          </View>

          <Pressable
            style={[styles.iconButton, { backgroundColor: colors.pill }]}
            onPress={() => router.push("/share-insights")}
            accessibilityRole="button"
            accessibilityLabel="Share insights"
          >
            <Icon name="share" size={17} color={textColor} />
          </Pressable>
        </View>

        <OfflineBanner />

        {loading ? (
          <DashboardSkeleton />
        ) : error ? (
          <View style={{ marginTop: spacing.lg }}>
            <LoadError what="your dashboard" message={error} onRetry={() => void load(selectedDate)} />
          </View>
        ) : !metric ? (
          <Text style={[typography.body, styles.centered, { color: subtleColor }]}>
            No scores for {isToday(selectedDate) ? "today" : "this day"} yet — connect Apple Health and sync
            to see your scores.
          </Text>
        ) : (
          <>
            <ScoreHeroCard
              score={metric.daily_score}
              bandLabel={metric.daily_score != null ? dailyBand(metric.daily_score) : "–"}
              comparison={comparison}
              body={metric.daily_score != null ? heroMessage(metric.daily_score) : null}
              trend={heroSeries}
            />

            {/* Three score rings */}
            <View style={styles.ringRow}>
              <RingTile
                label="Recovery"
                caption={metric.recovery_score != null ? recoveryBand(metric.recovery_score) : null}
                value={metric.recovery_score}
                color={dataColors.hrv}
                onPress={() => router.push("/recovery-detail")}
              />
              <RingTile
                label="Sleep"
                caption={formatSleepDuration(actuals?.sleepHours ?? null)}
                value={metric.sleep_score}
                color={dataColors.sleep}
                onPress={() => router.push("/sleep-detail")}
              />
              <RingTile
                label="Stress"
                caption={metric.stress_score != null ? stressBand(metric.stress_score) : null}
                value={metric.stress_score}
                color={dataColors.stress}
                onPress={() => router.push("/stress-detail")}
              />
            </View>

            {insight && (
              <InsightCard
                timestamp={new Date(insight.created_at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                body={insight.content}
                actionLabel="Ask the coach"
                onActionPress={() => router.push("/insight")}
              />
            )}
          </>
        )}

        {/* Biological age */}
        {profile?.birthdate && longevity?.biologicalAge != null && (
          <Pressable onPress={() => router.push("/biological-age-detail")}>
            <Card style={[styles.card, shadows.card]}>
              <View style={styles.cardHeader}>
                <Text style={[typography.body, { color: subtleColor }]}>Biological age</Text>
                <View style={styles.headerRight}>
                  {(() => {
                    // The API returns biological age and pace only; the "N yrs younger" delta is
                    // derived here against the chronological age from the profile's birthdate.
                    const actualAge = chronologicalAgeYears(profile.birthdate!);
                    const younger = actualAge - longevity.biologicalAge!;
                    return (
                      <View style={[styles.deltaPill, { backgroundColor: dataColors.soft.hrv }]}>
                        <Text style={[typography.label, { color: dataColors.hrv }]}>
                          {younger >= 0
                            ? `${younger.toFixed(1)} yrs younger`
                            : `${Math.abs(younger).toFixed(1)} yrs older`}
                        </Text>
                      </View>
                    );
                  })()}
                  <Icon name="chevronRight" size={16} color={subtleColor} />
                </View>
              </View>
              <Text style={[typography.bigStat, tabularNums, { color: textColor }]}>
                {longevity.biologicalAge.toFixed(1)}
              </Text>
              <Text style={[typography.body, { color: subtleColor }]}>
                vs {Math.round(chronologicalAgeYears(profile.birthdate!))} actual
              </Text>
              {longevity.paceOfAging != null && (
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
              )}
            </Card>
          </Pressable>
        )}

        {/* Air quality */}
        <Pressable onPress={() => router.push("/air-quality-detail")}>
          <Card style={[styles.rowCard, shadows.card]}>
            <View
              style={[styles.iconChip, { backgroundColor: dataColors.soft.steps, borderRadius: radius.md }]}
            >
              <Icon name="wind" size={18} color={dataColors.steps} />
            </View>
            <Text style={[typography.bodyLarge, { color: textColor, flex: 1 }]}>Air quality</Text>
            {airQuality && (
              <Text style={[typography.bodyLarge, { color: subtleColor, marginRight: 8 }]}>
                {airQuality.aqiIndex} · {airQuality.aqiLabel}
              </Text>
            )}
            <Icon name="chevronRight" size={16} color={subtleColor} />
          </Card>
        </Pressable>

        {/* Caffeine */}
        <Pressable onPress={() => router.push("/caffeine-detail")}>
          <Card style={[styles.rowCard, shadows.card]}>
            <View
              style={[
                styles.iconChip,
                { backgroundColor: dataColors.soft.calories, borderRadius: radius.md },
              ]}
            >
              <Icon name="coffee" size={18} color={dataColors.calories} />
            </View>
            <Text style={[typography.bodyLarge, { color: textColor, flex: 1 }]}>Caffeine</Text>
            {caffeineActive != null && (
              <Text style={[typography.bodyLarge, { color: subtleColor, marginRight: 8 }]}>
                {Math.round(caffeineActive)} mg active
              </Text>
            )}
            <Icon name="chevronRight" size={16} color={subtleColor} />
          </Card>
        </Pressable>

        {/* Health Overview */}
        <View style={styles.section}>
          <Text style={[typography.sectionTitle, { color: textColor }]}>Health Overview</Text>
          <View style={styles.grid}>
            <MetricTile
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
            />
            <MetricTile
              name="HRV"
              display={recovery?.hrv.value != null ? Math.round(recovery.hrv.value).toString() : null}
              unit="ms"
              icon="heartPulse"
              color={dataColors.hrv}
              softColor={dataColors.soft.hrv}
              series={recovery?.hrv.series}
            />
          </View>
          <View style={styles.grid}>
            <MetricTile
              name="Steps"
              display={actuals ? actuals.steps.toLocaleString() : null}
              unit="steps"
              icon="footprints"
              color={dataColors.steps}
              softColor={dataColors.soft.steps}
              series={intraday.map((p) => p.steps)}
            />
            <MetricTile
              name="Calories"
              display={actuals ? toDisplayEnergy(actuals.activeCalories, energyUnit).toLocaleString() : null}
              unit={UNIT_LABEL[energyUnit]}
              icon="flame"
              color={dataColors.calories}
              softColor={dataColors.soft.calories}
              series={heroSeries}
            />
          </View>
          <View style={styles.grid}>
            <MetricTile
              name="Blood Oxygen"
              display={spo2 ? Math.round(toPercent(spo2.value)).toString() : null}
              unit="%"
              icon="droplet"
              color={dataColors.spo2}
              softColor={dataColors.soft.sleep}
            />
            <MetricTile
              name="Body Temp"
              display={bodyTemp ? toDisplayTemperature(bodyTemp.value, temperatureUnit).toFixed(1) : null}
              unit={UNIT_LABEL[temperatureUnit]}
              icon="thermometer"
              color={dataColors.bodyTemp}
              softColor={dataColors.soft.bodyTemp}
            />
          </View>
        </View>

        {/* Goals */}
        {profile && actuals && (profile.stepGoal || profile.sleepGoalHours || profile.activeCalorieGoal) && (
          <View style={styles.section}>
            <Text style={[typography.sectionTitle, { color: textColor }]}>Goals</Text>
            <Card style={[styles.card, shadows.card]}>
              {profile.stepGoal ? (
                <GoalRow label="Steps" actual={actuals.steps} goal={profile.stepGoal} unit="steps" />
              ) : null}
              {profile.sleepGoalHours ? (
                <GoalRow
                  label="Sleep"
                  actual={actuals.sleepHours ?? 0}
                  goal={profile.sleepGoalHours}
                  unit="h"
                />
              ) : null}
              {profile.activeCalorieGoal ? (
                <GoalRow
                  label="Active energy"
                  actual={toDisplayEnergy(actuals.activeCalories, energyUnit)}
                  goal={toDisplayEnergy(profile.activeCalorieGoal, energyUnit)}
                  unit={UNIT_LABEL[energyUnit]}
                />
              ) : null}
            </Card>
          </View>
        )}
      </ScrollView>
    </ScreenBackground>
  );
}

function RingTile({
  label,
  caption,
  value,
  color,
  onPress,
}: {
  label: string;
  caption: string | null;
  value: number | null;
  color: string;
  onPress: () => void;
}) {
  const { colors, textColor, shadows, radius } = useTheme();
  return (
    <Pressable style={{ flex: 1 }} onPress={onPress}>
      <View
        style={[styles.ringTile, { backgroundColor: colors.card, borderRadius: radius.tile }, shadows.card]}
      >
        <ScoreRing value={value} color={color} />
        <Text style={[typography.body, { color: textColor, fontWeight: "600" }]}>{label}</Text>
        {caption && <Text style={[typography.body, { color }]}>{caption}</Text>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: layout.screenPadding,
    paddingBottom: 40,
    gap: layout.cardGap,
  },
  greetingRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  controlsRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.s6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
  },
  dateNav: { flex: 1, justifyContent: "space-between" },
  iconButton: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  centered: { textAlign: "center", marginTop: 40 },
  ringRow: { flexDirection: "row", gap: layout.gridGap },
  ringTile: {
    alignItems: "center",
    gap: spacing.s6,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.sm,
  },
  card: { gap: spacing.s6 },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  deltaPill: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: 999 },
  rowCard: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  iconChip: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  section: { gap: spacing.s10 },
  grid: { flexDirection: "row", gap: layout.gridGap },
  listCard: { padding: 0 },
  activityRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg },
  goalRow: { gap: spacing.s6, paddingVertical: spacing.s6 },
  goalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  goalTrack: { height: 8, borderRadius: 999, overflow: "hidden" },
  goalFill: { height: "100%", borderRadius: 999 },
});
