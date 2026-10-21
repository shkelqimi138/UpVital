// Profile → Email: change the account email (current + new + confirm; both addresses confirm).
import { useState } from "react";
import {
  Field,
  FormCard,
  FormMessage,
  Hint,
  PrimaryButton,
  ProfilePage,
} from "../../components/profile/form";
import { useAccount } from "../../components/profile/use-account";
import { useAnnouncedState, useScreenActiveRef } from "../../lib/hooks/announce";
import { requestEmailChange } from "../../lib/auth/auth-actions";
import { authErrorMessage, validateEmailChange } from "../../lib/auth/auth-errors";

export default function EmailScreen() {
  const { email } = useAccount();
  // Form messages are spoken to VoiceOver while this screen is on display.
  const screenActive = useScreenActiveRef();
  const [currentEmailTyped, setCurrentEmailTyped] = useState("");
  const [newEmailInput, setNewEmailInput] = useState("");
  const [confirmEmailInput, setConfirmEmailInput] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useAnnouncedState(screenActive);
  const [emailError, setEmailError] = useAnnouncedState(screenActive);

  async function handleChangeEmail() {
    setEmailMsg(null);
    setEmailError(null);
    const invalid = validateEmailChange(email ?? "", currentEmailTyped, newEmailInput, confirmEmailInput);
    if (invalid) {
      setEmailError(invalid);
      return;
    }
    setEmailBusy(true);
    try {
      await requestEmailChange(newEmailInput);
      setCurrentEmailTyped("");
      setNewEmailInput("");
      setConfirmEmailInput("");
      setEmailMsg(
        `Confirmation links sent to both your current and new address. Your email changes once you confirm from both.`,
      );
    } catch (err) {
      setEmailError(authErrorMessage(err));
    } finally {
      setEmailBusy(false);
    }
  }

  return (
    <ProfilePage>
      <Hint>Current: {email ?? "—"}</Hint>
      <FormCard>
        <Field
          label="Current email"
          placeholder="you@example.com"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          value={currentEmailTyped}
          onChangeText={setCurrentEmailTyped}
        />
        <Field
          label="New email"
          placeholder="new@example.com"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="off"
          value={newEmailInput}
          onChangeText={setNewEmailInput}
        />
        <Field
          label="Confirm new email"
          placeholder="Re-enter the new email"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="off"
          value={confirmEmailInput}
          onChangeText={setConfirmEmailInput}
        />
      </FormCard>
      <PrimaryButton label="Change email" onPress={handleChangeEmail} busy={emailBusy} />
      <FormMessage success={emailMsg} error={emailError} />
    </ProfilePage>
  );
}
