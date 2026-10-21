// Horizontal bar with colored bands and a marker for the current value
import { Canvas, LinearGradient, Rect, vec } from "@shopify/react-native-skia";
import { useState } from "react";
import { LayoutChangeEvent, View } from "react-native";
import { useTheme } from "../../lib/theme";

type ThresholdBarProps = {
  /** 0-1 position of the current value along the bar's domain. */
  position: number;
  /** Gradient stops, left to right. Defaults to a red->yellow->green band. */
  colors?: string[];
  height?: number;
};

// Gradient bar + pointer triangle (AQI/HRV/stress threshold bars).
export function ThresholdBar({ position, colors: gradientColors, height = 10 }: ThresholdBarProps) {
  const { colors, radius } = useTheme();
  const [width, setWidth] = useState(0);
  const stops = gradientColors ?? [colors.accent.red, colors.accent.yellow, colors.accent.green];
  const clamped = Math.max(0, Math.min(1, position));

  function onLayout(e: LayoutChangeEvent) {
    setWidth(e.nativeEvent.layout.width);
  }

  return (
    <View style={{ width: "100%", paddingTop: 8 }} onLayout={onLayout}>
      <View style={{ height, borderRadius: radius.full, overflow: "hidden" }}>
        {width > 0 && (
          <Canvas style={{ width, height }}>
            <Rect x={0} y={0} width={width} height={height}>
              <LinearGradient start={vec(0, 0)} end={vec(width, 0)} colors={stops} />
            </Rect>
          </Canvas>
        )}
      </View>
      {width > 0 && (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: clamped * width - 5,
            width: 0,
            height: 0,
            borderLeftWidth: 5,
            borderRightWidth: 5,
            borderTopWidth: 6,
            borderLeftColor: "transparent",
            borderRightColor: "transparent",
            borderTopColor: colors.textPrimary,
          }}
        />
      )}
    </View>
  );
}
