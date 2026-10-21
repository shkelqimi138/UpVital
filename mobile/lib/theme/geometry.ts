// Fixed component geometry from the design handoff. These are shared by the SVG
// components (gauge arc, score rings) and the tab bar, so they live as tokens rather
// than as magic numbers inside each component.

/** Activity screen's 270° strain gauge. */
export const gauge = {
  cx: 130,
  cy: 108,
  r: 88,
  startAngle: 135,
  sweep: 270,
  strokeWidth: 16,
  /** Strain runs 0-21, with an "optimal" band highlighted on the track. */
  max: 21,
  optimal: [12.5, 15] as const,
} as const;

/** Score rings. `size`/`radius`/`strokeWidth` are the 3-up dashboard rings; the `hero*`
 *  variants are the larger ring inside the Recovery hero card. Both sweep from -90°. */
export const ring = {
  size: 66,
  radius: 27,
  strokeWidth: 7,
  heroSize: 104,
  heroRadius: 44,
  heroStroke: 10,
  startAngle: -90,
} as const;

export const tabBar = {
  height: 78,
  iconSize: 22,
  strokeWidth: 1.8,
} as const;
