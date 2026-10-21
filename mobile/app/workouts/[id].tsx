// Workout detail screen for a single workout
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { LoadError } from "../../components/ui/LoadError";
import { friendlyMessage } from "../../lib/api/client";
import { getWorkouts, Workout } from "../../lib/api/workouts";
import { useTheme } from "../../lib/theme";
import { usePreferences } from "../../lib/preferences";
import { toDisplayEnergy, UNIT_LABEL } from "../../lib/units";
import { workoutLabel } from "../../lib/workout-labels";

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "–";
  const minutes = Math.round(seconds / 60);
  return `${minutes} min`;
}

function Row({
  label,
  value,
  textColor,
  subtleColor,
}: {
  label: string;
  value: string;
  textColor: string;
  subtleColor: string;
}) {
  return (
    <View style={styles.row}>
      <Text style={{ color: subtleColor }}>{label}</Text>
      <Text style={{ color: textColor, fontWeight: "600" }}>{value}</Text>
    </View>
  );
}

export default function WorkoutDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { backgroundColor, textColor, subtleColor } = useTheme();
  const { energy: energyUnit } = usePreferences();
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getWorkouts()
      .then((workouts) => setWorkout(workouts.find((w) => w.id === id) ?? null))
      .catch((err) => setError(friendlyMessage(err)))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor }]}>
        <ActivityIndicator />
      </View>
    );
  }

  if (error || !workout) {
    return (
      <View style={[styles.center, { backgroundColor }]}>
        <LoadError what="this workout" message={error ?? "We couldn't find that workout."} />
      </View>
    );
  }

  return (
    <ScrollView style={{ backgroundColor }} contentContainerStyle={styles.container}>
      <Text style={[styles.title, { color: textColor }]}>{workoutLabel(workout.workout_type)}</Text>

      <View style={styles.section}>
        <Row
          label="Start"
          value={new Date(workout.start_date).toLocaleString()}
          textColor={textColor}
          subtleColor={subtleColor}
        />
        <Row
          label="End"
          value={new Date(workout.end_date).toLocaleString()}
          textColor={textColor}
          subtleColor={subtleColor}
        />
        <Row
          label="Duration"
          value={formatDuration(workout.duration_seconds)}
          textColor={textColor}
          subtleColor={subtleColor}
        />
        {workout.calories !== null && (
          <Row
            label="Calories"
            value={`${toDisplayEnergy(workout.calories, energyUnit).toLocaleString()} ${UNIT_LABEL[energyUnit]}`}
            textColor={textColor}
            subtleColor={subtleColor}
          />
        )}
        {workout.avg_heart_rate !== null && (
          <Row
            label="Avg heart rate"
            value={`${Math.round(workout.avg_heart_rate)} bpm`}
            textColor={textColor}
            subtleColor={subtleColor}
          />
        )}
        {workout.max_heart_rate !== null && (
          <Row
            label="Max heart rate"
            value={`${Math.round(workout.max_heart_rate)} bpm`}
            textColor={textColor}
            subtleColor={subtleColor}
          />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  container: { padding: 24, gap: 24 },
  title: { fontSize: 24, fontWeight: "600" },
  section: { gap: 8 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  error: { textAlign: "center" },
});
