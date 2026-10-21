// Profile → Data & privacy: export my data, delete my health data, delete my account.
import * as AppleAuthentication from "expo-apple-authentication";
import { useState } from "react";
import { Alert, Share } from "react-native";
import {
  Field,
  FormCard,
  FormMessage,
  Hint,
  PrimaryButton,
  ProfilePage,
  TextButton,
} from "../../components/profile/form";
import { useAccount } from "../../components/profile/use-account";
import { deleteAccount, wipeMyData } from "../../lib/api/account";
import { useAnnouncedState, useScreenActiveRef } from "../../lib/hooks/announce";
import { friendlyMessage } from "../../lib/api/client";
import { normalizeEmail } from "../../lib/auth/disposable-emails";
import { forgetPreferences } from "../../lib/preferences";
import { fetchExportJson } from "../../lib/api/export";
import { reimportAfterWipe } from "../../lib/health/sync";
import { supabase } from "../../lib/auth/supabase";

export default function DataPrivacyScreen() {
  const { email, isAppleAccount } = useAccount();
  // Form messages are spoken to VoiceOver while this screen is on display.
  const screenActive = useScreenActiveRef();
  const [exporting, setExporting] = useState(false);
  const [wiping, setWiping] = useState(false);
  const [deleteEmailInput, setDeleteEmailInput] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useAnnouncedState(screenActive);

  async function handleExport() {
    setExporting(true);
    try {
      const json = await fetchExportJson();
      await Share.share({ message: json, title: "Upvital data export" });
    } catch (err) {
      Alert.alert("Export failed", friendlyMessage(err));
    } finally {
      setExporting(false);
    }
  }

  function handleDeleteData() {
    Alert.alert(
      "Delete all your health data?",
      "This removes every health sample, workout, score and insight, but keeps your account and settings. Your next sync re-imports from Apple Health. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete data",
          style: "destructive",
          onPress: async () => {
            setWiping(true);
            try {
              await wipeMyData();
              // So the next sync really re-imports (it otherwise only fetches what's new).
              await reimportAfterWipe();
              Alert.alert("Done", "Your health data has been deleted.");
            } catch (err) {
              Alert.alert("Delete failed", friendlyMessage(err));
            } finally {
              setWiping(false);
            }
          },
        },
      ],
    );
  }

  function handleDeleteAccount() {
    setDeleteError(null);
    // Type-to-confirm: the entered email must match this account (canonical compare).
    if (normalizeEmail(deleteEmailInput) !== normalizeEmail(email ?? "")) {
      setDeleteError("Type the email address on this account to confirm.");
      return;
    }
    Alert.alert(
      "Delete your account?",
      "This permanently deletes your account and all your data. We'll email you a confirmation. " +
        (isAppleAccount
          ? "Apple then asks you to confirm, so UpVital is also removed from your Apple ID. "
          : "") +
        "This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete account",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            // Apple-ID accounts: a fresh Apple code lets the server revoke the Sign in with Apple link
            // (Apple's account-deletion rule).
            let appleCode: string | undefined;
            if (isAppleAccount) {
              try {
                const credential = await AppleAuthentication.signInAsync({ requestedScopes: [] });
                appleCode = credential.authorizationCode ?? undefined;
              } catch (err: any) {
                // Cancel on Apple's sheet backs out of the deletion; nothing is deleted.
                if (err?.code === "ERR_REQUEST_CANCELED") {
                  setDeleting(false);
                  return;
                }
                // Any other Apple error: the account is still deleted, only the Apple link stays
                // (removable in iOS Settings → Apple ID → Sign in with Apple).
              }
            }
            try {
              await deleteAccount(deleteEmailInput.trim(), appleCode);
              await forgetPreferences();
              await supabase.auth.signOut();
            } catch (err) {
              setDeleteError(friendlyMessage(err));
              setDeleting(false);
            }
          },
        },
      ],
    );
  }

  return (
    <ProfilePage>
      <PrimaryButton label="Export my data" onPress={handleExport} busy={exporting} />
      <TextButton label="Delete my data" onPress={handleDeleteData} busy={wiping} destructive />
      <FormCard title="Delete account">
        <Hint>Deleting your account is permanent. Type your email ({email ?? "—"}) to confirm.</Hint>
        <Field
          label="Confirm your email to delete the account"
          placeholder="you@example.com"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          value={deleteEmailInput}
          onChangeText={setDeleteEmailInput}
        />
      </FormCard>
      <TextButton label="Delete my account" onPress={handleDeleteAccount} busy={deleting} destructive />
      <FormMessage error={deleteError} />
    </ProfilePage>
  );
}
