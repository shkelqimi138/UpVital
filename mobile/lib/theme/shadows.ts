import type { ViewStyle } from "react-native";

// iOS shadow tokens from the design handoff. Values are the react-native translation of
// the handoff's CSS box-shadows.
//
// UpVital is dark-only, so `card` is the handoff's tight near-black shadow.
export const shadows = {
  card: {
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  } satisfies ViewStyle,
  /** Daily Score hero (brand-green gradient card). */
  greenHero: {
    shadowColor: "#0D6E3C",
    shadowOpacity: 0.55,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
  } satisfies ViewStyle,
  /** Sleep hero (indigo night gradient). */
  sleepHero: {
    shadowColor: "#141646",
    shadowOpacity: 0.6,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 14 },
  } satisfies ViewStyle,
  /** Activity strain gauge (dark glass card). */
  glass: {
    shadowColor: "#062014",
    shadowOpacity: 0.6,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 16 },
  } satisfies ViewStyle,
  /** Bottom sheet — casts upward, hence the negative height. */
  sheet: {
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: -12 },
  } satisfies ViewStyle,
  /** Primary green CTA. */
  button: {
    shadowColor: "#16A34A",
    shadowOpacity: 0.5,
    shadowRadius: 13,
    shadowOffset: { width: 0, height: 8 },
  } satisfies ViewStyle,
} as const;
