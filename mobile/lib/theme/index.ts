// Theme entry point: assembles the design tokens and exposes the useTheme() hook. UpVital is
// dark-only (owner's decision 2026-10-07): there is no light palette and the app ignores the
// iPhone's appearance (Info.plist UIUserInterfaceStyle = Dark).
import { brand, dark, data } from "./colors";
import { gauge, ring, tabBar } from "./geometry";
import { motion } from "./motion";
import { shadows } from "./shadows";
import { layout, radius, spacing } from "./spacing";
import { tabularNums, typography } from "./typography";

export { isHigherBetter, METRIC_HIGHER_IS_BETTER } from "./polarity";
export { countUpEasing } from "./motion";
export {
  tabularNums,
  typography,
  spacing,
  radius,
  layout,
  brand,
  data,
  shadows,
  motion,
  gauge,
  ring,
  tabBar,
};
export type { ColorTokens } from "./colors";

export function useTheme() {
  const colors = dark;

  return {
    // Legacy field names (kept so existing screens don't need to change) —
    // map onto the new token set.
    backgroundColor: colors.background,
    textColor: colors.textPrimary,
    subtleColor: colors.textSecondary,

    // Full token set for the redesigned screens.
    colors,
    spacing,
    layout,
    radius,
    typography,
    brand,
    data,
    motion,
    gauge,
    ring,
    tabBar,
    shadows,
  };
}
