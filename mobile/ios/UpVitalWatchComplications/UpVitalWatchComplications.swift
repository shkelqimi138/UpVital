import SwiftUI
import WidgetKit

// Watch-face complications (WidgetKit accessory families, watchOS 9+). They read the same
// App Group the watch app writes on receiving scores from the iPhone. Add the shared files
// (Shared/WatchData.swift, Shared/WatchRing.swift) to THIS target too.

struct WatchEntry: TimelineEntry {
  let date: Date
  let data: WatchData?
}

struct WatchProvider: TimelineProvider {
  func placeholder(in context: Context) -> WatchEntry {
    WatchEntry(date: Date(), data: WatchData.preview)
  }

  func getSnapshot(in context: Context, completion: @escaping (WatchEntry) -> Void) {
    completion(WatchEntry(date: Date(), data: context.isPreview ? .preview : WatchData.load()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<WatchEntry>) -> Void) {
    let entry = WatchEntry(date: Date(), data: WatchData.load())
    let next = Calendar.current.date(byAdding: .hour, value: 2, to: Date()) ?? Date().addingTimeInterval(7200)
    completion(Timeline(entries: [entry], policy: .after(next)))
  }
}

struct ComplicationView: View {
  @Environment(\.widgetFamily) private var family
  let entry: WatchEntry

  // Only show today's score; otherwise the complication reads as "no score" (–).
  private var daily: Double? {
    guard let d = entry.data, d.isToday else { return nil }
    return d.daily
  }
  private var valueText: String { daily != nil ? "\(Int(daily!.rounded()))" : "–" }

  var body: some View {
    switch family {
    case .accessoryCircular:
      Gauge(value: (daily ?? 0) / 100) {
        Text("UV")
      } currentValueLabel: {
        Text(valueText)
      }
      .gaugeStyle(.accessoryCircular)
      .tint(.uvGreen)

    case .accessoryInline:
      Text(daily != nil ? "UpVital \(valueText)" : "UpVital – sync")

    case .accessoryRectangular:
      HStack(spacing: 10) {
        Gauge(value: (daily ?? 0) / 100) { Text("") } currentValueLabel: { Text(valueText) }
          .gaugeStyle(.accessoryCircular)
          .tint(.uvGreen)
        VStack(alignment: .leading, spacing: 2) {
          Text("Daily score").font(.headline)
          Text(daily != nil ? dailyBand(daily!) : "Open app to sync")
            .font(.caption).foregroundStyle(.secondary)
        }
      }

    default:
      Text(valueText)
    }
  }
}

struct UpVitalWatchComplications: Widget {
  let kind = "UpVitalWatchComplications"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: WatchProvider()) { entry in
      ComplicationView(entry: entry)
    }
    .configurationDisplayName("UpVital")
    .description("Your daily longevity score.")
    .supportedFamilies([.accessoryCircular, .accessoryRectangular, .accessoryInline])
  }
}
