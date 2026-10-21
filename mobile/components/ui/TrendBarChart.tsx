import { StyleSheet, Text, View } from "react-native";
import { useTheme, type ColorTokens } from "../../lib/theme";

type TrendBarChartProps = {
  data: { label: string; value: number | null; isToday?: boolean }[]; // value expected 0-100
  height?: number;
};

function bandColor(value: number, accent: ColorTokens["accent"]): string {
  if (value >= 70) return accent.green;
  if (value >= 40) return accent.yellow;
  return accent.red;
}

// Color-banded trend bars. Built with plain Views rather than
// Victory Native's <Bar> — that component paints a whole series in one color, and per-bar
// value-band coloring (green/yellow/red) needs per-bar control that's simpler done directly.
export function TrendBarChart({ data, height = 140 }: TrendBarChartProps) {
  const { colors, subtleColor } = useTheme();
  return (
    <View style={[styles.row, { height: height + 40 }]}>
      {data.map((d, i) => {
        const barHeight = d.value === null ? 2 : Math.max(4, (d.value / 100) * height);
        const color = d.value === null ? colors.border : bandColor(d.value, colors.accent);
        return (
          <View key={i} style={styles.col}>
            <Text style={[styles.valueLabel, { color }]}>{d.value !== null ? Math.round(d.value) : ""}</Text>
            <View style={{ height, justifyContent: "flex-end" }}>
              <View style={{ height: barHeight, width: 18, backgroundColor: color, borderRadius: 9 }} />
            </View>
            <Text
              style={[
                styles.dayLabel,
                { color: d.isToday ? colors.accent.green : subtleColor },
                d.isToday && styles.dayLabelToday,
              ]}
            >
              {d.isToday ? "Today" : d.label}
            </Text>
            {/* "You are here" marker under today's bar. */}
            {d.isToday && <View style={[styles.todayMark, { backgroundColor: colors.accent.green }]} />}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  col: { alignItems: "center", flex: 1 },
  valueLabel: { fontSize: 12, fontWeight: "700", marginBottom: 4 },
  dayLabel: { fontSize: 11, marginTop: 6 },
  dayLabelToday: { fontWeight: "700" },
  todayMark: { height: 3, width: 18, borderRadius: 2, marginTop: 3 },
});
