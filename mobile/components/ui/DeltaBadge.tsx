// Up/down change badge, colored by whether that metric going up is good
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../lib/theme";

type DeltaBadgeProps = {
  delta: number;
  /** Whether an increase is good news for this specific metric — see lib/theme/polarity.ts. */
  higherIsBetter?: boolean;
  decimals?: number;
};

// ↗/↘ + signed number. Polarity is metric-dependent (not a
// hardcoded "up = good"), so callers pass `higherIsBetter` from lib/theme/polarity.ts.
export function DeltaBadge({ delta, higherIsBetter = true, decimals = 1 }: DeltaBadgeProps) {
  const { colors, radius, spacing } = useTheme();
  const isGood = higherIsBetter ? delta >= 0 : delta <= 0;
  const color = delta === 0 ? colors.textSecondary : isGood ? colors.status.success : colors.status.error;
  const arrow = delta > 0 ? "↗" : delta < 0 ? "↘" : "→";
  const formatted = `${delta > 0 ? "+" : ""}${delta.toFixed(decimals)}`;

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: colors.pill, borderRadius: radius.full, paddingHorizontal: spacing.sm },
      ]}
    >
      <Text style={{ color, fontWeight: "600", fontSize: 13 }}>
        {arrow} {formatted}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({ badge: { alignSelf: "flex-start", paddingVertical: 3 } });
