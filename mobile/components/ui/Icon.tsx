import { Ionicons } from "@expo/vector-icons";
import type { ColorValue } from "react-native";
import { useTheme } from "../../lib/theme";

// Semantic name -> Ionicons glyph, so screens reference meaning ("flame") not a vendor's
// icon name. "clover" is a placeholder for Upvital's own brand mark until a real logo asset
// exists.
const ICON_MAP = {
  flame: "flame",
  heart: "heart",
  heartPulse: "pulse",
  leaf: "leaf-outline",
  moon: "moon-outline",
  footprints: "footsteps-outline",
  battery: "battery-charging-outline",
  wind: "cloudy-outline",
  clover: "flower-outline",
  calendar: "calendar-outline",
  percent: "pie-chart-outline",
  coffee: "cafe",
  info: "information-circle-outline",
  home: "home-outline",
  bulb: "bulb-outline",
  chart: "stats-chart-outline",
  chevronRight: "chevron-forward",
  chevronDown: "chevron-down",
  chevronLeft: "chevron-back",
  close: "close",
  eye: "eye-outline",
  eyeOff: "eye-off-outline",
  share: "share-outline",
  settings: "settings-outline",
  dumbbell: "barbell-outline",
  // Tab-bar glyphs for the redesigned Health / Coach / Profile tabs, plus the metric
  // icons the design handoff's Health Overview grid needs.
  health: "body-outline",
  coach: "chatbubble-outline",
  profile: "person-outline",
  activity: "barbell-outline",
  droplet: "water-outline",
  thermometer: "thermometer-outline",
  lungs: "fitness-outline",
  sparkle: "sparkles",
  // Profile settings list.
  lock: "lock-closed-outline",
  mail: "mail-outline",
  shield: "shield-checkmark-outline",
  bell: "notifications-outline",
  time: "time-outline",
  checkmark: "checkmark",
  units: "speedometer-outline",
  person: "person-outline",
  flag: "flag-outline",
} as const satisfies Record<string, keyof typeof Ionicons.glyphMap>;

export type IconName = keyof typeof ICON_MAP;

// color is ColorValue (not just string) so callers like Tabs' tabBarIcon, which hand back
// a platform ColorValue, can pass it straight through.
type IconProps = { name: IconName; size?: number; color?: ColorValue };

export function Icon({ name, size = 20, color }: IconProps) {
  const { textColor } = useTheme();
  return <Ionicons name={ICON_MAP[name]} size={size} color={color ?? textColor} />;
}
