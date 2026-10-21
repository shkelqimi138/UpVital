// Unit tests for the daily-insight timing and push-text helpers (delivery.ts).
// Run with `npm test` (backend) — pure functions, no DB, no network.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_WAIT_HOURS,
  hoursIntoInsightWindow,
  insightDate,
  localDate,
  localHour,
  pushBody,
} from "./delivery";

describe("hoursIntoInsightWindow", () => {
  it("opens at the chosen hour and stays open while waiting for sleep", () => {
    assert.equal(hoursIntoInsightWindow(7, 7), 0);
    assert.equal(hoursIntoInsightWindow(7, 7 + MAX_WAIT_HOURS), MAX_WAIT_HOURS);
  });

  it("is closed before the chosen hour and after the wait", () => {
    assert.equal(hoursIntoInsightWindow(7, 6), null);
    assert.equal(hoursIntoInsightWindow(7, 8 + MAX_WAIT_HOURS), null);
    assert.equal(hoursIntoInsightWindow(0, 23), null);
  });

  it("runs past midnight for a late hour", () => {
    assert.equal(hoursIntoInsightWindow(22, 1), 3);
    assert.equal(hoursIntoInsightWindow(23, 0), 1);
    assert.equal(hoursIntoInsightWindow(22, 2), null);
  });
});

describe("insightDate", () => {
  const tz = "Europe/Belgrade";

  it("is the local day, not the UTC one", () => {
    const now = new Date("2026-10-18T22:30:00Z"); // 00:30 on Oct 19 in Belgrade
    assert.equal(localDate(tz, now), "2026-10-19");
    assert.equal(localHour(tz, now), 0);
    assert.equal(insightDate(tz, now, 0), "2026-10-19");
  });

  it("keeps a window that opened at 22:00 on its own day after midnight", () => {
    const now = new Date("2026-10-18T22:30:00Z"); // 00:30 Oct 19 local, 2 hours into a 22:00 window
    assert.equal(insightDate(tz, now, 2), "2026-10-18");
  });
});

describe("pushBody", () => {
  const INSIGHT =
    "Your stress level was 53 yesterday, in the moderate range. Sleep came in at 7.2 hours with a score of 81. " +
    "Recovery is 64 this morning, slightly below your 7-day average, so keep today's training moderate.";

  it("sends the first whole sentences that fit, not the whole insight", () => {
    assert.equal(
      pushBody(INSIGHT),
      "Your stress level was 53 yesterday, in the moderate range. Sleep came in at 7.2 hours with a score of 81.",
    );
  });

  it("keeps a decimal number inside its sentence", () => {
    assert.equal(pushBody("Sleep was 7.2 hours. Recovery is 64.", 25), "Sleep was 7.2 hours.");
  });

  it("sends a short insight whole", () => {
    assert.equal(pushBody("  Recovery is 64.  "), "Recovery is 64.");
  });

  it("shortens an over-long first sentence at a word, with an ellipsis", () => {
    const body = pushBody(`${"word ".repeat(80)}end.`, 100);
    assert.ok(body.length <= 100);
    assert.ok(body.endsWith("word…"));
  });
});
