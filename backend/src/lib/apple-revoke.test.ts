// Unit tests for apple-revoke.ts: the client-secret JWT Apple checks. Run with `npm test` (backend).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import { clientSecret } from "./apple-revoke";

describe("clientSecret", () => {
  it("is an ES256 JWT for Apple, signed so the matching public key verifies it", () => {
    // A throwaway P-256 key, the same kind as Apple's .p8 keys.
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

    const jwt = clientSecret("TEAM123456", "KEY1234567", pem);
    const [header, payload, signature] = jwt.split(".");

    assert.deepEqual(JSON.parse(Buffer.from(header, "base64url").toString()), {
      alg: "ES256",
      kid: "KEY1234567",
    });
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
    assert.equal(claims.iss, "TEAM123456");
    assert.equal(claims.aud, "https://appleid.apple.com");
    assert.equal(claims.sub, "com.upvital.app");
    assert.ok(claims.exp > claims.iat && claims.exp - claims.iat <= 15_777_000); // Apple's 6-month cap

    const raw = Buffer.from(signature, "base64url");
    assert.equal(raw.length, 64); // raw r||s, not DER
    assert.ok(
      verify(
        "sha256",
        Buffer.from(`${header}.${payload}`),
        { key: publicKey, dsaEncoding: "ieee-p1363" },
        raw,
      ),
    );
  });
});
