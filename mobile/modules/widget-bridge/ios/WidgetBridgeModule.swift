import ExpoModulesCore
import WatchConnectivity
import WidgetKit

// Bridges the JS app to its two native companion surfaces:
//   1. The Home Screen widget — via a shared App Group the widget reads (setWidgetData).
//   2. The Apple Watch app — via WatchConnectivity (sendToWatch). App Groups do NOT span
//      devices, so the watch can't read the phone's container; instead we push the latest
//      scores to the watch, which stores its own copy for its UI + complications.
// Everything is best-effort and never throws into JS.

// WCSession needs a persistent delegate. This singleton keeps the session alive and
// re-activates it if the paired watch changes (required delegate stubs on iOS).
final class WatchSessionDelegate: NSObject, WCSessionDelegate {
  static let shared = WatchSessionDelegate()
  func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {}
  func sessionDidBecomeInactive(_ session: WCSession) {}
  func sessionDidDeactivate(_ session: WCSession) { WCSession.default.activate() }
}

public class WidgetBridgeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("WidgetBridge")

    // Activate the WatchConnectivity session once, when the module loads.
    OnCreate {
      if WCSession.isSupported() {
        WCSession.default.delegate = WatchSessionDelegate.shared
        WCSession.default.activate()
      }
    }

    Function("setWidgetData") { (appGroup: String, key: String, json: String) -> Void in
      guard let defaults = UserDefaults(suiteName: appGroup) else { return }
      defaults.set(json, forKey: key)
    }

    Function("reloadWidgets") { () -> Void in
      WidgetCenter.shared.reloadAllTimelines()
    }

    // Push the latest scores to the paired Apple Watch. updateApplicationContext keeps only
    // the newest state and delivers it opportunistically, which is exactly right for a
    // once-a-day score. A call before the session finishes activating is simply dropped;
    // the next update (every sync / Home load) lands.
    Function("sendToWatch") { (json: String) -> Void in
      guard WCSession.isSupported(), WCSession.default.activationState == .activated else { return }
      try? WCSession.default.updateApplicationContext(["payload": json])
    }
  }
}
