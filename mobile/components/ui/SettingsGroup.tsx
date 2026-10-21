// iOS-style grouped settings list: a small caps heading over a card of rows separated by inset
// hairlines (the Profile hub, Theme and Units pages).
import { Children, Fragment, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { brand, spacing, typography, useTheme } from "../../lib/theme";
import { Card } from "./Card";
import { Icon, type IconName } from "./Icon";

const ICON_TILE = 30;

export function SettingsGroup({
  title,
  inset = true,
  children,
}: {
  title?: string;
  /** Indent the separators past the row icons (off for icon-less option lists). */
  inset?: boolean;
  children: ReactNode;
}) {
  const { colors, shadows } = useTheme();
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <View style={styles.group}>
      {title && (
        <Text
          style={[typography.micro, styles.heading, { color: colors.textTertiary }]}
          accessibilityRole="header"
        >
          {title.toUpperCase()}
        </Text>
      )}
      <Card style={[styles.card, shadows.card]}>
        {rows.map((row, i) => (
          <Fragment key={i}>
            {i > 0 && (
              <View
                style={[styles.separator, inset && styles.separatorInset, { backgroundColor: colors.border }]}
              />
            )}
            {row}
          </Fragment>
        ))}
      </Card>
    </View>
  );
}

type SettingsRowProps = {
  title: string;
  /** Icon in a tinted tile on the left (the hub rows). */
  icon?: IconName;
  iconColor?: string;
  iconBackground?: string;
  /** Current value, shown on the right before the chevron (e.g. "Dark", "Metric"). */
  value?: string;
  /** Second line under the title (e.g. "Connected"). */
  subtitle?: string;
  /** "chevron" opens a page (default), "check" marks the chosen option in a list, "none" shows nothing. */
  accessory?: "chevron" | "check" | "none";
  /** A control on the right instead of the accessory (e.g. a Switch); the row then isn't pressable. */
  trailing?: ReactNode;
  onPress?: () => void;
  accessibilityHint?: string;
};

export function SettingsRow({
  title,
  icon,
  iconColor,
  iconBackground,
  value,
  subtitle,
  accessory = "chevron",
  trailing,
  onPress,
  accessibilityHint,
}: SettingsRowProps) {
  const { colors, textColor } = useTheme();
  const body = (
    <>
      {icon && (
        <View style={[styles.iconTile, { backgroundColor: iconBackground ?? colors.pill }]}>
          <Icon name={icon} size={17} color={iconColor ?? textColor} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={[typography.bodyLarge, { color: textColor }]}>{title}</Text>
        {subtitle && <Text style={[typography.body, { color: colors.textSecondary }]}>{subtitle}</Text>}
      </View>
      {value && <Text style={[typography.bodyLarge, { color: colors.textSecondary }]}>{value}</Text>}
      {trailing}
      {!trailing && accessory === "chevron" && (
        <Icon name="chevronRight" size={17} color={colors.textTertiary} />
      )}
      {!trailing && accessory === "check" && <Icon name="checkmark" size={20} color={brand.green} />}
    </>
  );

  if (trailing || !onPress) {
    return <View style={styles.row}>{body}</View>;
  }
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
      accessibilityRole="button"
      accessibilityState={accessory === "check" ? { selected: true } : undefined}
      accessibilityLabel={[title, subtitle, value].filter(Boolean).join(", ")}
      accessibilityHint={accessibilityHint}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
  heading: { marginLeft: spacing.lg, letterSpacing: 0.6 },
  card: { paddingVertical: 0, paddingHorizontal: spacing.lg },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 52,
    paddingVertical: spacing.md,
  },
  iconTile: {
    width: ICON_TILE,
    height: ICON_TILE,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  // Inset like iOS: lines start where the text does when the row has an icon.
  separator: { height: StyleSheet.hairlineWidth },
  separatorInset: { marginLeft: ICON_TILE + spacing.md },
});
