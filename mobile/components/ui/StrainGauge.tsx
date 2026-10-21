// Day Strain gauge with the optimal range marked (Activity tab)
import { BlurMask, Canvas, Circle, LinearGradient, Path, Skia, vec } from "@shopify/react-native-skia";
import { StyleSheet, Text, View } from "react-native";
import { brand, gauge as gaugeTokens, tabularNums, typography } from "../../lib/theme";

type StrainGaugeProps = {
  value: number;
  max: number;
  optimal: readonly [number, number];
  /** Rendered width; the gauge scales to fit. */
  width: number;
};

const DESIGN_WIDTH = 260;
const DESIGN_HEIGHT = 212;

function polar(cx: number, cy: number, r: number, degrees: number) {
  const rad = (degrees * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

// The Activity screen's 270-degree strain arc: a muted track, a lighter segment marking
// the optimal band, and a glowing gradient progress arc with a knob at its tip.
// Drawn with Skia to stay consistent with the app's other charts.
export function StrainGauge({ value, max, optimal, width }: StrainGaugeProps) {
  const scale = width / DESIGN_WIDTH;
  const height = DESIGN_HEIGHT * scale;

  const { cx, cy, r, startAngle, sweep, strokeWidth } = gaugeTokens;
  const rect = Skia.XYWHRect(cx - r, cy - r, r * 2, r * 2);

  const clamped = Math.max(0, Math.min(max, value));
  const progressSweep = (clamped / max) * sweep;

  const track = Skia.PathBuilder.Make().addArc(rect, startAngle, sweep).build();
  const optimalBand = Skia.PathBuilder.Make()
    .addArc(rect, startAngle + (optimal[0] / max) * sweep, ((optimal[1] - optimal[0]) / max) * sweep)
    .build();
  const progress = Skia.PathBuilder.Make().addArc(rect, startAngle, progressSweep).build();

  const knob = polar(cx, cy, r, startAngle + progressSweep);

  return (
    <View style={{ width, height, alignItems: "center", justifyContent: "center" }}>
      <Canvas style={{ width, height }}>
        <Path
          path={track}
          style="stroke"
          strokeWidth={strokeWidth}
          strokeCap="round"
          color="rgba(255,255,255,0.09)"
          transform={[{ scale }]}
        />
        <Path
          path={optimalBand}
          style="stroke"
          strokeWidth={strokeWidth}
          color="rgba(255,255,255,0.18)"
          transform={[{ scale }]}
        />
        {clamped > 0 && (
          <>
            <Path
              path={progress}
              style="stroke"
              strokeWidth={strokeWidth}
              strokeCap="round"
              transform={[{ scale }]}
            >
              <LinearGradient
                start={vec(0, 0)}
                end={vec(DESIGN_WIDTH, DESIGN_HEIGHT)}
                colors={[...brand.gaugeGradient]}
              />
              <BlurMask blur={6} style="solid" />
            </Path>
            <Circle cx={knob.x} cy={knob.y} r={7.5} color="#FFFFFF" transform={[{ scale }]} />
          </>
        )}
      </Canvas>

      <View style={styles.center} pointerEvents="none">
        <Text maxFontSizeMultiplier={1.2} style={styles.eyebrow}>
          DAY STRAIN
        </Text>
        <Text maxFontSizeMultiplier={1.2} style={[styles.value, tabularNums]}>
          {clamped.toFixed(1)}
        </Text>
        <Text maxFontSizeMultiplier={1.2} style={styles.caption}>
          of {max} · optimal {optimal[0]}–{optimal[1]}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // The arc is bottom-open, so the readout sits slightly above centre to stay inside it.
  center: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", paddingBottom: 26 },
  eyebrow: { ...typography.micro, color: "rgba(255,255,255,0.6)" },
  value: { fontSize: 56, fontWeight: "700", letterSpacing: -2.2, color: "#FFFFFF", marginVertical: 2 },
  caption: { ...typography.body, color: "rgba(255,255,255,0.65)" },
});
