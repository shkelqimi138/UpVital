import { requireNativeModule } from "expo-modules-core";
import { Platform } from "react-native";

// Thin typed wrapper over the native WidgetBridge module (ios/WidgetBridgeModule.swift).
// requireNativeModule throws if the native side isn't linked yet (Android, or iOS before
// `pod install` has picked the module up), so we resolve it defensively and degrade to a
// no-op. Callers should use lib/widget.ts rather than importing this directly.
type WidgetBridgeNative = {
  setWidgetData(appGroup: string, key: string, json: string): void;
  reloadWidgets(): void;
  sendToWatch(json: string): void;
};

let native: WidgetBridgeNative | null = null;
if (Platform.OS === "ios") {
  try {
    native = requireNativeModule("WidgetBridge") as WidgetBridgeNative;
  } catch {
    native = null;
  }
}

export function setWidgetData(appGroup: string, key: string, json: string): void {
  native?.setWidgetData(appGroup, key, json);
}

export function reloadWidgets(): void {
  native?.reloadWidgets();
}

export function sendToWatch(json: string): void {
  native?.sendToWatch(json);
}
