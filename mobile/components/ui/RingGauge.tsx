// Skia ring gauge for a 0-100 score
import { Canvas, Path, Skia, SweepGradient, vec } from "@shopify/react-native-skia";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../lib/theme";

type RingGaugeProps = {
  value: number | null; // 0-100
  size?: number;
  strokeWidth?: number;
  label?: string;
  /** Daily Score uses the full purple->pink->yellow->green sweep; other gauges use a single
   * status color banded by value. */
  rainbow?: boolean;
};

// The gauge is a ~270deg arc opening at the bottom, like a speedometer (spec §1.3/§3.2).
const START_ANGLE = 135;
const SWEEP_ANGLE = 270;

function statusColor(value: number, accent: ReturnType<typeof useTheme>["colors"]["accent"]): string {
  if (value >= 70) return accent.green;
  if (value >= 40) return accent.yellow;
  return accent.red;
}

export function RingGauge({ value, size = 200, strokeWidth = 16, label, rainbow = false }: RingGaugeProps) {
  const { colors, textColor } = useTheme();
  const clamped = value === null ? 0 : Math.max(0, Math.min(100, value));
  const radius = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const rect = Skia.XYWHRect(cx - radius, cy - radius, radius * 2, radius * 2);

  // Immutable PathBuilder API (Skia 2.x) — the mutable Skia.Path.Make()+addArc()
  // pattern is deprecated and will be removed in a future Skia major.
  const trackPath = Skia.PathBuilder.Make().addArc(rect, START_ANGLE, SWEEP_ANGLE).build();

  const progressSweep = (clamped / 100) * SWEEP_ANGLE;
  const progressPath = Skia.PathBuilder.Make().addArc(rect, START_ANGLE, progressSweep).build();

  const solidColor = rainbow ? colors.accent.green : statusColor(clamped, colors.accent);

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Canvas style={{ width: size, height: size }}>
        <Path
          path={trackPath}
          style="stroke"
          strokeWidth={strokeWidth}
          strokeCap="round"
          color={colors.pill}
        />
        {value !== null && (
          <Path
            path={progressPath}
            style="stroke"
            strokeWidth={strokeWidth}
            strokeCap="round"
            color={solidColor}
          >
            {rainbow && (
              <SweepGradient
                c={vec(cx, cy)}
                colors={["#8E5CF7", "#FF2D78", "#FFD60A", "#32D74B"]}
                start={START_ANGLE}
                end={START_ANGLE + SWEEP_ANGLE}
              />
            )}
          </Path>
        )}
      </Canvas>
      <View style={styles.center} pointerEvents="none">
        <Text maxFontSizeMultiplier={1.2} style={[styles.value, { color: textColor }]}>
          {value === null ? "–" : Math.round(clamped)}
        </Text>
        {label && (
          <Text maxFontSizeMultiplier={1.2} style={[styles.label, { color: textColor }]}>
            {label}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  value: { fontSize: 40, fontWeight: "700", fontVariant: ["tabular-nums"] },
  label: { fontSize: 13, marginTop: 2 },
});
