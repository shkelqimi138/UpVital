import Foundation
import Combine
import WatchConnectivity
import WidgetKit

// Receives the latest scores the iPhone pushes over WatchConnectivity, persists them to the
// watch's App Group (so the complication can read them), and republishes to the UI. The
// phone sends via updateApplicationContext (latest-state-wins), so we implement
// didReceiveApplicationContext. On watchOS the delegate only requires the activation stub.
final class WatchConnectivityManager: NSObject, ObservableObject, WCSessionDelegate {
  static let shared = WatchConnectivityManager()

  @Published var data: WatchData? = WatchData.load()

  override init() {
    super.init()
    if WCSession.isSupported() {
      WCSession.default.delegate = self
      WCSession.default.activate()
    }
  }

  func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {}

  func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
    guard let json = applicationContext["payload"] as? String else { return }
    WatchData.save(json: json)
    let decoded = WatchData.load()
    DispatchQueue.main.async { self.data = decoded }
    // Refresh the watch-face complications with the new scores.
    WidgetCenter.shared.reloadAllTimelines()
  }
}
