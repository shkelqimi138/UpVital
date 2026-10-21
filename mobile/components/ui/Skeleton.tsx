// Shimmering placeholder block shown while data loads
import { useEffect, useRef } from "react";
import { Animated, type DimensionValue, type ViewStyle } from "react-native";
import { useReducedMotion } from "../../lib/hooks/use-reduced-motion";

type SkeletonProps = {
  /** Omit to stretch to the parent's width (a column child), or pair with `flex` in `style` for a row. */
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: ViewStyle;
};

// A single shimmering placeholder block. Reused for any loading skeleton — build a screen's
// skeleton by composing these in the real layout's shape. Opacity-only pulse so it can run on
// the native driver (cheap).
export function Skeleton({ width, height = 16, radius = 8, style }: SkeletonProps) {
  const reduced = useReducedMotion();
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    // Reduce Motion: hold a steady placeholder instead of pulsing (WCAG 2.3.3).
    if (reduced) {
      opacity.setValue(0.7);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 750, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, reduced]);

  const backgroundColor = "rgba(255,255,255,0.09)";

  return <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor, opacity }, style]} />;
}
