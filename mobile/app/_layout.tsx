// Root layout: providers, welcome gate, auth-protected routes and app-wide setup
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { DarkTheme, Stack, ThemeProvider } from "expo-router";
import * as Notifications from "expo-notifications";
import { LogBox } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useEffect, useState } from "react";
import { WelcomeScreen } from "../components/auth/WelcomeScreen";
import { AuthProvider, useAuth } from "../lib/auth/auth-context";
import { loadPreferences } from "../lib/preferences";

// victory-native@41 still builds its chart line with the deprecated mutable
// Skia `SkPath.addPath()` (in useLinePath) — a dev-only LogBox warning we can't
// fix from our side. Ignore just this string so it stops spamming the dev overlay;
// remove once victory-native migrates to PathBuilder. (Our own Skia paths already use
// the new API — see RingGauge.tsx.)
LogBox.ignoreLogs([/SkPath\.addPath\(\) is deprecated/]);

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

function RootLayoutNav() {
  const { session, loading, signedIn } = useAuth();
  // Intro/welcome gate: shows on every cold start (full + Continue on first launch,
  // brief auto-splash after), then reveals the normal auth/tabs stack.
  const [welcomeDone, setWelcomeDone] = useState(false);

  // Units are kept per account on this device: load the signed-in user's (defaults when signed
  // out) whenever the session changes. The welcome screen covers the first load.
  const userId = signedIn ? (session?.user.id ?? null) : null;
  useEffect(() => {
    if (!loading) void loadPreferences(userId);
  }, [loading, userId]);

  if (!welcomeDone) {
    return <WelcomeScreen onDone={() => setWelcomeDone(true)} />;
  }

  if (loading) {
    return null;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" />
        {/* Profile sub-pages: inside the guard so signing out (or deleting the account from
            Data & privacy) removes them and lands on the login screen. */}
        <Stack.Screen
          name="profile/password"
          options={{ headerShown: true, title: "Password", headerBackButtonDisplayMode: "minimal" }}
        />
        <Stack.Screen
          name="profile/email"
          options={{ headerShown: true, title: "Email", headerBackButtonDisplayMode: "minimal" }}
        />
        <Stack.Screen
          name="profile/data-privacy"
          options={{ headerShown: true, title: "Data & privacy", headerBackButtonDisplayMode: "minimal" }}
        />
        <Stack.Screen
          name="profile/apple-health"
          options={{ headerShown: true, title: "Apple Health", headerBackButtonDisplayMode: "minimal" }}
        />
        <Stack.Screen
          name="profile/units"
          options={{ headerShown: true, title: "Units", headerBackButtonDisplayMode: "minimal" }}
        />
        <Stack.Screen
          name="profile/insight-time"
          options={{ headerShown: true, title: "Daily insight time", headerBackButtonDisplayMode: "minimal" }}
        />
        <Stack.Screen
          name="profile/personal-info"
          options={{ headerShown: true, title: "Personal info", headerBackButtonDisplayMode: "minimal" }}
        />
        <Stack.Screen
          name="profile/goals"
          options={{ headerShown: true, title: "Goals", headerBackButtonDisplayMode: "minimal" }}
        />
        <Stack.Screen
          name="profile/caffeine-log"
          options={{ headerShown: true, title: "Caffeine log", headerBackButtonDisplayMode: "minimal" }}
        />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Screen name="reset-password" />
      <Stack.Screen name="confirmed" />
      <Stack.Screen
        name="health-trends"
        options={{ headerShown: true, title: "Trends", headerBackButtonDisplayMode: "minimal" }}
      />
      <Stack.Screen
        name="coach-chat"
        options={{ headerShown: true, title: "Coach", headerBackButtonDisplayMode: "minimal" }}
      />
      <Stack.Screen
        name="workouts/[id]"
        options={{ headerShown: true, title: "Workout", headerBackButtonDisplayMode: "minimal" }}
      />
      <Stack.Screen name="recovery-detail" options={{ presentation: "transparentModal" }} />
      <Stack.Screen name="metric-detail" options={{ presentation: "transparentModal" }} />
      <Stack.Screen name="sleep-detail" options={{ presentation: "transparentModal" }} />
      <Stack.Screen name="stress-detail" options={{ presentation: "transparentModal" }} />
      <Stack.Screen name="body-fat-detail" options={{ presentation: "transparentModal" }} />
      <Stack.Screen name="biological-age-detail" options={{ presentation: "transparentModal" }} />
      <Stack.Screen name="caffeine-detail" options={{ presentation: "transparentModal" }} />
      <Stack.Screen name="air-quality-detail" options={{ presentation: "transparentModal" }} />
      <Stack.Screen name="share-insights" options={{ presentation: "transparentModal" }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={DarkTheme}>
        <BottomSheetModalProvider>
          <AuthProvider>
            <RootLayoutNav />
          </AuthProvider>
        </BottomSheetModalProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
