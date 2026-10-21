import { useRouter } from "expo-router";
import { useRef } from "react";
import { Animated, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../lib/theme";
import { Icon } from "./Icon";
import { OfflineBanner } from "./OfflineBanner";

type BottomSheetScreenProps = {
  title: string;
  leadingIcon?: React.ReactNode;
  children: React.ReactNode;
};

// Half-height sheet rendered over a `presentation: "transparentModal"` route.
// Deliberately plain React Native (no @gorhom/bottom-sheet): gorhom v5 + reanimated 4
// on the New Architecture wasn't honoring the snap point OR dismissing on this setup.
// Here dismissal is guaranteed — backdrop tap, chevron, and swipe-down all call
// router.back(), the same navigation the rest of the app relies on.
export function BottomSheetScreen({ title, leadingIcon, children }: BottomSheetScreenProps) {
  const { colors, radius, spacing } = useTheme();
  const router = useRouter();
  const close = () => router.back();

  // Swipe-down-to-close on the grab area (handle + header), so it never fights the
  // scroll view below it. Uses core Animated/PanResponder — no reanimated dependency.
  const translateY = useRef(new Animated.Value(0)).current;
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 110) {
          router.back();
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
        }
      },
    }),
  ).current;

  return (
    <View style={styles.root}>
      {/* Tap-to-dismiss backdrop — hidden from screen readers; the chevron is the labelled close. */}
      <Pressable style={styles.backdrop} onPress={close} accessible={false} importantForAccessibility="no" />
      <Animated.View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.card,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            transform: [{ translateY }],
          },
        ]}
      >
        <View {...pan.panHandlers}>
          <View style={[styles.handle, { backgroundColor: colors.pill }]} />
          <View style={[styles.header, { paddingHorizontal: spacing.lg }]}>
            <View style={styles.headerLeft}>
              {leadingIcon}
              <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
            </View>
            <Pressable onPress={close} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
              <Icon name="chevronDown" color={colors.textSecondary} />
            </Pressable>
          </View>
        </View>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, { paddingHorizontal: spacing.lg }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Every detail sheet reads cached data when the network is down, so the
              "these numbers are old" label belongs here rather than in each screen. */}
          <OfflineBanner />
          {children}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sheet: { height: "50%", paddingTop: 8, paddingBottom: 8 },
  handle: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, marginBottom: 10 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 17, fontWeight: "600" },
  scroll: { flex: 1 },
  content: { gap: 16, paddingBottom: 24 },
});
