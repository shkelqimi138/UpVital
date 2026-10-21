// AI health coach chat screen
import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { friendlyMessage } from "../lib/api/client";
import {
  AiConsentRequiredError,
  CoachMessage,
  CoachNotConfiguredError,
  sendCoachMessage,
} from "../lib/api/coach";
import { getProfile } from "../lib/api/profile";
import { confirmAiConsent } from "../lib/ai-consent";
import { brand, radius, spacing, typography, useTheme } from "../lib/theme";
import { useAnnouncedState, useScreenActiveRef } from "../lib/hooks/announce";

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function CoachChatScreen() {
  const { colors, textColor, subtleColor, shadows } = useTheme();
  const insets = useSafeAreaInsets();
  const { seed } = useLocalSearchParams<{ seed?: string }>();

  const today = toDateString(new Date());
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const screenActive = useScreenActiveRef();
  const [error, setError] = useAnnouncedState(screenActive);
  const [notConfigured, setNotConfigured] = useState(false);
  // null while loading. If the profile can't be read, the server still refuses without consent.
  const [aiConsent, setAiConsent] = useState<boolean | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  // A suggestion tapped on the Coach screen arrives as `seed` and is sent once, as soon as AI is on.
  const seeded = useRef(false);

  useEffect(() => {
    getProfile().then(
      (profile) => setAiConsent(profile.aiConsent),
      () => setAiConsent(true),
    );
  }, []);

  async function send(text: string) {
    const content = text.trim();
    if (!content || sending) return;
    setError(null);
    setInput("");
    const next: CoachMessage[] = [...messages, { role: "user", content }];
    setMessages(next);
    setSending(true);
    try {
      const reply = await sendCoachMessage(today, next);
      setMessages([...next, { role: "assistant", content: reply }]);
    } catch (err) {
      if (err instanceof CoachNotConfiguredError) {
        setNotConfigured(true);
      } else if (err instanceof AiConsentRequiredError) {
        setAiConsent(false);
        // The suggestion goes again by itself once AI is turned on (effect below).
        if (content === seed) seeded.current = false;
      } else {
        setError(friendlyMessage(err));
      }
      // Roll the failed user turn back out so it can be retried cleanly.
      setMessages(messages);
      setInput(content);
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    if (seed && aiConsent && !seeded.current) {
      seeded.current = true;
      send(seed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, aiConsent]);

  async function handleTurnOnAi() {
    if (await confirmAiConsent()) setAiConsent(true);
  }

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages, sending]);

  if (notConfigured) {
    return (
      <View style={[styles.configWrap, { backgroundColor: colors.background }]}>
        <Text style={[typography.bodyLarge, { color: textColor, textAlign: "center" }]}>
          Your AI coach isn't available yet.
        </Text>
        <Text style={[typography.body, { color: subtleColor, textAlign: "center" }]}>
          We're still setting it up — check back soon and it'll be ready to chat.
        </Text>
      </View>
    );
  }

  if (aiConsent === false) {
    return (
      <View style={[styles.configWrap, { backgroundColor: colors.background }]}>
        <Text style={[typography.bodyLarge, { color: textColor, textAlign: "center" }]}>
          AI Coach is off.
        </Text>
        <Text style={[typography.body, { color: subtleColor, textAlign: "center" }]}>
          Coach replies are written by Claude, an AI from Anthropic (USA), from your scores and recent health
          data.
        </Text>
        <Pressable
          style={[styles.turnOn, { backgroundColor: brand.greenDeep }]}
          onPress={() => void handleTurnOnAi()}
          accessibilityRole="button"
          accessibilityLabel="Turn on AI insights and Coach"
        >
          <Text style={styles.turnOnText}>Turn on</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={insets.top + 44}
    >
      <ScrollView ref={scrollRef} contentContainerStyle={styles.thread} keyboardDismissMode="interactive">
        {messages.length === 0 && !sending && (
          <Text style={[typography.body, styles.empty, { color: subtleColor }]}>
            Ask about your recovery, sleep, stress, or how to train today.
          </Text>
        )}

        {messages.map((m, i) =>
          m.role === "user" ? (
            <View key={i} style={[styles.bubble, styles.userBubble, { backgroundColor: brand.greenDeep }]}>
              <Text style={[typography.bodyLarge, { color: "#FFFFFF" }]}>{m.content}</Text>
            </View>
          ) : (
            <View
              key={i}
              style={[styles.bubble, styles.coachBubble, { backgroundColor: colors.card }, shadows.card]}
            >
              <Text style={[typography.bodyLarge, { color: textColor }]}>{m.content}</Text>
            </View>
          ),
        )}

        {sending && (
          <View style={[styles.bubble, styles.coachBubble, { backgroundColor: colors.card }, shadows.card]}>
            <ActivityIndicator color={subtleColor} />
          </View>
        )}

        {error && (
          <Text style={[typography.body, styles.error, { color: colors.status.error }]}>{error}</Text>
        )}
      </ScrollView>

      <Text style={[styles.disclaimer, { color: colors.textTertiary, backgroundColor: colors.card }]}>
        AI coach by Claude (Anthropic) — not medical advice.
      </Text>

      <View
        style={[
          styles.inputBar,
          {
            backgroundColor: colors.card,
            borderTopColor: colors.border,
            paddingBottom: insets.bottom + spacing.sm,
          },
        ]}
      >
        <TextInput
          style={[
            styles.input,
            { color: textColor, backgroundColor: colors.cardInset, borderRadius: radius.pill },
          ]}
          placeholder="Ask your coach…"
          placeholderTextColor={colors.textTertiary}
          value={input}
          onChangeText={setInput}
          // Matches the server's cost cap with room to spare (routes/coach.ts).
          maxLength={1000}
          onSubmitEditing={() => send(input)}
          returnKeyType="send"
          editable={!sending}
        />
        <Pressable
          style={[
            styles.sendChip,
            { backgroundColor: input.trim() && !sending ? brand.greenDeep : colors.pill },
          ]}
          onPress={() => send(input)}
          disabled={!input.trim() || sending}
          accessibilityRole="button"
          accessibilityLabel="Send message"
        >
          <Text
            style={[styles.sendGlyph, { color: input.trim() && !sending ? "#FFFFFF" : colors.textTertiary }]}
          >
            ↑
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  thread: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 },
  empty: { textAlign: "center", marginTop: 40 },
  bubble: { maxWidth: "85%", borderRadius: radius.card, padding: spacing.md },
  userBubble: { alignSelf: "flex-end", borderBottomRightRadius: spacing.s6 },
  coachBubble: { alignSelf: "flex-start", borderBottomLeftRadius: spacing.s6 },
  error: { textAlign: "center", marginTop: spacing.sm },
  disclaimer: {
    ...typography.micro,
    textAlign: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 15,
    maxHeight: 120,
  },
  sendChip: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  sendGlyph: { fontSize: 18, fontWeight: "700" },
  configWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xxl,
    gap: spacing.sm,
  },
  turnOn: {
    borderRadius: radius.button,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxl,
    marginTop: spacing.md,
  },
  turnOnText: { color: "#FFFFFF", fontWeight: "600", fontSize: 16 },
});
