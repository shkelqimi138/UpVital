import { useSyncExternalStore } from "react";
import { StyleSheet, Text, View } from "react-native";
import { getOfflineState, relativeTime, subscribeOffline } from "../../lib/api/client";
import { useTheme } from "../../lib/theme";
import { Icon } from "./Icon";

// Shown whenever the numbers on screen came out of the offline cache rather than the network.
//
// The app deliberately keeps showing your last synced scores in Airplane Mode / dead signal
// instead of wiping every screen down to one error line. That's only honest if we say the
// data is old, so this banner is not optional decoration: it's the label on stale health
// numbers. It renders nothing at all when the last request actually reached the server.
export function OfflineBanner() {
  const state = useSyncExternalStore(subscribeOffline, getOfflineState, getOfflineState);
  const { colors, radius, spacing } = useTheme();

  if (!state.offline) return null;

  const when = state.lastSyncedAt ? relativeTime(state.lastSyncedAt) : null;

  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: colors.cardInset,
          borderRadius: radius.md,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
          gap: spacing.sm,
        },
      ]}
    >
      <Icon name="wind" size={16} color={colors.status.warning} />
      <Text style={[styles.text, { color: colors.textSecondary }]}>
        {when
          ? `You're offline — showing data last synced ${when}.`
          : "You're offline — showing your last synced data."}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center" },
  text: { flex: 1, fontSize: 13, lineHeight: 18 },
});
