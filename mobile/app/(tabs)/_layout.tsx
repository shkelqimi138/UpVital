// Expo Router bottom-tab layout defining the app's main tabs
import { Tabs } from "expo-router";
import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import { Icon } from "../../components/ui/Icon";
import { registerHealthBackgroundTask } from "../../lib/health/background-task";
import {
  enableHealthBackgroundDelivery,
  isConnected,
  startHealthChangeObserver,
  syncNow,
} from "../../lib/health/sync";
import { syncDeviceTimezone } from "../../lib/api/profile";
import { registerForPushNotifications } from "../../lib/push";
import { brand, spacing, tabBar, typography, useTheme } from "../../lib/theme";

export default function TabsLayout() {
  const appState = useRef(AppState.currentState);
  const { colors } = useTheme();

  useEffect(() => {
    syncDeviceTimezone().catch(() => {});
    registerForPushNotifications().catch(() => {});
  }, []);

  useEffect(() => {
    if (Platform.OS !== "ios") return;

    syncNow().catch(() => {});
    let stopObserver: (() => void) | undefined;
    isConnected().then((connected) => {
      if (!connected) return;
      registerHealthBackgroundTask().catch(() => {});
      // Push-based delivery: wake on new data (near-instant) instead of only the periodic task,
      // plus a foreground observer so data that lands while the app is open syncs right away.
      enableHealthBackgroundDelivery().catch(() => {});
      stopObserver = startHealthChangeObserver();
    });

    const subscription = AppState.addEventListener("change", (nextState) => {
      if (appState.current !== "active" && nextState === "active") {
        syncNow().catch(() => {});
      }
      appState.current = nextState;
    });

    return () => {
      subscription.remove();
      stopObserver?.();
    };
  }, []);

  // Tabs are the design handoff's five (Home / Health / Activity / Coach / Profile) in its
  // order. The routes behind them are still the existing screens — `trends` renders under
  // "Health", `workouts` under "Activity", `insight` under "Coach" — so navigation is
  // correct from the start and each screen gets rebuilt in place rather than moved twice.
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: brand.green,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarLabelStyle: typography.tabLabel,
        tabBarStyle: {
          height: tabBar.height,
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          paddingTop: spacing.sm,
        },
        // Every screen in the handoff renders its own large title, so the stack header
        // would show the name twice.
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => <Icon name="home" size={tabBar.iconSize} color={color} />,
        }}
      />
      <Tabs.Screen
        name="health"
        options={{
          title: "Health",
          tabBarIcon: ({ color }) => <Icon name="health" size={tabBar.iconSize} color={color} />,
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: "Activity",
          tabBarIcon: ({ color }) => <Icon name="chart" size={tabBar.iconSize} color={color} />,
        }}
      />
      <Tabs.Screen
        name="insight"
        options={{
          title: "Coach",
          tabBarIcon: ({ color }) => <Icon name="coach" size={tabBar.iconSize} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) => <Icon name="profile" size={tabBar.iconSize} color={color} />,
        }}
      />
    </Tabs>
  );
}
