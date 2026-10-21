// Card showing the daily AI insight
import { Canvas, LinearGradient, Rect, vec } from "@shopify/react-native-skia";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { brand, radius, spacing, typography, useTheme } from "../../lib/theme";

type InsightCardProps = {
  eyebrow?: string;
  /** Right-aligned timestamp beside the eyebrow. */
  timestamp?: string | null;
  /** Bold headline between the eyebrow and body — used by the Coach "Today's focus" card. */
  title?: string;
  body: string;
  /** Renders the mint call-to-action row when provided. */
  actionLabel?: string;
  onActionPress?: () => void;
};

// The AI insight surface: near-black in BOTH schemes (per the handoff's `insight` token)
// with a green gradient wash over it. Used on the Dashboard and reused as the Coach
// screen's "Today's focus" card.
export function InsightCard({
  eyebrow = "Today's insight",
  timestamp,
  title,
  body,
  actionLabel,
  onActionPress,
}: InsightCardProps) {
  const { colors } = useTheme();
  const [size, setSize] = useState({ width: 0, height: 0 });

  return (
    <View
      style={[styles.card, { backgroundColor: colors.insight }]}
      onLayout={(e) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
    >
      {size.width > 0 && (
        <Canvas style={StyleSheet.absoluteFill}>
          <Rect x={0} y={0} width={size.width} height={size.height}>
            {/* 140deg green wash, 22% -> 0%. */}
            <LinearGradient
              start={vec(0, 0)}
              end={vec(size.width * 0.8, size.height)}
              colors={["rgba(22,163,74,0.22)", "rgba(22,163,74,0)"]}
            />
          </Rect>
        </Canvas>
      )}

      <View style={styles.headerRow}>
        <View style={styles.eyebrowGroup}>
          <View style={styles.sparkChip}>
            <View style={styles.sparkDot} />
          </View>
          <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>{eyebrow}</Text>
        </View>
        {timestamp && <Text style={[styles.timestamp, { color: colors.textTertiary }]}>{timestamp}</Text>}
      </View>

      {title && <Text style={[styles.title, { color: colors.insightText }]}>{title}</Text>}

      <Text style={[styles.body, { color: colors.insightText }]}>{body}</Text>

      {actionLabel && (
        <Pressable onPress={onActionPress} hitSlop={8}>
          <Text style={styles.action}>{actionLabel} ›</Text>
        </Pressable>
      )}

      <Text style={[styles.disclaimer, { color: colors.textTertiary }]}>Not medical advice.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card, padding: spacing.xl, overflow: "hidden", gap: spacing.md },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  eyebrowGroup: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  sparkChip: {
    width: 22,
    height: 22,
    borderRadius: 7,
    backgroundColor: brand.green,
    alignItems: "center",
    justifyContent: "center",
  },
  sparkDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#FFFFFF" },
  eyebrow: { ...typography.micro },
  timestamp: { ...typography.body },
  title: { fontSize: 22, fontWeight: "700", letterSpacing: -0.4 },
  body: { ...typography.bodyLarge },
  action: { ...typography.body, color: brand.mintText, fontWeight: "600" },
  disclaimer: { ...typography.micro, marginTop: spacing.xs },
});
