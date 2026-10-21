// Profile → Password: current password (Supabase checks it when saving), then new + confirm.
import { useState } from "react";
import { Field, FormCard, FormMessage, PrimaryButton, ProfilePage } from "../../components/profile/form";
import { notifyPasswordChanged } from "../../lib/api/account";
import { useAnnouncedState, useScreenActiveRef } from "../../lib/hooks/announce";
import { changePassword } from "../../lib/auth/auth-actions";
import { authErrorMessage, PASSWORD_RULE_HINT, validatePasswordChange } from "../../lib/auth/auth-errors";

export default function PasswordScreen() {
  // Form messages are spoken to VoiceOver while this screen is on display.
  const screenActive = useScreenActiveRef();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useAnnouncedState(screenActive);
  const [pwError, setPwError] = useAnnouncedState(screenActive);

  async function handleUpdatePassword() {
    setPwMsg(null);
    setPwError(null);
    const invalid = validatePasswordChange(currentPassword, newPassword, confirmPassword);
    if (invalid) {
      setPwError(invalid);
      return;
    }
    setPwBusy(true);
    try {
      // A wrong current password is rejected by Supabase — someone holding an unlocked,
      // signed-in phone must still know it to change it.
      await changePassword(currentPassword, newPassword);
      // Fire the "password changed" security email via our backend (Supabase doesn't send one on
      // this non-reauth flow). Best-effort — never block the success message on it.
      void notifyPasswordChanged();
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPwMsg("Password updated.");
    } catch (err) {
      setPwError(authErrorMessage(err));
    } finally {
      setPwBusy(false);
    }
  }

  return (
    <ProfilePage>
      <FormCard>
        <Field
          label="Current password"
          placeholder="Enter your current password"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="password"
          autoComplete="current-password"
          value={currentPassword}
          onChangeText={setCurrentPassword}
        />
        <Field
          label="New password"
          placeholder={PASSWORD_RULE_HINT}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="newPassword"
          autoComplete="password-new"
          value={newPassword}
          onChangeText={setNewPassword}
        />
        <Field
          label="Confirm new password"
          placeholder="Re-enter the new password"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="newPassword"
          autoComplete="password-new"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
        />
      </FormCard>
      <PrimaryButton label="Update password" onPress={handleUpdatePassword} busy={pwBusy} />
      <FormMessage success={pwMsg} error={pwError} />
    </ProfilePage>
  );
}
