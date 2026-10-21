// Unit tests for the announcement decision logic (announcer.ts).
// Run with `npm test` (mobile) via tsx — no React Native / Expo imports here.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createAnnouncer } from "./announcer";

// An announcer with a fake clock that records what would be spoken.
function setup() {
  const spoken: string[] = [];
  let time = 0;
  const announce = createAnnouncer(
    (m) => spoken.push(m),
    () => time,
    1500,
  );
  return { spoken, announce, at: (t: number) => (time = t) };
}

describe("createAnnouncer", () => {
  it("speaks a message", () => {
    const { spoken, announce } = setup();
    assert.equal(announce("Enter your email address."), true);
    assert.deepEqual(spoken, ["Enter your email address."]);
  });

  it("speaks nothing for null or empty", () => {
    const { spoken, announce } = setup();
    assert.equal(announce(null), false);
    assert.equal(announce(""), false);
    assert.deepEqual(spoken, []);
  });

  it("drops the same message repeated inside the window (blur + submit)", () => {
    const { spoken, announce, at } = setup();
    announce("Enter your email address.");
    at(400);
    assert.equal(announce("Enter your email address."), false);
    assert.equal(spoken.length, 1);
  });

  it("speaks the same message again once the window has passed (deliberate retry)", () => {
    const { spoken, announce, at } = setup();
    announce("Enter your email address.");
    at(1500);
    assert.equal(announce("Enter your email address."), true);
    assert.equal(spoken.length, 2);
  });

  it("measures the window from the last spoken message, not a dropped one", () => {
    const { announce, at } = setup();
    announce("Enter your email address.");
    at(1000);
    announce("Enter your email address."); // dropped
    at(1600);
    assert.equal(announce("Enter your email address."), true);
  });

  it("always speaks a different message", () => {
    const { spoken, announce, at } = setup();
    announce("Enter your email address.");
    at(100);
    announce("Enter your password.");
    at(200);
    announce("Enter your email address.");
    assert.equal(spoken.length, 3);
  });

  it("stays silent for a screen that isn't on display (late save on another tab)", () => {
    const { spoken, announce } = setup();
    assert.equal(announce("Password updated.", false), false);
    assert.deepEqual(spoken, []);
  });

  it("doesn't let a skipped inactive message block the same message on display", () => {
    const { spoken, announce, at } = setup();
    announce("Couldn't load recovery details", false);
    at(100);
    assert.equal(announce("Couldn't load recovery details", true), true);
    assert.deepEqual(spoken, ["Couldn't load recovery details"]);
  });
});
