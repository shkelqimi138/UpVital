// The team's Apple key (.p8, with push + Sign in with Apple enabled) and the ES256 JWTs Apple wants
// for APNs pushes (push.ts) and Sign in with Apple revocation (apple-revoke.ts). One key does both;
// it lives only in Railway: APPLE_TEAM_ID, APPLE_SIWA_KEY_ID, APPLE_SIWA_PRIVATE_KEY.
import { createPrivateKey, sign } from "node:crypto";

export type AppleKey = { teamId: string; keyId: string; privateKey: string };

/** The key from the environment, or null when it isn't configured. */
export function appleKey(): AppleKey | null {
  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_SIWA_KEY_ID;
  const privateKey = process.env.APPLE_SIWA_PRIVATE_KEY;
  if (!teamId || !keyId || !privateKey) return null;
  // Railway may store the key's line breaks as literal "\n".
  return { teamId, keyId, privateKey: privateKey.replace(/\\n/g, "\n") };
}

const base64url = (input: Buffer | string) => Buffer.from(input).toString("base64url");

/** An ES256 JWT signed with the Apple key. */
export function signAppleJwt(keyId: string, privateKeyPem: string, claims: Record<string, unknown>): string {
  const header = base64url(JSON.stringify({ alg: "ES256", kid: keyId }));
  const payload = base64url(JSON.stringify(claims));
  // JWTs need the raw r||s signature, not Node's default DER encoding.
  const signature = sign("sha256", Buffer.from(`${header}.${payload}`), {
    key: createPrivateKey(privateKeyPem),
    dsaEncoding: "ieee-p1363",
  });
  return `${header}.${payload}.${base64url(signature)}`;
}
