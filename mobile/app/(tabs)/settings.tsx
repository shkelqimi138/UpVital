// Profile tab: an iOS-style grouped list — identity, the Premium card, then Your account / App
// settings / Preferences rows that open their own pages (app/profile/*), plus Log out.
import { Canvas, LinearGradient, Rect, vec } from "@shopify/react-native-skia";
import { openURL } from "expo-linking";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAccount } from "../../components/profile/use-account";
import { Icon } from "../../components/ui/Icon";
import { SettingsGroup, SettingsRow } from "../../components/ui/SettingsGroup";
import { clearApiCache } from "../../lib/api/client";
import { isConnected } from "../../lib/health/sync";
import { usePreferences } from "../../lib/preferences";
import { unitSystemLabel } from "../../lib/preferences-core";
import { avatarInitials, getProfile, updateProfile } from "../../lib/api/profile";
import { formatHour } from "../../lib/format-time";
import { confirmAiConsent } from "../../lib/ai-consent";
import { unregisterPushToken } from "../../lib/push";
import { supabase } from "../../lib/auth/supabase";
import { brand, data as dataColors, layout, radius, spacing, typography, useTheme } from "../../lib/theme";

// Solid icon tiles with a white glyph, like the iOS Settings app.
const GRAY = "#8E8E93";

// The Premium card comes back once subscriptions exist — App Review rejects placeholder
// purchase UI that doesn't do anything (guideline 2.1).
const SHOW_PREMIUM_CARD = false;

