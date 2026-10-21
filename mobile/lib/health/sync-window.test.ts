// Unit tests for syncWindowStart (sync-window.ts).
// Run with `npm test` (mobile) — pure functions, no device.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { LATE_DATA_WINDOW_DAYS, syncWindowStart } from "./sync-window";

const NOW = new Date("2026-10-19T12:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

describe("syncWindowStart", () => {
  it("reads the late-data window on the first sync", () => {
    assert.deepEqual(syncWindowStart(null, NOW), daysAgo(LATE_DATA_WINDOW_DAYS));
  });

  it("still reads the whole late-data window after a recent sync", () => {
    // Late records (e.g. last night's Fitbit sleep) are dated before the last sync.
    assert.deepEqual(syncWindowStart(daysAgo(0.1), NOW), daysAgo(LATE_DATA_WINDOW_DAYS));
  });

  it("reaches back to the last sync after a longer gap", () => {
    assert.deepEqual(syncWindowStart(daysAgo(45), NOW), daysAgo(45));
  });
});
