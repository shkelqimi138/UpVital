import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { ScreenBackground } from "../ui/ScreenBackground";

// Intro gate shown on every cold start (see app/_layout.tsx):
//  - first ever launch  -> logo + quote + "Continue" button, then on to login/signup
//  - every launch after -> the same logo + quote as a brief auto-dismissing splash
const SEEN_KEY = "hasSeenWelcome";
const HEADLINE = "Longevity is built daily.";
const SUBLINE = "The long game starts now.";
const SPLASH_MS = 1400;

// Force-dark over the hero image, matching the auth screens.
const TEXT = "#FFFFFF";
const SUBTLE = "rgba(255,255,255,0.72)";
// Button fill behind white text: brand.greenDeep (4.7:1; the brighter green is only 3.3:1).
const GREEN = "#12854A";

export function WelcomeScreen({ onDone }: { onDone: () => void }) {
  // "checking" while we read storage, "first" = show Continue, "returning" = auto-dismiss splash
  const [mode, setMode] = useState<"checking" | "first" | "returning">("checking");

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(SEEN_KEY)
      .then((v) => active && setMode(v === "true" ? "returning" : "first"))
      .catch(() => active && setMode("first"));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (mode !== "returning") return;
    const t = setTimeout(onDone, SPLASH_MS);
    return () => clearTimeout(t);
  }, [mode, onDone]);

  async function handleContinue() {
    try {
      await AsyncStorage.setItem(SEEN_KEY, "true");
    } catch {
      // If persistence fails we still continue — worst case the intro shows again next launch.
    }
    onDone();
  }

  return (
    <ScreenBackground source={require("../../assets/bg-auth.png")} scrim={0.4}>
      <View style={styles.container}>
        <View style={styles.center}>
          <Image
            source={require("../../assets/logo-mark.png")}
            style={styles.logo}
            resizeMode="contain"
            accessible={false}
            importantForAccessibility="no"
          />
          <Text style={styles.headline}>{HEADLINE}</Text>
        </View>

        <View style={styles.bottom}>
          <Text style={styles.subline}>{SUBLINE}</Text>
          {mode === "first" ? (
            <Pressable style={styles.button} onPress={handleContinue}>
              <Text style={styles.buttonText}>Continue</Text>
            </Pressable>
          ) : (
            <ActivityIndicator color={TEXT} style={styles.spinner} />
          )}
        </View>
      </View>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 32, paddingTop: 96, paddingBottom: 56 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 28 },
  logo: { width: 184, height: 172 },
  headline: { color: TEXT, fontSize: 26, fontWeight: "600", textAlign: "center", lineHeight: 34 },
  bottom: { gap: 18 },
  subline: { color: SUBTLE, fontSize: 17, textAlign: "center" },
  button: { backgroundColor: GREEN, borderRadius: 8, padding: 16, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  spinner: { height: 52 },
});
