// Landing screen for the email-confirmation Universal Link (https://upvital.app/confirmed).
// The account is already confirmed server-side by the time Supabase redirects here, so this
// screen isn't doing verification — it gives a clear "you're confirmed, now log in" moment
// instead of dropping the user on an arbitrary screen. Doubles as the in-app confirmation UI
// (Stage-6 item c-3). "/" routes home via the root layout's auth guards: the login screen when
// signed out (the normal case straight after confirming), the tabs if a session already exists.
import { Link } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { ScreenBackground } from "../components/ui/ScreenBackground";

// White-on-image over the hero image, matching the auth screens (not the theme tokens), so text
// stays legible on the photo.
const TEXT = "#FFFFFF";
const SUBTLE = "rgba(255,255,255,0.72)";
// Button fill behind white text: brand.greenDeep (4.7:1; the brighter green is only 3.3:1).
const GREEN = "#12854A";

export default function ConfirmedScreen() {
  return (
    <ScreenBackground source={require("../assets/bg-auth.png")} scrim={0.45}>
      <View style={styles.container}>
        <View style={styles.check}>
          <Text style={styles.checkMark}>✓</Text>
        </View>
        <Text style={styles.title}>Email confirmed</Text>
        <Text style={styles.subtitle}>Your email is verified. Log in to get started.</Text>
        <Link href="/" style={styles.button}>
          Log in
        </Link>
      </View>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, gap: 12 },
  check: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  checkMark: { color: "#FFFFFF", fontSize: 34, fontWeight: "700", lineHeight: 38 },
  title: { fontSize: 28, fontWeight: "600", textAlign: "center", color: TEXT },
  subtitle: { textAlign: "center", color: SUBTLE, fontSize: 16, maxWidth: 300 },
  button: {
    marginTop: 12,
    backgroundColor: GREEN,
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 16,
    overflow: "hidden",
    borderRadius: 8,
    paddingVertical: 13,
    paddingHorizontal: 32,
  },
});
