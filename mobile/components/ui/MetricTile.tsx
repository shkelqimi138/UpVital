// Dashboard grid tile for one metric with value and mini chart
import { Pressable, StyleSheet, Text, View } from "react-native";
import { radius, spacing, tabularNums, typography, useTheme } from "../../lib/theme";
import { Icon, IconName } from "./Icon";
import { Sparkline } from "./Sparkline";

export type MetricTileProps = {
  name: string;
  /** Formatted value, or null when the metric isn't available yet. */
  display: string | null;
  unit?: string;
  icon: IconName;
  color: string;
  /** 14-16% alpha tint behind the icon chip. */
  softColor: string;
  series?: number[];
  onPress?: () => void;
};

const SPARK_WIDTH = 74;
const SPARK_HEIGHT = 26;

// One tile in the Dashboard's Health Overview grid. When `display` is null the tile keeps
// its full layout and shows a dash plus a "Connect" hint, matching the handoff's guidance
// for the permission-denied / no-data case — so the grid never reflows once data arrives.
export function MetricTile({
  name,
  display,
  unit,
  icon,
  color,
  softColor,
  series,
  onPress,
}: MetricTileProps) {
  const { colors, textColor, shadows } = useTheme();
  const hasData = display !== null;

  return (
    <Pressable style={styles.wrap} onPress={onPress} disabled={!onPress}>
      <View style={[styles.tile, { backgroundColor: colors.card }, shadows.card]}>
        <View style={styles.headerRow}>
          <View style={[styles.iconChip, { backgroundColor: softColor }]}>
            <Icon name={icon} size={16} color={color} />
          </View>
        </View>

        <Text style={[styles.name, { color: colors.textSecondary }]} numberOfLines={1}>
          {name}
        </Text>

        <View style={styles.valueRow}>
          <Text style={[styles.value, tabularNums, { color: hasData ? textColor : colors.textTertiary }]}>
            {display ?? "–"}
          </Text>
          {hasData && unit && <Text style={[styles.unit, { color: colors.textTertiary }]}>{unit}</Text>}
        </View>

        {hasData && series && series.length > 1 ? (
          <Sparkline
            points={series}
            width={SPARK_WIDTH}
            height={SPARK_HEIGHT}
            color={color}
            strokeWidth={2}
          />
        ) : (
          <View style={{ height: SPARK_HEIGHT, justifyContent: "center" }}>
            {!hasData && <Text style={[styles.connect, { color: colors.textTertiary }]}>Connect</Text>}
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  tile: { borderRadius: radius.tile, padding: spacing.lg, gap: spacing.s6 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  iconChip: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  name: { ...typography.body },
  valueRow: { flexDirection: "row", alignItems: "baseline", gap: 4 },
  value: { ...typography.cardStat },
  unit: { ...typography.body },
  connect: { ...typography.body, fontWeight: "600" },
});
