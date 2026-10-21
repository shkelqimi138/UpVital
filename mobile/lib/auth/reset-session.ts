// Remembers (in the Keychain, next to the session itself) which login session came from a
// password-reset link. That session may only set the new password: it never counts as signed in
// (auth-context.tsx), and if the app is closed before the reset is finished it's signed out on the
// next launch. Without this, the reset link alone opened the app.
import * as SecureStore from "expo-secure-store";

const KEY = "upvital.resetSessionId";

export async function readResetSessionId(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(KEY);
  } catch {
    return null;
  }
}

export async function writeResetSessionId(id: string | null): Promise<void> {
  try {
    if (id) await SecureStore.setItemAsync(KEY, id);
    else await SecureStore.deleteItemAsync(KEY);
  } catch {
    // best-effort, like the session storage itself
  }
}
