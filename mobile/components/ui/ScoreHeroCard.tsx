// Dashboard hero card with the Daily Score ring and today's sparkline
import { Canvas, LinearGradient, Rect, RadialGradient, vec } from "@shopify/react-native-skia";
import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { brand, motion, radius, shadows, spacing, tabularNums, typography } from "../../lib/theme";
import { useReducedMotion } from "../../lib/hooks/use-reduced-motion";
import { Sparkline } from "./Sparkline";

type ScoreHeroCardProps = {
  score: number | null;
  /** Band word shown beside the score, e.g. "Optimal". */
  bandLabel: string;
  /** Comparison line, e.g. "+4 vs 7-day avg". */
  comparison?: string | null;
  /** Sentence under the score. */
  body?: string | null;
  /** Intraday series for the sparkline. */
  trend: number[];
  onPress?: () => void;
};

const AXIS_LABELS = ["00:00", "06:00", "12:00", "Now"];
const CHART_HEIGHT = 88;

// Dashboard hero: brand-green gradient card with a radial highlight, a live pill, the
// count-up score and an intraday sparkline. Background is drawn with Skia so no gradient
// dependency is needed (the app already ships Skia for its rings and charts).
export function ScoreHeroCard({ score, bandLabel, comparison, body, trend, onPress }: ScoreHeroCardProps) {
  const [width, setWidth] = useState(0);
  const reduced = useReducedMotion();
  const pulse = useRef(new Animated.Value(1)).current;

  // "LIVE" dot pulse — 2.4s loop per the handoff's motion spec. Held steady under Reduce Motion.
  useEffect(() => {
    if (reduced) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.25,
          duration: motion.livePulse.duration / 2,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: motion.livePulse.duration / 2,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduced]);

  const chartWidth = Math.max(0, width - spacing.xl * 2);

  return (
    <Pressable onPress={onPress} disabled={!onPress}>
      <View style={[styles.card, shadows.greenHero]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 && (
          <Canvas style={StyleSheet.absoluteFill}>
            <Rect x={0} y={0} width={width} height={400}>
              <LinearGradient
                // 158deg, expressed as a vector across the card.
                start={vec(0, 0)}
                end={vec(width * 0.4, 400)}
                colors={[...brand.heroGradient]}
              />
            </Rect>
            {/* Soft white highlight in the top-right corner. */}
            <Rect x={0} y={0} width={width} height={400}>
              <RadialGradient
                c={vec(width * 0.86, 46)}
                r={width * 0.6}
                colors={["rgba(255,255,255,0.22)", "rgba(255,255,255,0)"]}
              />
            </Rect>
          </Canvas>
        )}

        <View style={styles.topRow}>
          <Text style={styles.label}>Daily Score</Text>
          <View style={styles.livePill}>
            <Animated.View style={[styles.liveDot, { opacity: pulse }]} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        </View>

        <View style={styles.scoreRow}>
          <Text maxFontSizeMultiplier={1.3} style={[styles.score, tabularNums]}>
            {score === null ? "–" : Math.round(score)}
          </Text>
          <View style={styles.scoreMeta}>
            <Text style={styles.band}>{bandLabel}</Text>
            {comparison && <Text style={styles.comparison}>{comparison}</Text>}
          </View>
        </View>

        {body && <Text style={styles.body}>{body}</Text>}

        {chartWidth > 0 && trend.length > 1 && (
          <View style={styles.chart}>
            <Sparkline
              points={trend}
              width={chartWidth}
              height={CHART_HEIGHT}
              color="#FFFFFF"
              strokeWidth={2.4}
              fill
              fillOpacity={0.26}
            />
            <View style={styles.axisRow}>
              {AXIS_LABELS.map((l) => (
                <Text key={l} style={styles.axisLabel}>
                  {l}
                </Text>
              ))}
            </View>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.hero,
    padding: spacing.xl,
    overflow: "hidden",
  },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: { ...typography.bodyLarge, color: "#FFFFFF", fontWeight: "600" },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.s6,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: brand.mint },
  liveText: { ...typography.micro, color: "#FFFFFF" },
  scoreRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.md },
  score: { ...typography.heroScore, color: "#FFFFFF" },
  scoreMeta: { justifyContent: "center" },
  band: { fontSize: 21, fontWeight: "700", letterSpacing: -0.4, color: "#FFFFFF" },
  comparison: { ...typography.body, color: brand.mint, marginTop: 2 },
  body: { ...typography.bodyLarge, color: "rgba(255,255,255,0.92)", marginTop: spacing.md },
  chart: { marginTop: spacing.lg },
  axisRow: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.s6 },
  axisLabel: { fontSize: 11, fontWeight: "500", color: "rgba(255,255,255,0.7)" },
});
