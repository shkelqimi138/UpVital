// Unit tests for coordinate rounding (geo.ts).
// Run with `npm test` (mobile) via tsx — no React Native / Expo imports here.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { roundCoordinate } from "./geo";

describe("roundCoordinate", () => {
  it("rounds to 2 decimals (~1 km) by default", () => {
    assert.equal(roundCoordinate(52.520008), 52.52);
    assert.equal(roundCoordinate(13.404954), 13.4);
    assert.equal(roundCoordinate(42.666667), 42.67);
  });

  it("handles negative coordinates (south / west)", () => {
    assert.equal(roundCoordinate(-33.86882), -33.87);
    assert.equal(roundCoordinate(-122.419416), -122.42);
  });

  it("prints cleanly in a URL (no float noise)", () => {
    assert.equal(`${roundCoordinate(41.299999)}`, "41.3");
    assert.equal(`${roundCoordinate(0.001)}`, "0");
  });

  it("honours a custom precision", () => {
    assert.equal(roundCoordinate(52.520008, 1), 52.5);
  });
});
