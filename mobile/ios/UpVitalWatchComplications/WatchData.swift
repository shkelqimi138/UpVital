import Foundation
import SwiftUI

// Scores the watch app receives from the iPhone (via WatchConnectivity) and persists in a
// watch-side App Group so the complication (a separate process) can read the same copy.
// Mirrors WidgetPayload in mobile/lib/widget.ts. Shared by the watch app + complication.
struct WatchData: Codable {
  let date: String
  let daily: Double?
  let recovery: Double?
  let sleep: Double?
  let stress: Double?
  let biologicalAge: Double?
  let streak: Double?
  let updatedAt: String?

  // The App Group is shared between the watch app and its complication (same device);
  // it is NOT the phone's container — the phone pushes data over WatchConnectivity.
  static let appGroup = "group.com.upvital.app"
  static let storageKey = "widgetData"

  static func load() -> WatchData? {
    guard let d = UserDefaults(suiteName: appGroup),
          let json = d.string(forKey: storageKey),
          let raw = json.data(using: .utf8) else { return nil }
    return try? JSONDecoder().decode(WatchData.self, from: raw)
  }

  static func save(json: String) {
    UserDefaults(suiteName: appGroup)?.set(json, forKey: storageKey)
  }

  // Match the app's UTC notion of "today" (see WidgetData.todayString on the phone side).
  static var todayString: String {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.timeZone = TimeZone(identifier: "UTC")
    f.dateFormat = "yyyy-MM-dd"
    return f.string(from: Date())
  }
  var isToday: Bool { date == WatchData.todayString }

  static let preview = WatchData(
    date: WatchData.todayString,
    daily: 82, recovery: 78, sleep: 85, stress: 74,
    biologicalAge: 29, streak: 5, updatedAt: nil
  )
}

func dailyBand(_ s: Double) -> String {
  if s >= 85 { return "Optimal" }
  if s >= 70 { return "Strong" }
  if s >= 40 { return "Steady" }
  return "Low"
}

extension Color {
  static let uvGreen  = Color(red: 22.0 / 255.0, green: 163.0 / 255.0, blue: 74.0 / 255.0)  // #16A34A
  static let uvIndigo = Color(red: 91.0 / 255.0, green: 91.0 / 255.0, blue: 214.0 / 255.0)  // #5B5BD6
  static let uvAmber  = Color(red: 224.0 / 255.0, green: 160.0 / 255.0, blue: 47.0 / 255.0) // #E0A02F
}
