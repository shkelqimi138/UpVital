import Foundation

// Mirror of the JSON the app writes into the shared App Group (see mobile/lib/widget.ts —
// WidgetPayload). Scores arrive as numbers-or-null; decoded as Double? and rounded for
// display. Keep these field names in sync with WidgetPayload on the JS side.
struct WidgetData: Codable {
  let date: String
  let daily: Double?
  let recovery: Double?
  let sleep: Double?
  let stress: Double?
  let biologicalAge: Double?
  let streak: Double?
  let updatedAt: String?

  static let appGroup = "group.com.upvital.app"
  static let storageKey = "widgetData"

  /// Read the latest payload the app stored. Returns nil if nothing's been written yet
  /// (App Group missing, first launch before a sync, etc.).
  static func load() -> WidgetData? {
    guard let defaults = UserDefaults(suiteName: appGroup),
          let json = defaults.string(forKey: storageKey),
          let raw = json.data(using: .utf8) else { return nil }
    return try? JSONDecoder().decode(WidgetData.self, from: raw)
  }

  /// The app's notion of "today" is UTC (JS `new Date().toISOString().slice(0,10)`), so we
  /// compare against the UTC calendar day to decide whether the stored scores are current.
  static var todayString: String {
    let fmt = DateFormatter()
    fmt.locale = Locale(identifier: "en_US_POSIX")
    fmt.timeZone = TimeZone(identifier: "UTC")
    fmt.dateFormat = "yyyy-MM-dd"
    return fmt.string(from: Date())
  }

  var isToday: Bool { date == WidgetData.todayString }

  /// Sample data for the widget gallery / placeholder (always "today" so it never shows the
  /// sync-prompt state in the picker).
  static let preview = WidgetData(
    date: WidgetData.todayString,
    daily: 82, recovery: 78, sleep: 85, stress: 74,
    biologicalAge: 29, streak: 5, updatedAt: nil
  )
}

// Daily-score band wording — mirrors dailyBand() in app/(tabs)/index.tsx.
func dailyBand(_ score: Double) -> String {
  if score >= 85 { return "Optimal" }
  if score >= 70 { return "Strong" }
  if score >= 40 { return "Steady" }
  return "Low"
}
