// Profile → Apple Health: connect (explanation sheet with the history choice first, then iOS's
// own prompt), sync now, import the full history after a "Last 60 days" connect, disconnect.
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Platform, StyleSheet, Text, View } from "react-native";
import {
  FormCard,
  FormMessage,
  Hint,
  PrimaryButton,
  ProfilePage,
  TextButton,
} from "../../components/profile/form";
import { HealthPermissionModal } from "../../components/ui/HealthPermissionModal";
import { Icon } from "../../components/ui/Icon";
import { useAnnouncedState, useScreenActiveRef } from "../../lib/hooks/announce";
import { friendlyMessage } from "../../lib/api/client";
import { getProfile, updateProfile } from "../../lib/api/profile";
import { registerHealthBackgroundTask } from "../../lib/health/background-task";
import {
  canImportFullHistory,
  connectAppleHealth,
  disconnectAppleHealth,
  getLastSyncedAt,
  type HistoryChoice,
  importFullHistory,
  isConnected,
  isHistoryImporting,
  isSyncInProgress,
  syncNow,
} from "../../lib/health/sync";
import { data as dataColors, spacing, typography, useTheme } from "../../lib/theme";

export default function AppleHealthScreen() {
  const { colors, textColor } = useTheme();
  // Form messages are spoken to VoiceOver while this screen is on display.
  const screenActive = useScreenActiveRef();
  // null until the stored state is read — so a connected user never sees (and taps) "Connect".
  const [healthConnected, setHealthConnected] = useState<boolean | null>(null);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useAnnouncedState(screenActive);
  // Shows the pre-permission explanation before iOS's own HealthKit sheet.
  const [healthIntroVisible, setHealthIntroVisible] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useAnnouncedState(screenActive);
  // "Import full history" — offered once a "Last 60 days" connect has finished importing.
  const [canImportFull, setCanImportFull] = useState(false);
  const [importingFull, setImportingFull] = useState(false);
  const [historyMsg, setHistoryMsg] = useAnnouncedState(screenActive);
  // Older history still importing — shown as a status line (it only moves while the app is open).
  const [historyImporting, setHistoryImporting] = useState(false);
  // The account's AI insights & Coach setting, so the connect sheet's switch starts from it.
  const [aiConsent, setAiConsent] = useState(false);

  async function refreshHistoryState() {
    setHistoryImporting(await isHistoryImporting());
    setCanImportFull(await canImportFullHistory());
  }

  useEffect(() => {
    isConnected().then(setHealthConnected);
    getLastSyncedAt().then(setLastSynced);
    void refreshHistoryState();
    getProfile().then(
      (profile) => setAiConsent(profile.aiConsent === true),
      () => {},
    );
  }, []);

  // Joins the sync in progress (or starts one) and keeps this page in step with it: the button
  // spins while it runs, then "Last synced" and the history status update by themselves.
  const following = useRef(false);
  async function followSync() {
    if (following.current) return;
    following.current = true;
    setSyncError(null);
    setSyncing(true);
    try {
      await syncNow();
      setLastSynced(await getLastSyncedAt());
    } catch (err) {
      // Raw error (not friendlyMessage) so a stuck sync shows its actual cause.
      setSyncError(err instanceof Error ? err.message : String(err));
    } finally {
      following.current = false;
      setSyncing(false);
      void refreshHistoryState();
    }
  }

  // Follow syncs started elsewhere too — on connect, when the app reopens, by the background task.
  useEffect(() => {
    if (!healthConnected) return;
    if (isSyncInProgress()) void followSync();
    const timer = setInterval(() => {
      if (isSyncInProgress()) void followSync();
    }, 3000);
    return () => clearInterval(timer);
  }, [healthConnected]);

  // While older history imports, check every few seconds so the status line clears (and
  // "Import full history" appears) as soon as it's done.
  useEffect(() => {
    if (!historyImporting) return;
    const timer = setInterval(() => {
      isHistoryImporting().then((still) => {
        if (!still) void refreshHistoryState();
      });
    }, 5000);
    return () => clearInterval(timer);
  }, [historyImporting]);

  async function handleConnect(history: HistoryChoice, aiChoice: boolean | null) {
    setConnectError(null);
    setConnecting(true);
    try {
      // Returns once iOS access is granted; the import itself runs on (followed below).
      await connectAppleHealth(history);
      // Only if the switch was changed on the sheet. Best-effort: if this save fails, the setting
      // stays as it was and can be changed in Profile.
      if (aiChoice !== null) {
        setAiConsent(aiChoice);
        void updateProfile({ aiConsent: aiChoice }).catch(() => {});
      }
      await registerHealthBackgroundTask();
      setHealthConnected(true);
      setHealthIntroVisible(false);
      void refreshHistoryState();
      void followSync();
    } catch (err) {
      setConnectError(friendlyMessage(err));
    } finally {
      setConnecting(false);
    }
  }

  // Asks first, like the Delete buttons — a stray tap shouldn't stop syncing.
  function confirmDisconnect() {
    Alert.alert(
      "Disconnect Apple Health?",
      "UpVital stops syncing from Apple Health until you connect again. Data already synced stays in your account.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Disconnect", style: "destructive", onPress: () => void handleDisconnect() },
      ],
    );
  }

  async function handleImportFull() {
    setSyncError(null);
    setHistoryMsg(null);
    setImportingFull(true);
    try {
      await importFullHistory();
      setCanImportFull(false);
      setHistoryImporting(true);
      setHistoryMsg("Full history import started.");
    } catch (err) {
      setSyncError(friendlyMessage(err));
    } finally {
      setImportingFull(false);
    }
  }

  async function handleDisconnect() {
    setSyncError(null);
    setConnectError(null);
    try {
      await disconnectAppleHealth();
    } catch (err) {
      setSyncError(friendlyMessage(err));
      return;
    }
    setHealthConnected(false);
    setLastSynced(null);
    setCanImportFull(false);
    setHistoryImporting(false);
    setHistoryMsg(null);
  }

  if (Platform.OS !== "ios") {
    return (
      <ProfilePage>
        <Hint>Apple Health requires iOS.</Hint>
      </ProfilePage>
    );
  }

  return (
    <ProfilePage>
      {healthConnected === null ? (
        <ActivityIndicator accessibilityLabel="Loading" />
      ) : healthConnected ? (
        <>
          <FormCard>
            <View style={styles.row}>
              <View style={[styles.rowIcon, { backgroundColor: dataColors.soft.heart }]}>
                <Icon name="heart" size={15} color={dataColors.heart} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[typography.bodyLarge, { color: textColor, fontWeight: "600" }]}>Connected</Text>
                <Text style={[typography.body, { color: colors.textSecondary }]}>
                  Last synced: {lastSynced ? lastSynced.toLocaleString() : "never"}
                </Text>
              </View>
            </View>
          </FormCard>
          {syncing && !lastSynced ? (
            <Hint>Importing your recent data… It continues by itself whenever UpVital is open.</Hint>
          ) : historyImporting ? (
            <Hint>Importing older history… It continues by itself whenever UpVital is open.</Hint>
          ) : null}
          <PrimaryButton label="Sync now" onPress={() => void followSync()} busy={syncing} />
          {canImportFull && (
            <TextButton label="Import full history" onPress={handleImportFull} busy={importingFull} />
          )}
          <TextButton label="Disconnect Apple Health" onPress={confirmDisconnect} destructive />
          <FormMessage success={historyMsg} error={syncError} />
        </>
      ) : (
        <>
          <Hint>Connect Apple Health so UpVital can calculate your daily scores.</Hint>
          <PrimaryButton
            label="Connect Apple Health"
            onPress={() => {
              setConnectError(null);
              setHealthIntroVisible(true);
            }}
          />
          <HealthPermissionModal
            visible={healthIntroVisible}
            connecting={connecting}
            error={connectError}
            aiConsentInitial={aiConsent}
            onConnect={handleConnect}
            onCancel={() => {
              setConnectError(null);
              setHealthIntroVisible(false);
            }}
          />
        </>
      )}
    </ProfilePage>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  rowIcon: { width: 26, height: 26, borderRadius: 9, alignItems: "center", justifyContent: "center" },
});
