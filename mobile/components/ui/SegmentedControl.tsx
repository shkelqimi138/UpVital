import { Pressable, Text, View } from "react-native";
import { useTheme } from "../../lib/theme";

type SegmentedControlProps<T extends string> = {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
};

// Pill tabs (e.g. the Recovery trend's "7 days"/"14 days" toggle).
export function SegmentedControl<T extends string>({ options, value, onChange }: SegmentedControlProps<T>) {
  const { colors, radius, spacing } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        padding: 3,
        backgroundColor: colors.pill,
        borderRadius: radius.full,
        alignSelf: "flex-start",
      }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={{
              borderRadius: radius.full,
              paddingHorizontal: spacing.md,
              paddingVertical: 6,
              backgroundColor: active ? colors.border : "transparent",
            }}
          >
            <Text
              style={{
                color: active ? colors.textPrimary : colors.textSecondary,
                fontWeight: "600",
                fontSize: 13,
              }}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
