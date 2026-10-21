import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

// Inline message for the auth screens (login / signup / forgot / reset).
//
// These screens sit on the force-dark hero image and don't use the app's theme tokens, so
// this component carries its own palette. It replaces a bare centred red <Text>, which read
// as an unstyled runtime error rather than as part of the form.
// It isn't spoken by itself: the screen holds the message in `useAnnouncedState`, which reads it
// to VoiceOver (a live region would only work on Android, and would double up with that).
type Tone = "error" | "success" | "info";

const TONES: Record<
  Tone,
  { text: string; bg: string; border: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  error: {
    text: "#FFC9C9",
    bg: "rgba(220,38,38,0.18)",
    border: "rgba(255,107,107,0.45)",
    icon: "alert-circle-outline",
  },
  success: {
    text: "#B9F2D0",
    bg: "rgba(22,163,74,0.20)",
    border: "rgba(95,227,156,0.45)",
    icon: "checkmark-circle-outline",
  },
  info: {
    text: "rgba(255,255,255,0.88)",
    bg: "rgba(255,255,255,0.10)",
    border: "rgba(255,255,255,0.22)",
    icon: "information-circle-outline",
  },
};

export function AuthNotice({ tone = "error", children }: { tone?: Tone; children: React.ReactNode }) {
  const t = TONES[tone];
  return (
    <View accessible style={[styles.wrap, { backgroundColor: t.bg, borderColor: t.border }]}>
      <Ionicons name={t.icon} size={18} color={t.text} style={styles.icon} importantForAccessibility="no" />
      <Text style={[styles.text, { color: t.text }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  // Nudged down so the glyph sits on the first line's optical centre.
  icon: { marginTop: 1 },
  text: { flex: 1, fontSize: 14, lineHeight: 19 },
});
