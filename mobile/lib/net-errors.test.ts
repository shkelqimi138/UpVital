// Unit tests for the pure error-classification helpers (net-errors.ts).
// Run with `npm test` (mobile) via tsx — no React Native / Expo imports here.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  UserFacingError,
  OFFLINE_MESSAGE,
  TIMEOUT_MESSAGE,
  GENERIC_MESSAGE,
  errorText,
  isOfflineError,
  friendlyMessage,
  relativeTime,
} from "./net-errors";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("errorText", () => {
  it("pulls .message from Error and error-shaped objects", () => {
    assert.equal(errorText(new Error("boom")), "boom");
    assert.equal(errorText({ message: "shaped" }), "shaped");
  });
  it("stringifies anything else", () => {
    assert.equal(errorText("plain"), "plain");
    assert.equal(errorText(42), "42");
    assert.equal(errorText(null), "null");
  });
});

describe("isOfflineError", () => {
  it("is true for the many phrasings of a dead connection", () => {
    for (const m of [
      "Network request failed",
      "Failed to fetch",
      "Load failed",
      "The Internet connection appears to be offline",
      "connection was lost",
      "getaddrinfo ENOTFOUND api.upvital.app",
    ]) {
      assert.equal(isOfflineError(new Error(m)), true, m);
    }
  });
  it("is true for timeouts/aborts", () => {
    assert.equal(isOfflineError(new Error("The operation timed out")), true);
    assert.equal(isOfflineError(new Error("AbortError")), true);
  });
  it("is false for a real server answer", () => {
    assert.equal(isOfflineError(new Error("Bad Request")), false);
    assert.equal(isOfflineError(new Error("Unauthorized")), false);
  });
});

describe("friendlyMessage", () => {
  it("passes a UserFacingError through verbatim", () => {
    assert.equal(friendlyMessage(new UserFacingError("Pick a shorter name.")), "Pick a shorter name.");
  });
  it("maps timeout and offline to their canned copy", () => {
    assert.equal(friendlyMessage(new Error("Request timed out")), TIMEOUT_MESSAGE);
    assert.equal(friendlyMessage(new Error("Network request failed")), OFFLINE_MESSAGE);
  });
  it("falls back to the generic (or a supplied) message otherwise", () => {
    assert.equal(friendlyMessage(new Error("weird 500")), GENERIC_MESSAGE);
    assert.equal(friendlyMessage(new Error("weird 500"), "Custom fallback."), "Custom fallback.");
  });
});

describe("relativeTime", () => {
  const now = 1_000 * DAY; // fixed reference so the test is deterministic
  it("labels sub-minute as 'just now'", () => {
    assert.equal(relativeTime(now - 10_000, now), "just now");
  });
  it("labels minutes with singular/plural", () => {
    assert.equal(relativeTime(now - 1 * MIN, now), "1 min ago");
    assert.equal(relativeTime(now - 5 * MIN, now), "5 min ago");
  });
  it("labels hours with singular/plural", () => {
    assert.equal(relativeTime(now - 1 * HOUR, now), "1 hour ago");
    assert.equal(relativeTime(now - 2 * HOUR, now), "2 hours ago");
  });
  it("labels days, with 'yesterday' for one", () => {
    assert.equal(relativeTime(now - 1 * DAY, now), "yesterday");
    assert.equal(relativeTime(now - 3 * DAY, now), "3 days ago");
  });
  it("never goes negative if the clock skews", () => {
    assert.equal(relativeTime(now + 5 * MIN, now), "just now");
  });
});
