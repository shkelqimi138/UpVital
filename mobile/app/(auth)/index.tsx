// Login screen: email/password with captcha, Sign in with Apple, resend confirmation
import * as AppleAuthentication from "expo-apple-authentication";
import { openURL } from "expo-linking";
import { Link, useLocalSearchParams } from "expo-router";
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
import { Captcha, CaptchaHandle } from "../../components/auth/Captcha";
import { AuthNotice } from "../../components/ui/AuthNotice";
import { DismissKeyboard } from "../../components/ui/DismissKeyboard";
import { FieldError } from "../../components/ui/FieldError";
import { PasswordInput } from "../../components/ui/PasswordInput";
import { ScreenBackground } from "../../components/ui/ScreenBackground";
import { authErrorMessage, validateCredentials, validateEmail } from "../../lib/auth/auth-errors";
import { normalizeEmail } from "../../lib/auth/disposable-emails";
import { getCaptchaToken } from "../../lib/auth/captcha";
import { supabase } from "../../lib/auth/supabase";
import { useAnnouncedState, useScreenActiveRef } from "../../lib/hooks/announce";

// Auth screens use their own fixed white-on-image palette over the hero image (not the theme
// tokens), so text stays legible on the photo.
const TEXT = "#FFFFFF";
const PLACEHOLDER = "rgba(255,255,255,0.55)";
const SUBTLE = "rgba(255,255,255,0.72)";
const GLASS_BG = "rgba(255,255,255,0.10)";
const GLASS_BORDER = "rgba(255,255,255,0.22)";
// Button fill behind white text: brand.greenDeep (4.7:1; the brighter green is only 3.3:1).
const GREEN = "#12854A";
const LINK = "#5FE39C";
const RED = "#FF6B6B";

