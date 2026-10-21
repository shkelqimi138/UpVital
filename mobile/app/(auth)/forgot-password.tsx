// Forgot-password screen that emails a reset link
import { Link, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
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
import { Captcha, CaptchaHandle } from "../../components/auth/Captcha";
import { AuthNotice } from "../../components/ui/AuthNotice";
import { DismissKeyboard } from "../../components/ui/DismissKeyboard";
import { FieldError } from "../../components/ui/FieldError";
import { ScreenBackground } from "../../components/ui/ScreenBackground";
import { authErrorMessage, validateEmail } from "../../lib/auth/auth-errors";
import { normalizeEmail } from "../../lib/auth/disposable-emails";
import { getCaptchaToken } from "../../lib/auth/captcha";
import { supabase } from "../../lib/auth/supabase";
import { useAnnouncedState, useScreenActiveRef } from "../../lib/hooks/announce";

// Auth screens use their own fixed white-on-image palette over the hero image (not the theme
// tokens), so text stays legible on the photo.
const TEXT = "#FFFFFF";
const SUBTLE = "rgba(255,255,255,0.72)";
const PLACEHOLDER = "rgba(255,255,255,0.55)";
const GLASS_BG = "rgba(255,255,255,0.10)";
const GLASS_BORDER = "rgba(255,255,255,0.22)";
// Button fill behind white text: brand.greenDeep (4.7:1; the brighter green is only 3.3:1).
const GREEN = "#12854A";
const LINK = "#5FE39C";
const RED = "#FF6B6B";

export default function ForgotPasswordScreen() {
  // Prefill with the email carried from the login screen.
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? "");
  const screenActive = useScreenActiveRef();
  const [emailError, setEmailError] = useAnnouncedState(screenActive);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useAnnouncedState(screenActive);
  const [sent, setSent] = useState(false);
  const captchaRef = useRef<CaptchaHandle>(null);

  async function handleReset() {
    setError(null);
    const invalid = validateEmail(email);
    if (invalid) {
      setError(invalid);
      return;
    }
    setLoading(true);
    let captchaToken: string | undefined;
    try {
      captchaToken = await getCaptchaToken(captchaRef);
    } catch (err) {
      setLoading(false);
      setError(authErrorMessage(err));
      return;
    }
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizeEmail(email), {
      redirectTo: "upvital://reset-password",
      captchaToken,
    });
    setLoading(false);
    if (resetError) {
      setError(authErrorMessage(resetError));
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <ScreenBackground source={require("../../assets/bg-auth.png")} scrim={0.4}>
        <View style={styles.container}>
          <Text style={styles.title}>Check your email</Text>
          <Text style={styles.subtitle}>
            If there's an UpVital account for {normalizeEmail(email)}, we've sent it a password reset link. It
            can take a minute to arrive. If you don't see it, please check your junk folder.
          </Text>
          <Link href={{ pathname: "/(auth)", params: { email } }} style={styles.link}>
            Back to login
          </Link>
        </View>
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground source={require("../../assets/bg-auth.png")} scrim={0.4}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <DismissKeyboard>
          <View style={styles.container}>
            <Text style={styles.title}>Reset password</Text>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor={PLACEHOLDER}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                autoComplete="email"
                returnKeyType="go"
                onSubmitEditing={handleReset}
                onBlur={() => setEmailError(email.trim() ? validateEmail(email) : null)}
                value={email}
                onChangeText={(t) => {
                  setEmail(t);
                  if (emailError) setEmailError(null);
                }}
              />
              <FieldError message={emailError} />
            </View>

            {error && <AuthNotice tone="error">{error}</AuthNotice>}

            <Captcha ref={captchaRef} />

            <Pressable style={styles.button} onPress={handleReset} disabled={loading}>
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Send reset link</Text>
              )}
            </Pressable>

            <Link href={{ pathname: "/(auth)", params: { email } }} style={styles.link}>
              Back to login
            </Link>
          </View>
        </DismissKeyboard>
      </KeyboardAvoidingView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, justifyContent: "center", padding: 24, gap: 12 },
  fieldGroup: { gap: 6 },
  label: { color: TEXT, fontWeight: "600", fontSize: 13, marginLeft: 2 },
  title: { fontSize: 28, fontWeight: "600", marginBottom: 12, textAlign: "center", color: TEXT },
  subtitle: { textAlign: "center", color: SUBTLE },
  input: {
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    backgroundColor: GLASS_BG,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: TEXT,
  },
  button: {
    backgroundColor: GREEN,
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    marginTop: 8,
  },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  error: { textAlign: "center", color: RED },
  link: { textAlign: "center", marginTop: 8, color: LINK },
});
