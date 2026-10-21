// Building blocks for the Profile sub-pages (app/profile/*): the scrolling page, cards that group
// the fields, labelled fields, the brand CTA, text buttons for secondary/destructive steps and
// inline form messages. Each page has one filled button — everything else is a text button.
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { brand, layout, radius, spacing, typography, useTheme } from "../../lib/theme";
import { Card } from "../ui/Card";

/** Scrolling page body for a Profile sub-page (the stack header supplies the title). */
export function ProfilePage({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.page}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      // Short pages have nothing to scroll; this insets the content so the keyboard can't hide
      // the field being typed in or the Save button.
      automaticallyAdjustKeyboardInsets
    >
      {children}
    </ScrollView>
  );
}

/** Groups a page's fields in a card like the Profile list's, with an optional small-caps heading. */
export function FormCard({ title, children }: { title?: string; children: ReactNode }) {
  const { colors, shadows } = useTheme();
  return (
    <View style={styles.group}>
      {title && (
        <Text
          style={[typography.micro, styles.heading, { color: colors.textTertiary }]}
          accessibilityRole="header"
        >
          {title.toUpperCase()}
        </Text>
      )}
      <Card style={[styles.card, shadows.card]}>{children}</Card>
    </View>
  );
}

/** A labelled text field. */
export function Field({ label, ...input }: { label: string } & React.ComponentProps<typeof TextInput>) {
  const { colors, textColor } = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[typography.body, { color: colors.textSecondary }]}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          { color: textColor, backgroundColor: colors.cardInset, borderRadius: radius.field },
        ]}
        placeholderTextColor={colors.textTertiary}
        accessibilityLabel={label}
        {...input}
      />
    </View>
  );
}

/** Read-only labelled value (e.g. latest weight, which is set by syncing, not typed here). */
export function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  const { colors, textColor } = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[typography.body, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[typography.bodyLarge, { color: textColor }]}>{value}</Text>
    </View>
  );
}

/** Filled brand-green CTA — the page's main action (one per page). */
export function PrimaryButton({
  label,
  onPress,
  busy,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={[styles.button, { backgroundColor: brand.greenDeep }, disabled && styles.buttonDisabled]}
      onPress={onPress}
      disabled={busy || disabled}
      accessibilityRole="button"
      // Named explicitly: while busy the spinner replaces the text, and VoiceOver would hear no name.
      accessibilityLabel={label}
      accessibilityState={{ disabled: busy || disabled, busy: !!busy }}
    >
      {busy ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <Text style={[typography.bodyLarge, styles.buttonText]}>{label}</Text>
      )}
    </Pressable>
  );
}

/** Text-only button for a secondary step, red for a destructive one (Disconnect, Delete…). */
export function TextButton({
  label,
  onPress,
  busy,
  destructive = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  destructive?: boolean;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const color = destructive ? colors.status.error : colors.link;
  return (
    <Pressable
      style={({ pressed }) => [
        styles.textButton,
        disabled && styles.buttonDisabled,
        pressed && styles.pressed,
      ]}
      onPress={onPress}
      disabled={busy || disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: busy || disabled, busy: !!busy }}
    >
      {busy ? (
        <ActivityIndicator color={color} />
      ) : (
        <Text style={[typography.bodyLarge, styles.textButtonText, { color }]}>{label}</Text>
      )}
    </Pressable>
  );
}

/** Inline result under a form: green for success, red for an error. Nothing when empty. */
export function FormMessage({ success, error }: { success?: string | null; error?: string | null }) {
  const { colors } = useTheme();
  return (
    <>
      {success && <Text style={[typography.body, { color: colors.link }]}>{success}</Text>}
      {error && <Text style={[typography.body, { color: colors.status.error }]}>{error}</Text>}
    </>
  );
}

/** Explanatory text under a page heading. */
export function Hint({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return <Text style={[typography.body, { color: colors.textSecondary }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  page: { padding: layout.screenPadding, paddingBottom: 40, gap: spacing.md },
  group: { gap: spacing.sm },
  heading: { marginLeft: spacing.lg, letterSpacing: 0.6 },
  card: { gap: spacing.md },
  field: { gap: spacing.s6 },
  input: { padding: spacing.md, fontSize: 15 },
  button: {
    borderRadius: radius.button,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: "#FFFFFF", fontWeight: "700" },
  // 44 pt tall: the minimum touch target.
  textButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  textButtonText: { fontWeight: "600" },
  pressed: { opacity: 0.6 },
});
