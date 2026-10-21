// Small colored pill label for a status or band
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../lib/theme";

type StatusPillProps = { label: string; color: string };

// rgba(accent, 0.15) — "26" is ~15% alpha as a hex suffix.
export function StatusPill({ label, color }: StatusPillProps) {
  const { radius, spacing } = useTheme();
  return (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: color + "26",
          borderRadius: radius.full,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.xs,
        },
      ]}
    >
      <Text style={[styles.text, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { alignSelf: "flex-start" },
  text: { fontSize: 13, fontWeight: "600" },
});
