// Pre-permission sheet explaining what UpVital reads from Apple Health before iOS asks
import { openURL } from "expo-linking";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { HistoryChoice } from "../../lib/health/sync";
import { brand, radius, spacing, typography, useTheme } from "../../lib/theme";
import { Icon, IconName } from "./Icon";
import { SegmentedControl } from "./SegmentedControl";

type HealthPermissionModalProps = {
  visible: boolean;
  connecting: boolean;
  error: string | null;
  onCancel: () => void;
  /** The account's current AI insights & Coach setting; the switch starts from it. */
  aiConsentInitial: boolean;
  /** Connect with the chosen amount of history. `aiConsent` is the switch's value if the user
   *  changed it, or null if they left it alone (then nothing about AI is saved). */
  onConnect: (history: HistoryChoice, aiConsent: boolean | null) => void;
};

const HISTORY_OPTIONS: { value: HistoryChoice; label: string }[] = [
  { value: "60d", label: "Last 60 days" },
  { value: "full", label: "Full history" },
];

// What Upvital reads and why — the "pre-permission" explanation shown BEFORE iOS's own
// HealthKit sheet, so the native prompt isn't the first time the user hears what we want or
// why. Presentation only: the caller (Profile → Apple Health) owns the connect call and its
// busy/error state, so the same flow updates the connected UI in place.
const READS: { icon: IconName; title: string; detail: string }[] = [
  { icon: "moon", title: "Sleep, heart rate & HRV", detail: "power your Recovery, Sleep and Stress scores." },
  { icon: "footprints", title: "Steps, workouts & energy", detail: "track your activity and daily strain." },
  { icon: "percent", title: "Weight & body composition", detail: "estimate body fat and biological age." },
];

const REASSURANCE: { icon: IconName; text: string }[] = [
  { icon: "leaf", text: "Read-only — Upvital never writes anything back to Apple Health." },
  { icon: "battery", text: "Private — encrypted, never sold, never used for ads." },
  { icon: "settings", text: "You're in control — disconnect anytime in Profile." },
];

