// AI Coach tab screen: today's insight summary and the entry point into the coach chat.
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LoadError } from "../../components/ui/LoadError";
import { OfflineBanner } from "../../components/ui/OfflineBanner";
import { InsightCard } from "../../components/ui/InsightCard";
import { Skeleton } from "../../components/ui/Skeleton";
import { friendlyMessage } from "../../lib/api/client";
import { DailyActuals, getDailyActuals } from "../../lib/api/daily-actuals";
import { DailyInsight, getInsightForDate } from "../../lib/api/daily-insights";
import { DailyMetric, getMetricForDate } from "../../lib/api/daily-metrics";
import { getProfile, Profile } from "../../lib/api/profile";
import { confirmAiConsent } from "../../lib/ai-consent";
import { brand, layout, radius, spacing, typography, useTheme } from "../../lib/theme";

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Headline for the "Today's focus" card, from the daily score band. */
function focusTitle(daily: number | null): string {
  if (daily == null) return "Let's get today started";
  if (daily >= 85) return "Make the most of a strong day";
  if (daily >= 70) return "Convert recovery into output";
  if (daily >= 40) return "Keep it steady today";
  return "Prioritise recovery";
}

/** Concrete, score-derived suggestions. Each is grounded in a real number the app has —
 *  nothing is invented (the design's "1.6 / 2.5 L hydration" row is dropped because Upvital
 *  doesn't track hydration). Returns up to three. */
function buildSuggestions(
  metric: DailyMetric | null,
  actuals: DailyActuals | null,
  profile: Profile | null,
): string[] {
  const out: string[] = [];

  // Readiness, from recovery.
  if (metric?.recovery_score != null) {
    if (metric.recovery_score >= 70) out.push("You're recovered — a harder session will land well today");
    else if (metric.recovery_score < 40) out.push("Keep it easy today; your body is still recovering");
    else out.push("Aim for a moderate session — nothing too taxing");
  }

  // Sleep, against the user's own goal.
  const sleepGoal = profile?.sleepGoalHours ?? 8;
  if (actuals?.sleepHours != null) {
    const h = actuals.sleepHours;
    if (h < sleepGoal - 0.5) {
      out.push(`Get ${sleepGoal}h of sleep tonight — last night was ${h.toFixed(1)}h`);
    } else {
      out.push("Protect tonight's sleep window — it's driving your recovery");
    }
  }

  // Stress (higher = calmer here).
  if (metric?.stress_score != null && metric.stress_score < 50) {
    out.push("Take a 10-minute walk after lunch to bring stress down");
  }

  // Steps toward goal.
  if (profile?.stepGoal && actuals && actuals.steps < profile.stepGoal) {
    const remaining = profile.stepGoal - actuals.steps;
    out.push(`${remaining.toLocaleString()} steps to hit your ${profile.stepGoal.toLocaleString()} goal`);
  }

  return out.slice(0, 3);
}

// Shown on first load instead of a bare spinner — mirrors the "Today's focus" card and the
// suggestion rows under it.
function CoachSkeleton() {
  return (
    <View style={{ gap: layout.cardGap }} accessible accessibilityLabel="Loading">
      <Skeleton height={170} radius={20} />
      <Skeleton height={56} radius={16} />
      <Skeleton height={56} radius={16} />
      <Skeleton height={56} radius={16} />
    </View>
  );
}

export default function CoachScreen() {
  const { colors, textColor, subtleColor, shadows } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const today = toDateString(new Date());
  const [metric, setMetric] = useState<DailyMetric | null>(null);
  const [actuals, setActuals] = useState<DailyActuals | null>(null);
  const [insight, setInsight] = useState<DailyInsight | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [m, a, ins, p] = await Promise.all([
        getMetricForDate(today),
        getDailyActuals(today),
        getInsightForDate(today).catch(() => null),
        getProfile(),
      ]);
      setMetric(m);
      setActuals(a);
      setInsight(ins);
      setProfile(p);
    } catch (err) {
      setError(friendlyMessage(err));
    }
  }, [today]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  // The tab stays mounted, so pick up the AI switch if it was changed in Profile meanwhile.
  useFocusEffect(
    useCallback(() => {
      getProfile()
        .then(setProfile)
        .catch(() => {});
    }, []),
  );

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function openChat(seed?: string) {
    router.push({ pathname: "/coach-chat", params: seed ? { seed } : {} });
  }

  async function handleTurnOnAi() {
    if (await confirmAiConsent()) await load();
  }

  const suggestions = buildSuggestions(metric, actuals, profile);
  // The suggestions below are worked out on the phone; only the insight and the chat use the AI.
  const aiOff = profile?.aiConsent === false;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.sm }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
    >
      <Text style={[typography.screenTitle, { color: textColor }]}>AI Coach</Text>
      <Text style={[typography.bodyLarge, { color: subtleColor }]}>
        I looked at your latest data. Here's what stood out.
      </Text>

      <OfflineBanner />

      {loading ? (
        <CoachSkeleton />
      ) : error ? (
        <View style={{ marginTop: spacing.lg }}>
          <LoadError what="your coach summary" message={error} onRetry={() => void load()} />
        </View>
      ) : (
        <>
          {aiOff ? (
            <InsightCard
              eyebrow="Today's focus"
              title={focusTitle(metric?.daily_score ?? null)}
              body="AI insights are off. Turn them on for a daily insight and to chat with the coach."
              actionLabel="Turn on"
              onActionPress={() => void handleTurnOnAi()}
            />
          ) : (
            <InsightCard
              eyebrow="Today's focus"
              title={focusTitle(metric?.daily_score ?? null)}
              body={
                insight?.content ??
                "No insight yet — one is generated each morning once you have a full day of data. Ask me anything in the meantime."
              }
              actionLabel="Ask the coach"
              onActionPress={() => openChat()}
            />
          )}

          {suggestions.map((s, i) => (
            <Pressable key={i} onPress={() => openChat(s)} accessibilityRole="button" accessibilityLabel={s}>
              <View style={[styles.suggestion, { backgroundColor: colors.card }, shadows.card]}>
                <View style={[styles.dot, { backgroundColor: brand.green }]} />
                <Text style={[typography.bodyLarge, { color: textColor, flex: 1 }]}>{s}</Text>
                <Text style={[typography.bodyLarge, { color: colors.textTertiary }]}>›</Text>
              </View>
            </Pressable>
          ))}
        </>
      )}

      {/* Ask-your-coach bar — opens the chat screen. */}
      <Pressable onPress={() => openChat()} accessibilityRole="button" accessibilityLabel="Ask your coach">
        <View
          style={[styles.askBar, { backgroundColor: colors.card, borderColor: colors.border }, shadows.card]}
        >
          <Text style={[typography.bodyLarge, { color: colors.textTertiary, flex: 1 }]}>Ask your coach…</Text>
          <View style={[styles.sendChip, { backgroundColor: brand.greenDeep }]}>
            <Text style={styles.sendGlyph}>↑</Text>
          </View>
        </View>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: layout.screenPadding, paddingBottom: 40, gap: layout.cardGap },
  centered: { textAlign: "center", marginTop: 40 },
  suggestion: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radius.card,
    padding: spacing.lg,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  askBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingLeft: spacing.lg,
    paddingRight: spacing.s6,
    paddingVertical: spacing.s6,
    marginTop: spacing.sm,
  },
  sendChip: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  sendGlyph: { color: "#FFFFFF", fontSize: 18, fontWeight: "700" },
});
