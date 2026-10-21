// List row for one health metric with its value, trend and status
import { Pressable, StyleSheet, Text, View } from "react-native";
import { spacing, tabularNums, typography, useTheme } from "../../lib/theme";
import { Icon, IconName } from "./Icon";
import { Sparkline } from "./Sparkline";

type MetricRowProps = {
  name: string;
  /** Formatted value, or null when the metric isn't available yet. */
  display: string | null;
  unit?: string;
  icon: IconName;
  color: string;
  softColor: string;
  series?: number[];
  /** Hides the bottom hairline on the last row of a grouped card. */
  isLast?: boolean;
  onPress?: () => void;
};

const SPARK_WIDTH = 86;
const SPARK_HEIGHT = 28;

// One row of the Health screen's grouped metric list. Mirrors MetricTile's no-data
// behaviour: the row keeps its shape and shows a dash plus a "Connect" hint rather than
// disappearing, so the list doesn't reflow once a metric starts syncing.
export function MetricRow({
  name,
  display,
  unit,
  icon,
  color,
  softColor,
  series,
  isLast = false,
  onPress,
}: MetricRowProps) {
  const { colors, textColor } = useTheme();
  const hasData = display !== null;

  return (
    <Pressable onPress={onPress} disabled={!onPress}>
      <View
        style={[
          styles.row,
          !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
        ]}
      >
        <View style={[styles.iconChip, { backgroundColor: softColor }]}>
          <Icon name={icon} size={15} color={color} />
        </View>

        <View style={styles.labelGroup}>
          <Text style={[typography.body, { color: colors.textSecondary }]}>{name}</Text>
          <View style={styles.valueRow}>
            <Text
              style={[typography.listStat, tabularNums, { color: hasData ? textColor : colors.textTertiary }]}
            >
              {display ?? "–"}
            </Text>
            {hasData && unit && <Text style={[typography.body, { color: colors.textTertiary }]}>{unit}</Text>}
          </View>
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
          <View style={{ width: SPARK_WIDTH, alignItems: "flex-end" }}>
            {!hasData && (
              <Text style={[typography.body, { color: colors.textTertiary, fontWeight: "600" }]}>
                Connect
              </Text>
            )}
          </View>
        )}

        <Icon name="chevronRight" size={16} color={colors.textTertiary} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg },
  iconChip: { width: 26, height: 26, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  labelGroup: { flex: 1, gap: 1 },
  valueRow: { flexDirection: "row", alignItems: "baseline", gap: 4 },
});