export default function LoginScreen() {
  // Carry the typed email across the auth screens, so switching login ↔ signup ↔ forgot
  // doesn't make the user retype it.
  const params = useLocalSearchParams<{ email?: string; reset?: string }>();
  const [email, setEmail] = useState(params.email ?? "");
  const screenActive = useScreenActiveRef();
  const [emailError, setEmailError] = useAnnouncedState(screenActive);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useAnnouncedState(screenActive);
  // When email confirmation is required (Supabase "Confirm email"), an unconfirmed
  // account can't sign in until it clicks the link. We surface that clearly and let
  // them re-send the confirmation email instead of showing a raw error.
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [notice, setNotice] = useAnnouncedState(screenActive);
  const captchaRef = useRef<CaptchaHandle>(null);
  const passwordRef = useRef<TextInput>(null);

  // Arriving from a password reset (reset-password.tsx signs the phone out first).
  useEffect(() => {
    if (params.reset === "1") setNotice("Password updated. Log in with your new password.");
  }, [params.reset, setNotice]);

  async function handleLogin() {
    setError(null);
    setNotice(null);
    setUnconfirmed(false);

    // Check the form here rather than letting the API answer "missing email or phone" —
    // that message is written for the API's callers and mentions a phone login we don't have.
    const invalid = validateCredentials(email, password, "login");
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
    const { error: signInError } = await supabase.auth.signInWithPassword({
      // Sign in with the SAME canonical form signup stored (lowercased; Gmail dots/+tags folded).
      // Without this, "jane.doe@gmail.com" wouldn't match the stored "janedoe@gmail.com".
      email: normalizeEmail(email),
      password,
      options: { captchaToken },
    });
    setLoading(false);
    if (signInError) {
      if (signInError.code === "email_not_confirmed" || /not confirmed/i.test(signInError.message)) {
        setUnconfirmed(true);
      }
      setError(authErrorMessage(signInError));
    }
  }

  async function handleResend() {
    setError(null);
    setNotice(null);
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
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      // Canonical form (matches signup) so the resend targets the account that actually exists.
      email: normalizeEmail(email),
      // Same Universal Link as signup so a re-sent confirmation also opens the app. See signup.tsx.
      options: { captchaToken, emailRedirectTo: "https://upvital.app/confirmed" },
    });
    setLoading(false);
    if (resendError) {
      setError(authErrorMessage(resendError));
      return;
    }
    setUnconfirmed(false);
    setNotice(
      `Confirmation email re-sent to ${normalizeEmail(email)}. It can take a minute to arrive. If you don't see it, please check your junk folder.`,
    );
  }

  async function handleAppleSignIn() {
    setError(null);
    setNotice(null);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) {
        setError("Apple couldn't complete the sign-in. Please try again.");
        return;
      }
      const { error: signInError } = await supabase.auth.signInWithIdToken({
        provider: "apple",
        token: credential.identityToken,
      });
      if (signInError) {
        setError(authErrorMessage(signInError));
      }
    } catch (err: any) {
      // The user tapping Cancel isn't an error worth showing.
      if (err?.code !== "ERR_REQUEST_CANCELED") {
        setError(authErrorMessage(err));
      }
    }
  }

  return (
    <ScreenBackground source={require("../../assets/bg-auth.png")} scrim={0.4}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <DismissKeyboard>
          <View style={styles.container}>
            <Text style={styles.title}>Log in</Text>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor={PLACEHOLDER}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="username"
                autoComplete="email"
                returnKeyType="next"
                submitBehavior="submit"
                onSubmitEditing={() => passwordRef.current?.focus()}
                onBlur={() => setEmailError(email.trim() ? validateEmail(email) : null)}
                value={email}
                onChangeText={(t) => {
                  setEmail(t);
                  if (emailError) setEmailError(null);
                }}
              />
              <FieldError message={emailError} />
            </View>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Password</Text>
              <PasswordInput
                ref={passwordRef}
                inputStyle={styles.input}
                eyeColor={PLACEHOLDER}
                placeholder="Enter your password"
                placeholderTextColor={PLACEHOLDER}
                textContentType="password"
                autoComplete="password"
                returnKeyType="go"
                onSubmitEditing={handleLogin}
                value={password}
                onChangeText={setPassword}
              />
            </View>

            {error && <AuthNotice tone="error">{error}</AuthNotice>}
            {notice && <AuthNotice tone="success">{notice}</AuthNotice>}
            {unconfirmed && (
              <Pressable onPress={handleResend} disabled={loading}>
                <Text style={styles.link}>Resend confirmation email</Text>
              </Pressable>
            )}

            <Captcha ref={captchaRef} />

            <Pressable style={styles.button} onPress={handleLogin} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Log in</Text>}
            </Pressable>

            <Link href={{ pathname: "/(auth)/forgot-password", params: { email } }} style={styles.link}>
              Forgot password?
            </Link>
            <Link href={{ pathname: "/(auth)/signup", params: { email } }} style={styles.link}>
              Don't have an account? Sign up
            </Link>

            {Platform.OS === "ios" && (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                cornerRadius={8}
                style={styles.appleButton}
                onPress={handleAppleSignIn}
              />
            )}
            {Platform.OS === "ios" && (
              // Sign in with Apple creates the account on first use, so it carries the same terms as sign-up.
              <Text style={styles.disclaimer}>
                New to UpVital? Signing in with Apple creates an account: you agree to our{" "}
                <Text style={styles.disclaimerLink} onPress={() => openURL("https://upvital.app/terms")}>
                  Terms of Service
                </Text>{" "}
                and{" "}
                <Text style={styles.disclaimerLink} onPress={() => openURL("https://upvital.app/privacy")}>
                  Privacy Policy
                </Text>{" "}
                and confirm you're 16 or older.
              </Text>
            )}
          </View>
        </DismissKeyboard>
      </KeyboardAvoidingView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  disclaimer: { textAlign: "center", fontSize: 13, lineHeight: 18, marginTop: 4, color: SUBTLE },
  disclaimerLink: { color: LINK },
  container: { flex: 1, justifyContent: "center", padding: 24, gap: 12 },
  fieldGroup: { gap: 6 },
  label: { color: TEXT, fontWeight: "600", fontSize: 13, marginLeft: 2 },
  title: { fontSize: 28, fontWeight: "600", marginBottom: 12, textAlign: "center", color: TEXT },
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
  notice: { textAlign: "center", color: LINK },
  link: { textAlign: "center", marginTop: 8, color: LINK },
  appleButton: { width: "100%", height: 44, marginTop: 16 },
});
