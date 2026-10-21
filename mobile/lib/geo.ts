// Rounds a latitude/longitude to `decimals` places — 2 places is ~1 km. Used so only an
// approximate location ever leaves the device (see api/air-quality.ts). Pure, so it's unit-tested.
export function roundCoordinate(degrees: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(degrees * factor) / factor;
}
