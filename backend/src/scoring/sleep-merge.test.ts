// Unit tests for mergeNight (sleep-merge.ts): overlapping sleep records count once.
// Run with `npm test` (backend) — pure functions, no DB, no network.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mergeNight, type SleepRecord } from "./sleep-merge";

const T0 = Date.UTC(2026, 9, 17, 0, 0); // 2026-10-17 00:00 UTC
const at = (minute: number) => T0 + minute * 60_000;
const rec = (stage: string, from: number, to: number): SleepRecord => ({
  stage,
  start: at(from),
  end: at(to),
});

// One night as Fitbit writes it: a whole in-bed interval, then the stages separately.
const NIGHT: SleepRecord[] = [
  rec("INBED", 0, 480),
  rec("CORE", 0, 120),
  rec("DEEP", 120, 200),
  rec("AWAKE", 200, 210),
  rec("REM", 210, 300),
  rec("CORE", 300, 480),
];

describe("mergeNight", () => {
  it("adds up a single clean night", () => {
    const t = mergeNight(NIGHT);
    assert.equal(t.inBedMinutes, 480);
    assert.equal(t.asleepMinutes, 470);
    assert.equal(t.deepMinutes, 80);
    assert.equal(t.remMinutes, 90);
    assert.equal(t.coreMinutes, 300);
    assert.equal(t.deepPlusRemMinutes, 170);
    assert.equal(t.awakeMinutes, 10);
  });

  it("counts a night stored twice only once", () => {
    // The real case: the same Fitbit night stored twice (rewritten with new IDs).
    assert.deepEqual(mergeNight([...NIGHT, ...NIGHT]), mergeNight(NIGHT));
  });

  it("unions partly overlapping in-bed records", () => {
    const t = mergeNight([rec("INBED", 0, 300), rec("INBED", 200, 480)]);
    assert.equal(t.inBedMinutes, 480);
  });

  it("prefers a real stage over plain 'asleep', and asleep over awake", () => {
    const t = mergeNight([rec("ASLEEP", 0, 100), rec("DEEP", 20, 40), rec("AWAKE", 90, 120)]);
    assert.equal(t.deepMinutes, 20);
    assert.equal(t.coreMinutes, 80); // the rest of the plain "asleep" stretch
    assert.equal(t.awakeMinutes, 20); // only the part no sleep record covers
    assert.equal(t.asleepMinutes, 100);
  });

  it("lets core win when two staging apps disagree", () => {
    const t = mergeNight([rec("DEEP", 0, 60), rec("CORE", 0, 60)]);
    assert.equal(t.coreMinutes, 60);
    assert.equal(t.deepMinutes, 0);
  });

  it("ignores empty, backwards and unknown records", () => {
    const t = mergeNight([rec("CORE", 10, 10), rec("REM", 50, 40), rec("7", 0, 60)]);
    assert.equal(t.asleepMinutes, 0);
    assert.equal(t.inBedMinutes, 0);
  });
});
