// Branded fallback for any unmatched route — e.g. a malformed deep link such as
// `upvital://<garbage>`. Replaces Expo Router's built-in "Unmatched Route" screen
// (and its dev-only "Sitemap" link). The /_sitemap route itself is turned off in
// app.json via the expo-router config plugin option { sitemap: false }.
import { Stack, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../lib/theme";

export default function NotFoundScreen() {
  const { backgroundColor, textColor, subtleColor, brand } = useTheme();
  const router = useRouter();

  // `/` isn't a literal route — it resolves through the auth guard in _layout to either the
  // tabs (signed in) or the auth stack (signed out). A plain <Link href="/"> issued a
  // *navigate*, which the router treats as "already at root" and silently drops when this
  // dead-end is layered over the running app, so the button did nothing. Popping this screen
  // when we can, and otherwise *replacing* it with the guarded root, resets reliably from
  // either entry point — a cold `upvital://<garbage>` deep link, or a bad link tapped in-app.
  const goHome = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <Text style={[styles.title, { color: textColor }]}>This link isn't valid</Text>
      <Text style={[styles.body, { color: subtleColor }]}>
        The page you tried to open doesn't exist. It may have been mistyped or is no longer available.
      </Text>
      <Pressable
        onPress={goHome}
        accessibilityRole="button"
        style={[styles.button, { backgroundColor: brand.greenDeep }]}
      >
        <Text style={styles.buttonText}>Go to UpVital</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, gap: 12 },
  title: { fontSize: 24, fontWeight: "600", textAlign: "center" },
  body: { fontSize: 15, lineHeight: 21, textAlign: "center", maxWidth: 320 },
  button: {
    marginTop: 12,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});
