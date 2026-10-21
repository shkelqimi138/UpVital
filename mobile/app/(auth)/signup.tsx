// Sign-up screen: email/password with captcha and Sign up with Apple
import * as AppleAuthentication from "expo-apple-authentication";
import { openURL } from "expo-linking";
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
import { PasswordInput } from "../../components/ui/PasswordInput";
import { ScreenBackground } from "../../components/ui/ScreenBackground";
import {
  authErrorMessage,
  validateCredentials,
  validateEmail,
  validatePasswordStrength,
} from "../../lib/auth/auth-errors";
import { isDisposableEmail, normalizeEmail } from "../../lib/auth/disposable-emails";
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

export default function SignupScreen() {
  // Carry the email typed on the login screen so switching over doesn't make them retype it.
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? "");
  const screenActive = useScreenActiveRef();
  const [emailError, setEmailError] = useAnnouncedState(screenActive);
  const [password, setPassword] = useState("");
  const [pwError, setPwError] = useAnnouncedState(screenActive);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useAnnouncedState(screenActive);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const captchaRef = useRef<CaptchaHandle>(null);
  const passwordRef = useRef<TextInput>(null);

  async function handleSignup() {
    setError(null);

    // Catch an empty or malformed form here — the API's own answer for a blank field is
    // "missing email or phone", which mentions a phone login this app doesn't offer.
    const invalid = validateCredentials(email, password, "signup");
    if (invalid) {
      setError(invalid);
      return;
    }

    const normalizedEmail = normalizeEmail(email);
    if (isDisposableEmail(normalizedEmail)) {
      setError("Please use a permanent email address — disposable email providers aren't allowed.");
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
    const { error: signUpError } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      // Universal Link (Stage-6 c-1): iOS opens the app directly from this https link when
      // installed, and falls back to the web page (web/confirmed.html) otherwise. The account
      // is confirmed server-side BEFORE the redirect, so no token travels in this URL — the
      // link only needs to reopen the app, where the user logs in. `https://upvital.app/confirmed`
      // must be in Supabase → Auth → URL Configuration → Redirect URLs.
      options: { captchaToken, emailRedirectTo: "https://upvital.app/confirmed" },
    });
    setLoading(false);
    if (signUpError) {
      setError(authErrorMessage(signUpError));
      return;
    }
    // Enumeration protection: for an already-registered *confirmed* email, Supabase returns a
    // decoy user (empty `identities`) and sends nothing. We deliberately treat it like a new
    // sign-up — the "check your email" screen is worded to fit both cases and points existing
    // users to Log in — so the form can't be used to find out which emails have accounts.
    setConfirmationSent(true);
  }

  // Sign in with Apple also creates the account on first use, so it doubles as "sign up with
  // Apple". Offered here as well as on login to satisfy App Store Guideline 4.8 (equal footing
  // wherever a third-party login is shown).
  async function handleAppleSignIn() {
    setError(null);
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

  if (confirmationSent) {
    return (
      <ScreenBackground source={require("../../assets/bg-auth.png")} scrim={0.4}>
        <View style={styles.container}>
          <Text style={styles.title}>Check your email</Text>
          <Text style={styles.subtitle}>
            If {normalizeEmail(email)} is new to UpVital, we've sent it a confirmation link. Tap it to finish
            setting up your account. Already have an account with this email? Log in instead.
          </Text>
          <Text style={styles.subtitle}>
            It can take a minute to arrive. If you don't see it, please check your junk folder.
          </Text>
          <Link href="/(auth)" style={styles.link}>
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
            <Text style={styles.title}>Sign up</Text>

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
                placeholder="8+ chars, a letter & a number"
                placeholderTextColor={PLACEHOLDER}
                textContentType="newPassword"
                autoComplete="password-new"
                returnKeyType="go"
                onSubmitEditing={handleSignup}
                onBlur={() => setPwError(password ? validatePasswordStrength(password) : null)}
                value={password}
                onChangeText={(t) => {
                  setPassword(t);
                  if (pwError) setPwError(null);
                }}
              />
              <FieldError message={pwError} />
            </View>

            {error && <AuthNotice tone="error">{error}</AuthNotice>}

            <Captcha ref={captchaRef} />

            <Pressable style={styles.button} onPress={handleSignup} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign up</Text>}
            </Pressable>

            <Link href={{ pathname: "/(auth)", params: { email } }} style={styles.link}>
              Already have an account? Log in
            </Link>

            {Platform.OS === "ios" && (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                cornerRadius={8}
                style={styles.appleButton}
                onPress={handleAppleSignIn}
              />
            )}

            <Text style={styles.disclaimer}>
              By signing up you agree to our{" "}
              <Text style={styles.disclaimerLink} onPress={() => openURL("https://upvital.app/terms")}>
                Terms of Service
              </Text>{" "}
              and{" "}
              <Text style={styles.disclaimerLink} onPress={() => openURL("https://upvital.app/privacy")}>
                Privacy Policy
              </Text>{" "}
              and confirm you're 16 or older.
            </Text>
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
  appleButton: { width: "100%", height: 44, marginTop: 16 },
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
  disclaimer: { textAlign: "center", fontSize: 13, lineHeight: 18, marginTop: 4, color: SUBTLE },
  disclaimerLink: { color: LINK },
});
