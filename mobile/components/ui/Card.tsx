// Reusable themed Card container component (background, radius, padding)
import { View, ViewProps } from "react-native";
import { useTheme } from "../../lib/theme";

type CardProps = ViewProps & { inset?: boolean };

export function Card({ inset = false, style, children, ...rest }: CardProps) {
  const { colors, radius, spacing } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: inset ? colors.cardInset : colors.card,
          borderRadius: inset ? radius.lg : radius.xl,
          padding: spacing.lg,
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}
