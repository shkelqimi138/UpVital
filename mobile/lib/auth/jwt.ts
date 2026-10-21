// Reads the login-session id from a Supabase access token without verifying it: it's this
// phone's own stored token, used only to tell sessions apart (the server verifies every request).

/** The `session_id` claim of an access token, or null if it has none or isn't a JWT. */
export function jwtSessionId(accessToken: string): string | null {
  try {
    const payload = accessToken.split(".")[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const claims = JSON.parse(atob(padded));
    return typeof claims.session_id === "string" ? claims.session_id : null;
  } catch {
    return null;
  }
}
