// Simple ring showing a 0-100 score in its center
import { Canvas, Path, Skia } from "@shopify/react-native-skia";
import { StyleSheet, Text, View } from "react-native";
import { ring as ringTokens, tabularNums, useTheme } from "../../lib/theme";

type ScoreRingProps = {
  /** 0-100. `null` renders an empty track with a dash. */
  value: number | null;
  color: string;
  /** Large number inside the ring. Defaults to the rounded value. */
  label?: string;
  size?: number;
  strokeWidth?: number;
  /** Font size of the centred number. Scales with `size` when omitted. */
  valueFontSize?: number;
};

// A full-circle progress ring sweeping clockwise from 12 o'clock, per the design handoff
// (ring: 66px, r 27, 7px stroke, rounded cap, from -90deg).
//
// Distinct from `RingGauge`, which is the 270deg speedometer arc used by the older
// detail sheets — both are kept because the handoff uses both shapes in different places.
export function ScoreRing({
  value,
  color,
  label,
  size = ringTokens.size,
  strokeWidth = ringTokens.strokeWidth,
  valueFontSize,
}: ScoreRingProps) {
  const { colors, textColor } = useTheme();

  const clamped = value === null ? 0 : Math.max(0, Math.min(100, value));
  const radius = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const rect = Skia.XYWHRect(cx - radius, cy - radius, radius * 2, radius * 2);

  const track = Skia.PathBuilder.Make().addArc(rect, 0, 360).build();
  const progress = Skia.PathBuilder.Make()
    .addArc(rect, ringTokens.startAngle, (clamped / 100) * 360)
    .build();

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Canvas style={{ width: size, height: size }}>
        <Path path={track} style="stroke" strokeWidth={strokeWidth} color={colors.pill} />
        {value !== null && (
          <Path path={progress} style="stroke" strokeWidth={strokeWidth} strokeCap="round" color={color} />
        )}
      </Canvas>
      <View style={styles.center} pointerEvents="none">
        <Text
          maxFontSizeMultiplier={1.2}
          style={[
            styles.value,
            tabularNums,
            { color: textColor, fontSize: valueFontSize ?? Math.round(size * 0.33) },
          ]}
        >
          {label ?? (value === null ? "–" : Math.round(clamped))}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  value: { fontWeight: "700", letterSpacing: -0.6 },
});