export default function ProfileScreen() {
  const { colors, textColor, shadows } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { email, isPasswordAccount } = useAccount();
  const prefs = usePreferences();

  const [displayName, setDisplayName] = useState("");
  const [healthConnected, setHealthConnected] = useState<boolean | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [aiConsent, setAiConsent] = useState(false);
  const [insightHour, setInsightHour] = useState<number | null>(null);
  const [premiumWidth, setPremiumWidth] = useState(0);

  // Refresh on every visit, so a name or connection changed on a sub-page shows on return.
  useFocusEffect(
    useCallback(() => {
      isConnected().then(setHealthConnected);
      getProfile()
        .then((profile) => {
          setDisplayName(profile.displayName ?? "");
          setNotificationsEnabled(profile.notificationsEnabled);
          setAiConsent(profile.aiConsent);
          setInsightHour(profile.insightHour);
        })
        .catch(() => {});
    }, []),
  );

  async function handleToggleNotifications(next: boolean) {
    setNotificationsEnabled(next); // optimistic
    try {
      await updateProfile({ notificationsEnabled: next });
    } catch {
      setNotificationsEnabled(!next); // revert on failure
    }
  }

  async function handleToggleAi(next: boolean) {
    if (next) {
      // Turning on always goes through the same notice (lib/ai-consent.ts).
      if (await confirmAiConsent()) setAiConsent(true);
      return;
    }
    // Withdrawing is one tap, as easy as giving it.
    setAiConsent(false); // optimistic
    try {
      await updateProfile({ aiConsent: false });
    } catch {
      setAiConsent(true); // revert on failure
    }
  }

  async function handleSignOut() {
    // Stop pushes to this phone first (needs the session). Capped so logging out never hangs; if
    // it doesn't finish, the server still stops once the session is gone (backend/src/push.ts).
    await Promise.race([
      unregisterPushToken().catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
    await clearApiCache();
    await supabase.auth.signOut();
  }

  const initials = avatarInitials(displayName || null, email);

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.sm }]}
    >
      {/* Identity header */}
      <View style={styles.identityRow}>
        <View style={[styles.avatar, { backgroundColor: colors.pill }]}>
          <Text style={[typography.listStat, { color: textColor }]}>{initials}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[typography.screenTitle, { color: textColor }]} numberOfLines={1}>
            {displayName || "Your profile"}
          </Text>
          {email && (
            <Text style={[typography.body, { color: colors.textSecondary }]} numberOfLines={1}>
              {email}
            </Text>
          )}
        </View>
      </View>

      {/* Premium plan — presentation only (no billing behind it yet); hidden for now, see above. */}
      {SHOW_PREMIUM_CARD && (
        <Pressable
          onPress={() =>
            Alert.alert("Premium", "Subscriptions aren't available yet — this is a placeholder.")
          }
        >
          <View
            style={[styles.premium, shadows.greenHero]}
            onLayout={(e) => setPremiumWidth(e.nativeEvent.layout.width)}
          >
            {premiumWidth > 0 && (
              <Canvas style={StyleSheet.absoluteFill}>
                <Rect x={0} y={0} width={premiumWidth} height={200}>
                  <LinearGradient
                    start={vec(0, 0)}
                    end={vec(premiumWidth * 0.6, 200)}
                    colors={[...brand.heroGradient]}
                  />
                </Rect>
              </Canvas>
            )}
            <View style={{ flex: 1 }}>
              <Text style={[typography.bodyLarge, styles.premiumTitle]}>Premium plan</Text>
              <Text style={[typography.body, styles.premiumSubtitle]}>Not active — coming soon</Text>
            </View>
            <Icon name="chevronRight" size={18} color="#FFFFFF" />
          </View>
        </Pressable>
      )}

      <SettingsGroup title="Your account">
        {isPasswordAccount && (
          <SettingsRow
            title="Password"
            icon="lock"
            iconColor="#FFFFFF"
            iconBackground={GRAY}
            onPress={() => router.push("/profile/password")}
          />
        )}
        {isPasswordAccount && (
          <SettingsRow
            title="Email"
            icon="mail"
            iconColor="#FFFFFF"
            iconBackground={GRAY}
            onPress={() => router.push("/profile/email")}
          />
        )}
        <SettingsRow
          title="Data & privacy"
          icon="shield"
          iconColor="#FFFFFF"
          iconBackground={GRAY}
          onPress={() => router.push("/profile/data-privacy")}
        />
      </SettingsGroup>

      <SettingsGroup title="App settings">
        <SettingsRow
          title="Apple Health"
          subtitle={healthConnected === null ? undefined : healthConnected ? "Connected" : "Not connected"}
          icon="heart"
          iconColor="#FFFFFF"
          iconBackground={dataColors.heart}
          onPress={() => router.push("/profile/apple-health")}
        />
        <SettingsRow
          title="Daily insight notifications"
          icon="bell"
          iconColor="#FFFFFF"
          iconBackground={dataColors.calories}
          trailing={
            <Switch
              value={notificationsEnabled}
              onValueChange={handleToggleNotifications}
              trackColor={{ true: brand.green }}
              accessibilityLabel="Daily insight notifications"
            />
          }
        />
        <SettingsRow
          title="Daily insight time"
          // No insight is written while AI insights & Coach is off.
          subtitle={aiConsent ? undefined : "AI insights & Coach is off"}
          value={insightHour === null ? undefined : formatHour(insightHour)}
          icon="time"
          iconColor="#FFFFFF"
          iconBackground={dataColors.calories}
          onPress={() => router.push("/profile/insight-time")}
        />
        <SettingsRow
          title="AI insights & Coach"
          subtitle="Claude AI by Anthropic"
          icon="sparkle"
          iconColor="#FFFFFF"
          iconBackground={dataColors.sleep}
          trailing={
            <Switch
              value={aiConsent}
              onValueChange={handleToggleAi}
              trackColor={{ true: brand.green }}
              accessibilityLabel="AI insights and Coach"
              accessibilityHint="Sends your scores and recent health data to Anthropic's Claude AI"
            />
          }
        />
        <SettingsRow
          title="Units"
          value={unitSystemLabel(prefs)}
          icon="units"
          iconColor="#FFFFFF"
          iconBackground={dataColors.steps}
          onPress={() => router.push("/profile/units")}
        />
      </SettingsGroup>

      <SettingsGroup title="Preferences">
        <SettingsRow
          title="Personal info"
          icon="person"
          iconColor="#FFFFFF"
          iconBackground={dataColors.sleep}
          onPress={() => router.push("/profile/personal-info")}
        />
        <SettingsRow
          title="Goals"
          icon="flag"
          iconColor="#FFFFFF"
          iconBackground={brand.green}
          onPress={() => router.push("/profile/goals")}
        />
        <SettingsRow
          title="Caffeine log"
          icon="coffee"
          iconColor="#FFFFFF"
          iconBackground={dataColors.bodyTemp}
          onPress={() => router.push("/profile/caffeine-log")}
        />
      </SettingsGroup>

      <Pressable style={[styles.logout, { borderColor: colors.border }]} onPress={() => void handleSignOut()}>
        <Text style={[typography.bodyLarge, { color: colors.status.error, fontWeight: "600" }]}>Log out</Text>
      </Pressable>

      {/* The policy and terms live on the website — the only copy (also linked from sign-up). */}
      <View style={styles.legalLinks}>
        {/* hitSlop lifts the small text links to a ~44 pt touch target. */}
        <Pressable
          accessibilityRole="link"
          hitSlop={12}
          onPress={() => openURL("https://upvital.app/privacy")}
        >
          <Text style={[typography.body, { color: colors.textSecondary }]}>Privacy Policy</Text>
        </Pressable>
        <Text
          style={[typography.body, { color: colors.textTertiary }]}
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          ·
        </Text>
        <Pressable accessibilityRole="link" hitSlop={12} onPress={() => openURL("https://upvital.app/terms")}>
          <Text style={[typography.body, { color: colors.textSecondary }]}>Terms of Service</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: layout.screenPadding, paddingBottom: 40, gap: layout.cardGap },
  identityRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: { width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center" },
  premium: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radius.card,
    padding: spacing.xl,
    overflow: "hidden",
  },
  premiumTitle: { color: "#FFFFFF", fontWeight: "700" },
  premiumSubtitle: { color: "rgba(255,255,255,0.85)" },
  legalLinks: { flexDirection: "row", justifyContent: "center", gap: spacing.sm },
  logout: {
    borderRadius: radius.button,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.sm,
  },
});
