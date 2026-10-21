// Loading placeholder shaped like a detail sheet
import { StyleSheet, View } from "react-native";
import { Skeleton } from "./Skeleton";

type SheetSkeletonProps = {
  /** "ring" mirrors a centred score gauge (Recovery); "value" a big-number headline (the rest). */
  hero?: "ring" | "value";
};

// First-load placeholder for the detail sheets — the same shimmer blocks as the dashboard,
// shaped like a sheet (headline, then content sections). Without it a sheet opened blank or
// briefly showed placeholder readings ("–", "0 mg · Sleep safe") before the real data landed.
// Only for the first load: once data exists, a refetch keeps showing it.
export function SheetSkeleton({ hero = "value" }: SheetSkeletonProps) {
  return (
    <View style={styles.wrap} accessible accessibilityLabel="Loading">
      {hero === "ring" ? (
        <View style={styles.ring}>
          <Skeleton width={220} height={220} radius={110} />
        </View>
      ) : (
        <View style={styles.valueRow}>
          <Skeleton width={120} height={48} radius={12} />
          <Skeleton width={64} height={24} radius={12} />
        </View>
      )}
      <Skeleton width="60%" height={14} />
      <Skeleton height={160} radius={16} />
      <Skeleton height={56} radius={16} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 16 },
  ring: { alignItems: "center", paddingVertical: 8 },
  valueRow: { flexDirection: "row", alignItems: "flex-end", gap: 12 },
});
