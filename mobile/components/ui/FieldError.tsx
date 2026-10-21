import { StyleSheet, Text } from "react-native";

// Inline error under an auth-screen field (shown when the user leaves a field with a bad
// value). Like AuthNotice it carries its own color, since the auth screens sit on the
// force-dark hero image rather than the theme. The screen speaks it to VoiceOver by holding the
// message in `useAnnouncedState`.
export function FieldError({ message }: { message: string | null }) {
  if (!message) return null;
  return <Text style={styles.text}>{message}</Text>;
}

const styles = StyleSheet.create({
  text: { color: "#FF6B6B", fontSize: 12.5, marginLeft: 2 },
});
