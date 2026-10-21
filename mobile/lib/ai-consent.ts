// Asking before anything goes to Anthropic: the one confirm used by every "turn on AI" path.
// GDPR Art. 9 explicit consent + App Store 5.1.2(i) (name the third-party AI, ask first).
import { Alert } from "react-native";
import { updateProfile } from "./api/profile";

/** Shows what is sent and to whom, and saves the consent if the user taps "Turn on".
 *  Resolves true once it's saved; false if they decline or the save fails. */
export function confirmAiConsent(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      "Turn on AI insights & Coach?",
      "Your daily insight and coach replies are written by Claude, an AI from Anthropic (USA). " +
        "For this, UpVital sends Anthropic your scores, recent health data (steps, heart rate, HRV, " +
        "sleep, workouts), age and goals, and your coach messages. Anthropic doesn't train on it and " +
        "deletes it within 30 days. You can turn this off anytime in Profile.",
      [
        { text: "Not now", style: "cancel", onPress: () => resolve(false) },
        {
          text: "Turn on",
          onPress: () => {
            updateProfile({ aiConsent: true }).then(
              () => resolve(true),
              () => {
                Alert.alert("Couldn't turn it on", "Check your connection and try again.");
                resolve(false);
              },
            );
          },
        },
      ],
    );
  });
}