export function HealthPermissionModal({
  visible,
  connecting,
  error,
  onCancel,
  aiConsentInitial,
  onConnect,
}: HealthPermissionModalProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  // Starts at "Last 60 days" every time the sheet opens. The AI switch shows the account's current
  // setting (off unless the user turned it on before; never pre-ticked for them).
  const [history, setHistory] = useState<HistoryChoice>("60d");
  const [aiConsent, setAiConsent] = useState(aiConsentInitial);
  const [aiTouched, setAiTouched] = useState(false);
  useEffect(() => {
    if (visible) {
      setHistory("60d");
      setAiTouched(false);
    }
  }, [visible]);
  // Follows the setting (it may load after the sheet opened) until the user flips the switch.
  useEffect(() => {
    if (!aiTouched) setAiConsent(aiConsentInitial);
  }, [aiConsentInitial, aiTouched, visible]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onCancel}>
      <View
        style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top + spacing.xl }]}
      >
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={[styles.hero, { backgroundColor: brand.green }]}>
            <Icon name="heart" size={26} color="#FFFFFF" />
          </View>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Connect Apple Health</Text>
          <Text style={[typography.bodyLarge, styles.subtitle, { color: colors.textSecondary }]}>
            Upvital turns your health data into a daily score. Here's exactly what it reads and why.
          </Text>

          <View style={styles.group}>
            {READS.map((r) => (
              <View key={r.title} style={styles.row}>
                <View style={[styles.chip, { backgroundColor: colors.cardInset }]}>
                  <Icon name={r.icon} size={18} color={brand.green} />
                </View>
                <Text style={[typography.body, styles.rowText, { color: colors.textPrimary }]}>
                  <Text style={{ fontWeight: "600" }}>{r.title}</Text>{" "}
                  <Text style={{ color: colors.textSecondary }}>{r.detail}</Text>
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.group}>
            {REASSURANCE.map((r) => (
              <View key={r.text} style={styles.row}>
                <View style={[styles.chip, { backgroundColor: colors.cardInset }]}>
                  <Icon name={r.icon} size={16} color={colors.textSecondary} />
                </View>
                <Text style={[typography.body, styles.rowText, { color: colors.textSecondary }]}>
                  {r.text}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.history}>
            <Text style={[typography.body, { color: colors.textPrimary, fontWeight: "600" }]}>
              History to import
            </Text>
            {/* Wrapped: the control left-aligns itself, which would ignore the centred column. */}
            <View style={styles.historyControl}>
              <SegmentedControl options={HISTORY_OPTIONS} value={history} onChange={setHistory} />
            </View>
            <Text style={[typography.micro, styles.historyHint, { color: colors.textTertiary }]}>
              {history === "60d"
                ? "Enough for your scores. You can import the rest later in Profile → Apple Health."
                : "Up to 2 years. The older days keep importing whenever UpVital is open."}
            </Text>
          </View>

          {/* Separate opt-in for the third-party AI (App Store 5.1.2(i), GDPR Art. 9). */}
          <View style={[styles.aiRow, { backgroundColor: colors.cardInset }]}>
            <View style={styles.aiText}>
              <Text style={[typography.body, { color: colors.textPrimary, fontWeight: "600" }]}>
                AI insights & Coach
              </Text>
              <Text style={[styles.aiHint, { color: colors.textTertiary }]}>
                Written by Claude AI (Anthropic, USA) from your scores and recent health data. You can change
                this anytime in Profile.
              </Text>
            </View>
            <Switch
              value={aiConsent}
              onValueChange={(next) => {
                setAiConsent(next);
                setAiTouched(true);
              }}
              trackColor={{ true: brand.green }}
              accessibilityLabel="AI insights and Coach"
              accessibilityHint="Sends your scores and recent health data to Anthropic's Claude AI"
            />
          </View>

          <Text style={[typography.micro, styles.note, { color: colors.textTertiary }]}>
            Next, iOS will ask which data types to allow — you can turn any of them on or off.
          </Text>

          {error && (
            <Text style={[typography.body, styles.error, { color: colors.status.error }]}>{error}</Text>
          )}
        </ScrollView>

        <View
          style={[
            styles.footer,
            { paddingBottom: insets.bottom + spacing.md, borderTopColor: colors.border },
          ]}
        >
          {/* GDPR Art. 9: health data needs the user's explicit consent — this tap is it, so say so. */}
          <Text style={[styles.consent, { color: colors.textSecondary }]}>
            By tapping Connect, you explicitly agree that UpVital processes your health data as described in
            the{" "}
            <Text
              style={{ color: colors.link, fontWeight: "600" }}
              accessibilityRole="link"
              onPress={() => openURL("https://upvital.app/privacy")}
            >
              Privacy Policy
            </Text>
            {aiConsent ? ", including sending it to Anthropic for AI insights and the coach" : ""}. You can
            withdraw this anytime in Profile.
          </Text>
          <Pressable
            style={[styles.cta, { backgroundColor: brand.greenDeep, opacity: connecting ? 0.7 : 1 }]}
            onPress={() => onConnect(history, aiTouched ? aiConsent : null)}
            disabled={connecting}
            accessibilityRole="button"
            accessibilityLabel="Connect Apple Health"
          >
            {connecting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.ctaText}>Connect Apple Health</Text>
            )}
          </Pressable>
          <Pressable
            style={styles.secondary}
            onPress={onCancel}
            disabled={connecting}
            accessibilityRole="button"
            accessibilityLabel="Not now"
          >
            <Text style={[typography.body, { color: colors.textSecondary }]}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl, gap: spacing.md },
  hero: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  title: { fontSize: 24, fontWeight: "700", textAlign: "center", letterSpacing: -0.4 },
  subtitle: { textAlign: "center", marginBottom: spacing.sm },
  group: { gap: spacing.md, marginTop: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  chip: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1, lineHeight: 19 },
  history: { alignItems: "center", gap: spacing.sm, marginTop: spacing.lg },
  historyControl: { alignSelf: "center" },
  historyHint: { textAlign: "center" },
  aiRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radius.card,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  aiText: { flex: 1, gap: 2 },
  aiHint: { fontSize: 12, lineHeight: 16 },
  note: { textAlign: "center", marginTop: spacing.sm },
  error: { textAlign: "center", marginTop: spacing.sm },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  // Sentence case and small — micro's uppercase spacing is for labels, not a sentence.
  consent: { fontSize: 12, lineHeight: 16, textAlign: "center" },
  cta: { borderRadius: radius.button, padding: 15, alignItems: "center" },
  ctaText: { color: "#FFFFFF", fontWeight: "600", fontSize: 16 },
  secondary: { alignItems: "center", padding: spacing.sm },
});
