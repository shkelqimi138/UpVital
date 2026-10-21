// Password-reset screen, deep-linked from the reset email
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { authErrorMessage, PASSWORD_RULE_HINT, validatePasswordReset } from "../lib/auth/auth-errors";
import { DismissKeyboard } from "../components/ui/DismissKeyboard";
import { PasswordInput } from "../components/ui/PasswordInput";
import { useAuth } from "../lib/auth/auth-context";
import { supabase } from "../lib/auth/supabase";
import { brand, useTheme } from "../lib/theme";
import { useAnnouncedState, useScreenActiveRef } from "../lib/hooks/announce";

export default function ResetPasswordScreen() {
  const { backgroundColor, textColor, subtleColor, colors } = useTheme();
  // PKCE (see lib/auth/supabase.ts): the link carries a one-time `code`, or Supabase's error when
  // the link expired. Raw tokens in the link are deliberately NOT accepted — a crafted link with
  // someone else's tokens would sign this phone into their account.
  const params = useLocalSearchParams<{ code?: string; error_description?: string }>();
  const router = useRouter();
  const { session, signedIn, markResetSession } = useAuth();

  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const confirmRef = useRef<TextInput>(null);
  const [loading, setLoading] = useState(false);
  const screenActive = useScreenActiveRef();
  const [error, setError] = useAnnouncedState(screenActive);
  // The link didn't give a reset session (expired, used, foreign or missing code).
  const [linkFailed, setLinkFailed] = useState(false);

  useEffect(() => {
    async function establishRecoverySession() {
      if (params.code) {
        // Only works on the phone that requested the reset (it holds the matching secret).
        const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(params.code);
        if (!exchangeError && data.session) {
          // This session may only set the new password: it never opens the app (auth-context.tsx).
          await markResetSession(data.session);
        } else {
          setError(
            "This reset link has expired, was already used, or was opened on a different phone. Request a new one from the app on this phone.",
          );
          setLinkFailed(true);
        }
      } else if (params.error_description) {
        setError("This reset link has expired or has already been used. Request a new one from the app.");
        setLinkFailed(true);
      } else {
        setError("This reset link is missing or invalid. Request a new one from the app.");
        setLinkFailed(true);
      }
      setReady(true);
    }
    establishRecoverySession();
  }, [params.code, params.error_description, markResetSession]);

  // Leaving the reset, finished or not, ends its session and goes to the login screen, which asks
  // for the (new) password. Signing out is best-effort: offline the session stays on the phone,
  // but marked as the reset link's it still can't open the app, and the next launch signs it out.
  async function leaveReset(loginParams?: { email: string; reset: "1" }) {
    await supabase.auth.signOut({ scope: "local" });
    router.replace(loginParams ? { pathname: "/(auth)", params: loginParams } : "/(auth)");
  }

  async function handleCancel() {
    if (loading) return;
    setLoading(true);
    await leaveReset();
  }

  async function handleUpdatePassword() {
    // The keyboard's Go key isn't disabled while saving, unlike the button.
    if (loading) return;
    setError(null);
    const invalid = validatePasswordReset(password, confirmPassword);
    if (invalid) {
      setError(invalid);
      return;
    }
    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setLoading(false);
      setError(authErrorMessage(updateError));
      return;
    }
    await leaveReset({ email: session?.user.email ?? "", reset: "1" });
  }

  if (!ready) {
    return (
      <View style={[styles.container, { backgroundColor }]}>
        <ActivityIndicator />
      </View>
    );
  }

  // Nothing to reset with: say why and offer a way out (a link that launched the app has no screen
  // behind it to go back to). Someone already signed in goes back to the app, anyone else to login.
  if (linkFailed) {
    return (
      <View style={[styles.container, { backgroundColor }]}>
        <Text style={[styles.title, { color: textColor }]}>Reset link not valid</Text>
        {error && <Text style={[styles.error, { color: colors.status.error }]}>{error}</Text>}
        <Link href={signedIn ? "/(tabs)" : "/(auth)"} replace style={[styles.link, { color: colors.link }]}>
          {signedIn ? "Back to the app" : "Back to login"}
        </Link>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <DismissKeyboard>
        <View style={[styles.container, { backgroundColor }]}>
          <Text style={[styles.title, { color: textColor }]}>Set a new password</Text>

          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: textColor }]}>New password</Text>
            <PasswordInput
              accessibilityLabel="New password"
              inputStyle={[styles.input, { color: textColor, borderColor: colors.border }]}
              eyeColor={subtleColor}
              placeholder="Enter a new password"
              placeholderTextColor={subtleColor}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="newPassword"
              autoComplete="password-new"
              returnKeyType="next"
              onSubmitEditing={() => confirmRef.current?.focus()}
              submitBehavior="submit"
              value={password}
              onChangeText={setPassword}
            />
            <Text style={[styles.hint, { color: subtleColor }]}>{PASSWORD_RULE_HINT}</Text>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: textColor }]}>Confirm new password</Text>
            <PasswordInput
              ref={confirmRef}
              accessibilityLabel="Confirm new password"
              inputStyle={[styles.input, { color: textColor, borderColor: colors.border }]}
              eyeColor={subtleColor}
              placeholder="Enter it again"
              placeholderTextColor={subtleColor}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="newPassword"
              autoComplete="password-new"
              returnKeyType="go"
              onSubmitEditing={handleUpdatePassword}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />
          </View>

          {error && <Text style={[styles.error, { color: colors.status.error }]}>{error}</Text>}

          <Pressable style={styles.button} onPress={handleUpdatePassword} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Update password</Text>
            )}
          </Pressable>

          <Pressable onPress={handleCancel} disabled={loading} accessibilityRole="button">
            <Text style={[styles.link, { color: colors.link }]}>Cancel</Text>
          </Pressable>
        </View>
      </DismissKeyboard>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, justifyContent: "center", padding: 24, gap: 12 },
  fieldGroup: { gap: 6 },
  label: { fontWeight: "600", fontSize: 13, marginLeft: 2 },
  title: { fontSize: 24, fontWeight: "600", marginBottom: 12, textAlign: "center" },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  button: {
    backgroundColor: brand.greenDeep,
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    marginTop: 8,
  },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  hint: { fontSize: 12.5 },
  error: { textAlign: "center" },
  link: { textAlign: "center", fontWeight: "600", padding: 12 },
});
