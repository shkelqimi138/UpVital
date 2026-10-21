// Configured Supabase client (publishable key) for the mobile app's auth and queries
import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import { SecureStorageAdapter } from "./secure-storage";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY are not set");
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    // Tokens are stored in the iOS Keychain (encrypted at rest), not plaintext AsyncStorage.
    storage: SecureStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    // PKCE: email links (password reset especially) carry a one-time code that only works with
    // the secret this phone stored when it asked for the email — never the session tokens. So a
    // link grabbed by another app on the upvital:// scheme, or a crafted link carrying someone
    // else's tokens, can't sign anyone in. The reset screen swaps the code for a session.
    flowType: "pkce",
  },
});
