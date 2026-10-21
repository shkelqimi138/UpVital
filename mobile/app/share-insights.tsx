// Renders today's scores into a shareable image and opens the share sheet
import { useCanvasRef } from "@shopify/react-native-skia";
import { File, Paths } from "expo-file-system";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, Share, StyleSheet, Text, View } from "react-native";
import { BottomSheetScreen } from "../components/ui/BottomSheetScreen";
import { Icon } from "../components/ui/Icon";
import { ShareCard } from "../components/ui/ShareCard";
import { friendlyMessage } from "../lib/api/client";
import { DailyMetric, getTodayMetric } from "../lib/api/daily-metrics";
import { brand, data, useTheme } from "../lib/theme";

type CardConfig = {
  key: string;
  label: string;
  value: string;
  sublabel?: string;
  sublabelColor?: string;
  progress?: number | null;
  accentColor?: string;
};

// Ring colors for the share card. The card is always dark (see ShareCard), so these are the
// brighter members of each metric's family — the app's on-surface accents (accent.green,
// data.sleep) read muddy on near-black. Metric->hue still matches the app and the widget:
// Recovery green, Sleep indigo, Stress amber.
const RING_COLORS = {
  daily: brand.greenBright,
  recovery: brand.greenBright,
  sleep: data.sleepStages.rem,
  stress: data.stress,
} as const;

export default function ShareInsightsScreen() {
  const { colors, textColor, subtleColor } = useTheme();
  const [metric, setMetric] = useState<DailyMetric | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [sharing, setSharing] = useState<string | null>(null);

  // Fixed slots, not dynamic — hooks can't be called in a loop, and there are only ever
  // up to 5 possible shareable cards (Daily Score, Recovery, Sleep, Stress, Biological Age).
  const dailyRef = useCanvasRef();
  const recoveryRef = useCanvasRef();
  const sleepRef = useCanvasRef();
  const stressRef = useCanvasRef();
  const bioAgeRef = useCanvasRef();

  useEffect(() => {
    getTodayMetric()
      .then(setMetric)
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  async function handleShare(key: string, ref: ReturnType<typeof useCanvasRef>) {
    setSharing(key);
    try {
      const image = ref.current?.makeImageSnapshot();
      if (!image) throw new Error("Card isn't ready yet");
      const bytes = image.encodeToBytes();

      const file = new File(Paths.cache, `upvital-${key}-${Date.now()}.png`);
      file.create({ overwrite: true });
      file.write(bytes);

      await Share.share({ url: file.uri });
    } catch (err) {
      Alert.alert("Couldn't share", friendlyMessage(err, "We couldn't create the image. Please try again."));
    } finally {
      setSharing(null);
    }
  }

  if (!loaded) {
    return (
      <BottomSheetScreen title="Share insights">
        <ActivityIndicator />
      </BottomSheetScreen>
    );
  }

  if (!metric) {
    return (
      <BottomSheetScreen title="Share insights">
        <Text style={{ color: subtleColor, textAlign: "center" }}>
          No score for today yet. Sync your health data, then come back to share your insights.
        </Text>
      </BottomSheetScreen>
    );
  }

  const cards: Array<{ config: CardConfig; ref: ReturnType<typeof useCanvasRef> }> = [];
  if (metric.daily_score !== null) {
    cards.push({
      config: {
        key: "daily",
        label: "Daily Score",
        value: Math.round(metric.daily_score).toString(),
        progress: metric.daily_score,
        accentColor: RING_COLORS.daily,
      },
      ref: dailyRef,
    });
  }
  if (metric.recovery_score !== null) {
    cards.push({
      config: {
        key: "recovery",
        label: "Recovery",
        value: Math.round(metric.recovery_score).toString(),
        progress: metric.recovery_score,
        accentColor: RING_COLORS.recovery,
      },
      ref: recoveryRef,
    });
  }
  if (metric.sleep_score !== null) {
    cards.push({
      config: {
        key: "sleep",
        label: "Sleep Score",
        value: Math.round(metric.sleep_score).toString(),
        progress: metric.sleep_score,
        accentColor: RING_COLORS.sleep,
      },
      ref: sleepRef,
    });
  }
  if (metric.stress_score !== null) {
    cards.push({
      config: {
        key: "stress",
        label: "Stress Score",
        value: Math.round(metric.stress_score).toString(),
        progress: metric.stress_score,
        accentColor: RING_COLORS.stress,
      },
      ref: stressRef,
    });
  }
  if (metric.biological_age !== null) {
    cards.push({
      config: {
        key: "bioAge",
        label: "Biological Age",
        value: metric.biological_age.toFixed(1),
        sublabel: "years",
      },
      ref: bioAgeRef,
    });
  }

  return (
    <BottomSheetScreen
      title="Share insights"
      leadingIcon={<Icon name="share" size={20} color={colors.accent.blue} />}
    >
      {cards.length === 0 ? (
        <Text style={{ color: subtleColor, textAlign: "center" }}>Not enough data yet.</Text>
      ) : (
        cards.map(({ config, ref }) => {
          // Pull `key` out of the spread: it's the React list key, not a ShareCard prop —
          // spreading it into JSX triggers React's reserved-"key"-prop warning.
          const { key, ...cardProps } = config;
          return (
            <View key={key} style={styles.cardRow}>
              <ShareCard canvasRef={ref} {...cardProps} />
              <Pressable
                style={StyleSheet.flatten([styles.shareButton, { backgroundColor: colors.pill }])}
                onPress={() => handleShare(key, ref)}
                disabled={sharing === key}
                accessibilityRole="button"
                accessibilityLabel={`Share ${config.label}`}
              >
                {sharing === config.key ? (
                  <ActivityIndicator color={textColor} />
                ) : (
                  <>
                    <Icon name="share" size={16} color={textColor} />
                    <Text style={{ color: textColor, fontWeight: "600" }}>Share {config.label}</Text>
                  </>
                )}
              </Pressable>
            </View>
          );
        })
      )}
    </BottomSheetScreen>
  );
}

const styles = StyleSheet.create({
  cardRow: { gap: 12, alignItems: "center" },
  shareButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
  },
});
