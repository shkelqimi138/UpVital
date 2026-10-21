// Revokes a user's Sign in with Apple link when they delete their account (Apple's account-deletion
// rule for apps that offer Sign in with Apple). The app gets a fresh authorization code from Apple
// right before deleting; we swap it for a token and revoke that, which also removes UpVital from
// the user's "Sign in with Apple" list in iOS Settings. Uses the Apple key (lib/apple-jwt.ts);
// without it, it logs and skips.
import { appleKey, signAppleJwt } from "./apple-jwt";

const APPLE = "https://appleid.apple.com";
// Native sign-in on iOS issues codes for the app's bundle ID, so that is the client ID here.
const CLIENT_ID = process.env.APPLE_CLIENT_ID || "com.upvital.app";
const TIMEOUT_MS = 8000;

/** Apple's "client secret": a short-lived JWT signed with the Apple key. Exported for its test. */
export function clientSecret(teamId: string, keyId: string, privateKeyPem: string): string {
  const now = Math.floor(Date.now() / 1000);
  return signAppleJwt(keyId, privateKeyPem, {
    iss: teamId,
    iat: now,
    exp: now + 300,
    aud: APPLE,
    sub: CLIENT_ID,
  });
}

function applePost(path: string, params: Record<string, string>): Promise<Response> {
  return fetch(`${APPLE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

/** Best-effort, never throws: true once Apple confirms the revocation. */
export async function revokeAppleSignIn(authorizationCode: string): Promise<boolean> {
  const key = appleKey();
  if (!key) {
    console.warn("[apple] Apple key not configured, so the Apple link was not revoked.");
    return false;
  }
  try {
    const secret = clientSecret(key.teamId, key.keyId, key.privateKey);
    const tokenRes = await applePost("/auth/token", {
      client_id: CLIENT_ID,
      client_secret: secret,
      code: authorizationCode,
      grant_type: "authorization_code",
    });
    if (!tokenRes.ok) {
      console.error(`[apple] code exchange failed: ${tokenRes.status}`);
      return false;
    }
    const tokens = (await tokenRes.json()) as { refresh_token?: string; access_token?: string };
    const token = tokens.refresh_token ?? tokens.access_token;
    if (!token) return false;
    const revokeRes = await applePost("/auth/revoke", {
      client_id: CLIENT_ID,
      client_secret: secret,
      token,
      token_type_hint: tokens.refresh_token ? "refresh_token" : "access_token",
    });
    if (!revokeRes.ok) {
      console.error(`[apple] revoke failed: ${revokeRes.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[apple] revoke error:", err);
    return false;
  }
}
