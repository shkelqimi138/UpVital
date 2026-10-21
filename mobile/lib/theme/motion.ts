// Animation tokens from the design handoff. Durations in ms; easings are cubic-bezier
// control points, ready to hand to reanimated's `Easing.bezier(...)`.
export const motion = {
  /** Screen/card entrance: fade + 8-10px rise. */
  entrance: { duration: 450, rise: 10 },
  /** Numeric count-up. Handoff easing is `1 - (1 - t) ** 3` (cubic ease-out). */
  countUp: { duration: 1100 },
  /** Rings, bars and the strain gauge growing in, with a per-item stagger. */
  chart: { duration: 1100, easing: [0.22, 1, 0.36, 1] as const, stagger: 80 },
  /** Detail sheet slide (108% -> 0). */
  sheet: { duration: 420, easing: [0.22, 1, 0.36, 1] as const },
  /** Scale applied while a card/button is pressed. */
  pressScale: 0.98,
  /** "LIVE" dot pulse on the Daily Score hero. */
  livePulse: { duration: 2400 },
} as const;

/** Cubic ease-out used by every count-up: `1 - (1 - t)^3`. */
export function countUpEasing(t: number): number {
  return 1 - (1 - t) ** 3;
}
