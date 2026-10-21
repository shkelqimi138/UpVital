// Detail screen for the Sleep score breakdown (stages, wakeups)
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { BottomSheetScreen } from "../components/ui/BottomSheetScreen";
import { Icon } from "../components/ui/Icon";
import { LoadError } from "../components/ui/LoadError";
import { SheetSkeleton } from "../components/ui/SheetSkeleton";
import { StatusPill } from "../components/ui/StatusPill";
import { getSleepDetail, SleepStage } from "../lib/api/sleep-detail";
import { useTheme } from "../lib/theme";
import { useAsyncData } from "../lib/hooks/use-async-data";

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function formatTime(iso: string | null): string {
  if (!iso) return "–";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function StageRow({ label, color, stage }: { label: string; color: string; stage: SleepStage }) {
  const { textColor, subtleColor, colors, radius } = useTheme();
  const pct = Math.max(0, Math.min(100, stage.percent));

  return (
    <View style={styles.stageCard}>
      <View style={styles.stageHeader}>
        <View style={styles.stageLabelRow}>
          <View style={[styles.swatch, { backgroundColor: color, borderRadius: 4 }]} />
          <Text style={{ color: textColor }}>{label}</Text>
        </View>
        <Text style={{ color: subtleColor }}>
          {formatDuration(stage.minutes)} • {Math.round(pct)}%
        </Text>
      </View>
      <View style={[styles.track, { backgroundColor: colors.cardInset, borderRadius: radius.full }]}>
        <View
          style={[styles.fill, { width: `${pct}%`, backgroundColor: color, borderRadius: radius.full }]}
        />
      </View>
      <View style={[styles.typicalRow, { backgroundColor: colors.cardInset, borderRadius: radius.md }]}>
        <Text style={{ color: subtleColor, fontSize: 13 }}>Typical range:</Text>
        <Text style={{ color: textColor, fontSize: 13 }}>
          {formatDuration(stage.typicalRange.minMinutes)} – {formatDuration(stage.typicalRange.maxMinutes)}
        </Text>
      </View>
    </View>
  );
}

export default function SleepDetailScreen() {
  const { colors, textColor, subtleColor } = useTheme();
  const today = useMemo(() => toDateString(new Date()), []);
  const { data: sleep, loading, failed, reload } = useAsyncData(() => getSleepDetail(today), [today]);

  // "We couldn't reach the server" and "you have no sleep data" are different facts. The old
  // code showed the second message for both, which reads as a confident claim about your data.
  if (failed) {
    return (
      <BottomSheetScreen
        title="Sleep score"
        leadingIcon={<Icon name="moon" size={20} color={colors.accent.indigo} />}
      >
        <LoadError what="sleep details" onRetry={reload} />
      </BottomSheetScreen>
    );
  }

  if (!loading && !sleep) {
    return (
      <BottomSheetScreen
        title="Sleep score"
        leadingIcon={<Icon name="moon" size={20} color={colors.accent.indigo} />}
      >
        <Text style={{ color: subtleColor }}>No sleep data for today yet.</Text>
      </BottomSheetScreen>
    );
  }

  // First load only — the sheet used to sit blank until the data landed.
  if (loading && !sleep) {
    return (
      <BottomSheetScreen
        title="Sleep score"
        leadingIcon={<Icon name="moon" size={20} color={colors.accent.indigo} />}
      >
        <SheetSkeleton />
      </BottomSheetScreen>
    );
  }

  const stageColors: Record<string, string> = {
    awake: colors.accent.red,
    rem: colors.accent.cyan,
    core: colors.accent.blue,
    deep: colors.accent.indigo,
  };

  const restorativeOptimal = (sleep?.restorative.totalMinutes ?? 0) >= 90;

  return (
    <BottomSheetScreen
      title="Sleep score"
      leadingIcon={<Icon name="moon" size={20} color={colors.accent.indigo} />}
    >
      {sleep && (
        <>
          <View style={styles.timeline}>
            <Text style={{ color: textColor, fontWeight: "600" }}>{formatTime(sleep.sleepStart)}</Text>
            <Text style={{ color: subtleColor, fontSize: 13 }}>
              {formatDuration(sleep.totalAsleepMinutes)} asleep
            </Text>
            <Text style={{ color: textColor, fontWeight: "600" }}>{formatTime(sleep.sleepEnd)}</Text>
          </View>

          <StageRow label="Awake" color={stageColors.awake} stage={sleep.stages.awake} />
          <StageRow label="REM" color={stageColors.rem} stage={sleep.stages.rem} />
          <StageRow label="Core" color={stageColors.core} stage={sleep.stages.core} />
          <StageRow label="Deep" color={stageColors.deep} stage={sleep.stages.deep} />

          <View style={styles.restorativeCard}>
            <View style={styles.restorativeHeader}>
              <Text style={[styles.sectionTitle, { color: textColor }]}>Restorative sleep</Text>
              <View style={styles.restorativeRight}>
                <Text style={{ color: textColor }}>{formatDuration(sleep.restorative.totalMinutes)}</Text>
                <StatusPill
                  label={restorativeOptimal ? "Optimal" : "Below target"}
                  color={restorativeOptimal ? colors.status.success : colors.status.warning}
                />
              </View>
            </View>
            <Text style={{ color: subtleColor, fontSize: 13 }}>
              Deep: {formatDuration(sleep.restorative.deepMinutes)} • REM:{" "}
              {formatDuration(sleep.restorative.remMinutes)}
            </Text>
            <Text style={{ color: subtleColor, fontSize: 13, lineHeight: 19 }}>
              Deep and REM sleep are when the body and brain do most of their overnight repair. Aim for at
              least 90 minutes combined per night.
            </Text>
          </View>
        </>
      )}
    </BottomSheetScreen>
  );
}

const styles = StyleSheet.create({
  timeline: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  stageCard: { gap: 8 },
  stageHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  stageLabelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  swatch: { width: 14, height: 14 },
  track: { height: 12, overflow: "hidden" },
  fill: { height: "100%" },
  typicalRow: { flexDirection: "row", justifyContent: "space-between", padding: 10 },
  restorativeCard: { gap: 8 },
  restorativeHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  restorativeRight: { alignItems: "flex-end", gap: 4 },
  sectionTitle: { fontSize: 17, fontWeight: "700" },
});
