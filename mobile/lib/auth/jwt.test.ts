// Unit tests for jwt.ts. Run with `npm test` (mobile).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { jwtSessionId } from "./jwt";

const token = (claims: object) =>
  `${Buffer.from('{"alg":"HS256"}').toString("base64url")}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;

describe("jwtSessionId", () => {
  it("reads the session_id claim", () => {
    const id = "6f1c2a9e-4b7d-4e2a-9c31-0d5e8f7a1b2c";
    assert.equal(jwtSessionId(token({ sub: "user", session_id: id })), id);
  });

  it("handles payloads that need base64 padding and URL-safe characters", () => {
    // Claim values chosen so the encoded payload contains '-' / '_' and isn't a multiple of 4.
    for (const extra of ["", "a", "ab", "~~~???>>>", "ü"]) {
      assert.equal(jwtSessionId(token({ x: extra, session_id: "s1" })), "s1");
    }
  });

  it("returns null without the claim or for something that isn't a JWT", () => {
    assert.equal(jwtSessionId(token({ sub: "user" })), null);
    assert.equal(jwtSessionId(token({ session_id: 42 })), null);
    assert.equal(jwtSessionId("not-a-jwt"), null);
    assert.equal(jwtSessionId("a.%%%.c"), null);
    assert.equal(jwtSessionId(""), null);
  });
});
