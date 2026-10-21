// Unit tests for the shared request-validation helpers (validate.ts).
// Run with `npm test` (backend) — pure functions, no DB, no network.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canonicalEmail, isApnsDeviceToken, isYmd, jwtSessionId } from "./validate";

describe("isYmd", () => {
  it("accepts a real calendar day in YYYY-MM-DD form", () => {
    assert.equal(isYmd("2026-09-10"), true);
    assert.equal(isYmd("2000-01-01"), true);
    assert.equal(isYmd("2024-02-29"), true); // leap day
  });

  it("rejects the wrong shape", () => {
    assert.equal(isYmd("2026-9-10"), false); // needs zero-padding
    assert.equal(isYmd("2026/09/10"), false); // wrong separator
    assert.equal(isYmd("09-10-2026"), false); // wrong order
    assert.equal(isYmd("2026-09-10T00:00:00Z"), false); // full timestamp, not a day
    assert.equal(isYmd(""), false);
  });

  it("rejects an out-of-range month", () => {
    assert.equal(isYmd("2026-13-01"), false); // month 13 → Date.parse is NaN
    assert.equal(isYmd("2026-00-01"), false);
  });

  it("does NOT catch a rolled-over day — that's Postgres ::date's job", () => {
    // Characterization: V8 rolls "2026-02-30" over to Mar 2, so Date.parse succeeds and
    // isYmd returns true. isYmd only promises shape + parseability (a clean 400 instead of a
    // 500); the column cast is the semantic backstop. Documented so the behavior is intentional.
    assert.equal(isYmd("2026-02-30"), true);
  });

  it("rejects non-strings", () => {
    assert.equal(isYmd(20260910 as unknown), false);
    assert.equal(isYmd(null), false);
    assert.equal(isYmd(undefined), false);
    assert.equal(isYmd({} as unknown), false);
  });
});

describe("canonicalEmail", () => {
  it("folds case, Gmail dots and +tags so the same inbox compares equal", () => {
    assert.equal(canonicalEmail(" Jane.Doe+test@Gmail.com "), "janedoe@gmail.com");
    assert.equal(canonicalEmail("jane.doe+news@outlook.com"), "jane.doe@outlook.com");
    assert.equal(canonicalEmail("Jane.Doe@example.com"), "jane.doe@example.com");
  });
});

describe("isApnsDeviceToken", () => {
  it("accepts lowercase hex device tokens and rejects anything else", () => {
    assert.equal(isApnsDeviceToken("a".repeat(64)), true);
    assert.equal(isApnsDeviceToken("0123456789abcdef".repeat(5)), true);
    assert.equal(isApnsDeviceToken("A".repeat(64)), false); // stored lowercase
    assert.equal(isApnsDeviceToken("a".repeat(63)), false);
    assert.equal(isApnsDeviceToken("ExponentPushToken[abc123]"), false); // the old push service's format
    assert.equal(isApnsDeviceToken("a".repeat(64) + "/x"), false); // never reaches the APNs path
    assert.equal(isApnsDeviceToken(null), false);
  });
});

describe("jwtSessionId", () => {
  const jwt = (claims: unknown) =>
    `${Buffer.from('{"alg":"ES256"}').toString("base64url")}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;

  it("reads the session_id claim", () => {
    const id = "6f1c2b8e-3d4a-4e5f-8a9b-0c1d2e3f4a5b";
    assert.equal(jwtSessionId(jwt({ sub: "u", session_id: id })), id);
  });

  it("returns null when it's missing, not a UUID, or the token is malformed", () => {
    assert.equal(jwtSessionId(jwt({ sub: "u" })), null);
    assert.equal(jwtSessionId(jwt({ session_id: "nope" })), null);
    assert.equal(jwtSessionId("not-a-jwt"), null);
    assert.equal(jwtSessionId("a.%%%.c"), null);
  });
});
