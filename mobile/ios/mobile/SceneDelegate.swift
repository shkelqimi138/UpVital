internal import Expo

// Scene-based life cycle (required by the iOS 27 SDK — without it the app asserts at launch).
// ExpoAppSceneDelegate creates the window, starts React Native into it, and forwards scene,
// deep-link and Universal Link events to AppDelegate and the Expo subscribers.
@objc(SceneDelegate)
class SceneDelegate: ExpoAppSceneDelegate {
  // Extension point for config plugins.
}
