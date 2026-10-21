// React context/provider for the Supabase auth session, plus the useAuth hook
import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { jwtSessionId } from "./jwt";
import { readResetSessionId, writeResetSessionId } from "./reset-session";
import { supabase } from "./supabase";

type AuthContextValue = {
  session: Session | null;
  loading: boolean;
  /** A real login. A session from a password-reset link doesn't count: it only sets the new
   *  password (reset-password.tsx), so it can't open the app. */
  signedIn: boolean;
  /** reset-password.tsx marks the session its reset link created. */
  markResetSession: (session: Session) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  session: null,
  loading: true,
  signedIn: false,
  markResetSession: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [resetSessionId, setResetSessionId] = useState<string | null>(null);

  useEffect(() => {
    async function restore() {
      const [{ data }, markedId] = await Promise.all([supabase.auth.getSession(), readResetSessionId()]);
      let restored = data.session;
      let keptMark: string | null = null;
      if (markedId) {
        if (restored && jwtSessionId(restored.access_token) === markedId) {
          // The app was closed on the reset screen before a new password was set.
          const { error } = await supabase.auth.signOut({ scope: "local" });
          if (error)
            keptMark = markedId; // offline: it stays signed out in the app until it can be
          else restored = null;
        }
        if (!keptMark) await writeResetSessionId(null);
      }
      setResetSessionId(keptMark);
      setSession(restored);
      setLoading(false);
    }
    restore();

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  // In React Native, supabase-js only refreshes the access token while it's explicitly told
  // the app is in the foreground. Without this the token silently expires after ~1h; every
  // authed request then 401s — syncs fail (swallowed), the dashboard shows stale data, and
  // actions like delete-account error — until the user manually signs out and back in. If a
  // refresh ultimately fails, supabase fires SIGNED_OUT, which routes back to the login stack.
  useEffect(() => {
    supabase.auth.startAutoRefresh();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    });
    return () => sub.remove();
  }, []);

  const markResetSession = useCallback(async (resetSession: Session) => {
    const id = jwtSessionId(resetSession.access_token);
    setResetSessionId(id);
    await writeResetSessionId(id);
  }, []);

  // The mark is never cleared while the app runs: once that session ends (signed out after the
  // reset, or Cancel), any new login has a different id. The next launch tidies it up.
  const signedIn =
    !!session && (resetSessionId === null || jwtSessionId(session.access_token) !== resetSessionId);

  return (
    <AuthContext.Provider value={{ session, loading, signedIn, markResetSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
