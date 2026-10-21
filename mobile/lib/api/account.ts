// API client to delete the account, wipe health data and send the password-changed email
import { apiSend, clearApiCache } from "./client";

/** Deletes the Supabase Auth user and, via cascade, every row of the user's data. Irreversible.
 *  `email` is the user's own address, re-typed as confirmation; the backend verifies it matches
 *  the account before deleting, and emails a closure notice afterwards. */
/** `appleAuthorizationCode` (Apple-ID accounts): a fresh code from Apple, so the server can also
 *  revoke the Sign in with Apple link. */
export async function deleteAccount(email: string, appleAuthorizationCode?: string): Promise<void> {
  await apiSend("DELETE", "/account", { email, appleAuthorizationCode });
  // The offline cache holds this user's health data — it must not outlive the account.
  await clearApiCache();
}

/** Wipes the user's health data (samples, workouts, scores, insights) but KEEPS the account and
 *  settings. The app is empty until the next sync re-imports from Apple Health. */
export async function wipeMyData(): Promise<void> {
  await apiSend("POST", "/account/wipe-data");
  // Drop the offline cache so the app doesn't keep showing the now-deleted numbers.
  await clearApiCache();
}

/** Asks the backend to send the "your password was changed" security email. Best-effort — the
 *  password change already happened client-side; a failure here must not surface as an error. */
export async function notifyPasswordChanged(): Promise<void> {
  await apiSend("POST", "/account/notify-password-change").catch(() => {});
}
