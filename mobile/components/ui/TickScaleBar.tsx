import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../lib/theme";

type TickScaleBarProps = {
  value: number;
  min: number;
  max: number;
  labels: { value: number; label: string }[];
  tickCount?: number;
};

// A ruler of thin ticks with one brighter tick marking the current value's position (the
// "pace of aging" scale).
export function TickScaleBar({ value, min, max, labels, tickCount = 41 }: TickScaleBarProps) {
  const { colors } = useTheme();
  const clamped = Math.max(min, Math.min(max, value));
  const activeIndex = Math.round(((clamped - min) / (max - min)) * (tickCount - 1));

  return (
    <View>
      <View style={styles.row}>
        {Array.from({ length: tickCount }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.tick,
              { backgroundColor: i === activeIndex ? colors.textPrimary : colors.border },
              i === activeIndex && styles.activeTick,
            ]}
          />
        ))}
      </View>
      <View style={styles.labelRow}>
        {labels.map((l) => (
          <Text key={l.label} style={{ color: colors.textSecondary, fontSize: 12 }}>
            {l.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", height: 20 },
  tick: { width: 2, height: 12, borderRadius: 1 },
  activeTick: { height: 20, width: 3 },
  labelRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
});
