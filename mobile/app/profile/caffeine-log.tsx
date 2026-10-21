// Profile → Caffeine log: log a drink in mg, see the last five entries, open the caffeine window.
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { FormCard, FormMessage, PrimaryButton, ProfilePage } from "../../components/profile/form";
import { useAnnouncedState, useScreenActiveRef } from "../../lib/hooks/announce";
import { friendlyMessage } from "../../lib/api/client";
import { type CaffeineEntry, getCaffeineEntries, logCaffeine } from "../../lib/api/caffeine";
import { radius, spacing, typography, useTheme } from "../../lib/theme";

export default function CaffeineLogScreen() {
  const { colors, textColor } = useTheme();
  const router = useRouter();
  // Form messages are spoken to VoiceOver while this screen is on display.
  const screenActive = useScreenActiveRef();
  const [caffeineEntries, setCaffeineEntries] = useState<CaffeineEntry[]>([]);
  const [caffeineInput, setCaffeineInput] = useState("");
  const [loggingCaffeine, setLoggingCaffeine] = useState(false);
  const [caffeineError, setCaffeineError] = useAnnouncedState(screenActive);

  useEffect(() => {
    getCaffeineEntries()
      .then(setCaffeineEntries)
      .catch(() => {});
  }, []);

  async function handleLogCaffeine() {
    setCaffeineError(null);
    const value = parseFloat(caffeineInput);
    if (!value || value <= 0) {
      setCaffeineError("Enter a valid amount in mg");
      return;
    }
    setLoggingCaffeine(true);
    try {
      await logCaffeine(value);
      setCaffeineInput("");
      setCaffeineEntries(await getCaffeineEntries());
    } catch (err) {
      setCaffeineError(friendlyMessage(err));
    } finally {
      setLoggingCaffeine(false);
    }
  }

  return (
    <ProfilePage>
      <FormCard>
        <View style={styles.inlineRow}>
          <TextInput
            style={[
              styles.input,
              { color: textColor, backgroundColor: colors.cardInset, borderRadius: radius.field },
            ]}
            placeholder="mg (e.g. 95 for a coffee)"
            placeholderTextColor={colors.textTertiary}
            accessibilityLabel="Caffeine in milligrams"
            keyboardType="number-pad"
            value={caffeineInput}
            onChangeText={setCaffeineInput}
          />
          <PrimaryButton label="Log" onPress={handleLogCaffeine} busy={loggingCaffeine} />
        </View>
      </FormCard>
      <FormMessage error={caffeineError} />
      {caffeineEntries.length > 0 && (
        <FormCard title="Recent">
          {caffeineEntries.slice(0, 5).map((entry, i) => (
            <Text key={i} style={[typography.body, { color: colors.textSecondary }]}>
              {new Date(entry.date).toLocaleString()} — {entry.value} {entry.unit}
            </Text>
          ))}
        </FormCard>
      )}
      <Pressable onPress={() => router.push("/caffeine-detail")} accessibilityRole="link">
        <Text style={[typography.body, { color: colors.link, fontWeight: "600" }]}>
          View caffeine window ›
        </Text>
      </Pressable>
    </ProfilePage>
  );
}

const styles = StyleSheet.create({
  inlineRow: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  input: { flex: 1, padding: spacing.md, fontSize: 15 },
});
