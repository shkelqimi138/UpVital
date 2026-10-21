// Gradient card with one big stat (Health tab overview)
import { Canvas, LinearGradient, Rect, vec } from "@shopify/react-native-skia";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { radius, spacing, tabularNums, typography } from "../../lib/theme";

type GradientStatCardProps = {
  label: string;
  value: number | null;
  /** Small unit shown beside the value, e.g. "%" or "score". */
  unit?: string;
  /** Footer line; rendered with a trailing chevron. */
  caption?: string | null;
  colors: readonly string[];
  shadow?: object;
  /** Draws the crescent moon used by the Sleep card. */
  moon?: boolean;
  /** Colour that bites the crescent out — should match the gradient where the moon sits. */
  cutoutColor?: string;
  onPress?: () => void;
};

// The paired entry cards at the top of the Health screen: Recovery (brand green) and
// Sleep (indigo night gradient). Gradient is drawn with Skia, same as the Dashboard hero,
// so no gradient library is needed.
export function GradientStatCard({
  label,
  value,
  unit,
  caption,
  colors,
  shadow,
  moon = false,
  cutoutColor,
  onPress,
}: GradientStatCardProps) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  return (
    <Pressable style={{ flex: 1 }} onPress={onPress} disabled={!onPress}>
      <View
        style={[styles.card, shadow]}
        onLayout={(e) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
      >
        {size.width > 0 && (
          <Canvas style={StyleSheet.absoluteFill}>
            <Rect x={0} y={0} width={size.width} height={size.height}>
              <LinearGradient
                start={vec(0, 0)}
                end={vec(size.width * 0.5, size.height)}
                colors={[...colors]}
              />
            </Rect>
          </Canvas>
        )}

        {moon && (
          // Crescent built from two overlapping discs — the second is filled with the
          // card's own gradient end colour to "bite" a curve out of the first.
          <View style={styles.moonWrap} pointerEvents="none">
            <View style={styles.moonDisc} />
            <View
              style={[styles.moonCutout, { backgroundColor: cutoutColor ?? colors[colors.length - 1] }]}
            />
          </View>
        )}

        <Text style={[typography.body, styles.label]}>{label}</Text>
        <View style={styles.valueRow}>
          <Text style={[typography.bigStat, tabularNums, styles.value]}>
            {value === null ? "–" : Math.round(value)}
          </Text>
          {unit && <Text style={[typography.body, styles.unit]}>{unit}</Text>}
        </View>
        {caption && <Text style={[typography.body, styles.caption]}>{caption} ›</Text>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.card,
    padding: spacing.lg,
    overflow: "hidden",
    minHeight: 128,
    justifyContent: "space-between",
  },
  label: { color: "rgba(255,255,255,0.92)", fontWeight: "600" },
  valueRow: { flexDirection: "row", alignItems: "baseline", gap: 4 },
  value: { color: "#FFFFFF" },
  unit: { color: "rgba(255,255,255,0.75)" },
  caption: { color: "rgba(255,255,255,0.92)", fontWeight: "600" },
  moonWrap: { position: "absolute", top: 14, right: 14, width: 62, height: 62 },
  moonDisc: { position: "absolute", width: 54, height: 54, borderRadius: 27, backgroundColor: "#FFFFFF" },
  moonCutout: { position: "absolute", left: -14, top: -8, width: 54, height: 54, borderRadius: 27 },
});
