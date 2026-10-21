import { useIsFocused } from "expo-router";
import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { announce } from "../../lib/hooks/announce";
import { useTheme } from "../../lib/theme";
import { Icon } from "./Icon";

// Shown when a screen's data failed to load. The point is to be unmistakably NOT data:
// before this existed, a failed fetch left state at its initial value and the screen rendered
// its fallback constants (a neutral half-full gauge, zeroed stats) as though they were real
// measurements. For health numbers that is worse than showing nothing.
type LoadErrorProps = {
  /** What failed, lowercase, e.g. "recovery details". */
  what?: string;
  /** Overrides the default body copy. Pass `friendlyMessage(err)` — never a raw error. */
  message?: string;
  onRetry?: () => void;
};

export function LoadError({ what = "this data", message, onRetry }: LoadErrorProps) {
  const { colors, textColor, subtleColor, radius, spacing } = useTheme();

  // Tell a screen-reader user the load failed — otherwise the change is silent. Only while this
  // screen is on display, so a background refetch on another tab doesn't talk over this one.
  const isFocused = useIsFocused();
  useEffect(() => {
    announce(`Couldn't load ${what}`, isFocused);
  }, [what, isFocused]);

  return (
    <View
      style={[
        styles.wrap,
        { backgroundColor: colors.cardInset, borderRadius: radius.md, padding: spacing.md },
      ]}
    >
      <Icon name="info" size={20} color={colors.status.warning} />
      <Text style={[styles.title, { color: textColor }]}>Couldn't load {what}</Text>
      <Text style={[styles.body, { color: subtleColor }]}>
        {message ?? "Check your connection and try again — we'd rather show nothing than the wrong numbers."}
      </Text>
      {onRetry && (
        <Pressable
          onPress={onRetry}
          style={[styles.button, { backgroundColor: colors.pill, borderRadius: radius.full }]}
          accessibilityRole="button"
          accessibilityLabel="Try again"
        >
          <Text style={[styles.buttonText, { color: textColor }]}>Try again</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", gap: 6 },
  title: { fontSize: 15, fontWeight: "600" },
  body: { fontSize: 13, textAlign: "center", lineHeight: 18 },
  button: { marginTop: 6, paddingVertical: 8, paddingHorizontal: 18 },
  buttonText: { fontSize: 14, fontWeight: "600" },
});
