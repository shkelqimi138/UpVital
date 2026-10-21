// Sensitive account operations: changing password and email. Kept out of the screen so the
// Supabase calls live in one place and the UI just collects input + shows errors.
import { supabase } from "./supabase";
import { normalizeEmail } from "./disposable-emails";

/**
 * Change the password on the current session. Supabase checks the current password itself
 * ("Require current password when updating" is ON in the dashboard; a password-reset session is
 * exempt): a wrong one comes back as `current_password_invalid`, a new one identical to the
 * current one as `same_password` — the caller maps both via authErrorMessage.
 */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({
    current_password: currentPassword,
    password: newPassword,
  });
  if (error) throw error;
}

/**
 * Start an email change. With Supabase "Secure email change" on (the default), this sends a
 * confirmation link to BOTH the old and the new address; the change only takes effect once the
 * link(s) are followed — so nothing here changes the address immediately.
 */
export async function requestEmailChange(newEmail: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ email: normalizeEmail(newEmail) });
  if (error) throw error;
}
