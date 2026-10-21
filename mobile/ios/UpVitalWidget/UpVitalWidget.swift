import SwiftUI
import WidgetKit

// UpVital Home Screen widget. Reads today's scores from the shared App Group (written by
// the app) and renders them as rings that match the in-app ScoreRing: full track, progress
// sweeping clockwise from 12 o'clock, rounded cap, value centered. Rings are colored by
// metric (not by score), exactly like the Home screen: Recovery green, Sleep indigo,
// Stress amber, Daily green.
//
// The @main entry point lives in UpVitalWidgetBundle.swift (Xcode's generated file).

// MARK: - Brand colors (match lib/theme/colors.ts)
extension Color {
  static let uvGreen  = Color(red: 22.0 / 255.0, green: 163.0 / 255.0, blue: 74.0 / 255.0)  // #16A34A
  static let uvIndigo = Color(red: 91.0 / 255.0, green: 91.0 / 255.0, blue: 214.0 / 255.0)  // #5B5BD6
  static let uvAmber  = Color(red: 224.0 / 255.0, green: 160.0 / 255.0, blue: 47.0 / 255.0) // #E0A02F
}

// MARK: - Ring
struct RingView: View {
  let value: Double?          // 0–100, or nil for "no data"
  let color: Color
  var lineWidth: CGFloat = 8
  var valueFont: Font = .system(size: 20, weight: .bold, design: .rounded)
  var showValue: Bool = true

  private var fraction: Double {
    guard let v = value else { return 0 }
    return max(0, min(1, v / 100))
  }

  var body: some View {
    ZStack {
      Circle().stroke(Color.primary.opacity(0.12), lineWidth: lineWidth)
      Circle()
        .trim(from: 0, to: fraction)
        .stroke(color, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
        .rotationEffect(.degrees(-90)) // start at 12 o'clock
      if showValue {
        Text(value == nil ? "–" : "\(Int(value!.rounded()))")
          .font(valueFont)
          .foregroundColor(.primary)
          .minimumScaleFactor(0.5)
      }
    }
  }
}

// A small ring with its metric label beside it (medium/large layouts).
struct LabeledRing: View {
  let label: String
  let value: Double?
  let color: Color

  var body: some View {
    HStack(spacing: 8) {
      RingView(value: value, color: color, lineWidth: 5,
               valueFont: .system(size: 13, weight: .bold, design: .rounded))
        .frame(width: 34, height: 34)
      Text(label).font(.system(size: 13, weight: .medium)).foregroundStyle(.secondary)
      Spacer(minLength: 0)
    }
  }
}

// MARK: - Timeline
struct UpVitalEntry: TimelineEntry {
  let date: Date
  let data: WidgetData?
}

struct Provider: TimelineProvider {
  func placeholder(in context: Context) -> UpVitalEntry {
    UpVitalEntry(date: Date(), data: WidgetData.preview)
  }

  func getSnapshot(in context: Context, completion: @escaping (UpVitalEntry) -> Void) {
    let data = context.isPreview ? WidgetData.preview : WidgetData.load()
    completion(UpVitalEntry(date: Date(), data: data))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<UpVitalEntry>) -> Void) {
    // Scores change ~once a day and the app also calls reloadAllTimelines() after every
    // sync, so a lazy refresh every couple of hours is plenty to catch the day rollover.
    let entry = UpVitalEntry(date: Date(), data: WidgetData.load())
    let next = Calendar.current.date(byAdding: .hour, value: 2, to: Date()) ?? Date().addingTimeInterval(7200)
    completion(Timeline(entries: [entry], policy: .after(next)))
  }
}

// MARK: - Container background (iOS 17 requires .containerBackground)
// UpVital is dark-only, so the widget is dark too, whatever the Home Screen's appearance: the
// app's background colour, and system text colours resolved for dark.
private struct WidgetBackground: ViewModifier {
  private let background = Color(red: 8.0 / 255.0, green: 10.0 / 255.0, blue: 9.0 / 255.0) // #080A09

  func body(content: Content) -> some View {
    if #available(iOS 17.0, *) {
      content.environment(\.colorScheme, .dark).containerBackground(for: .widget) { background }
    } else {
      content.environment(\.colorScheme, .dark).padding().background(background)
    }
  }
}

extension View {
  func widgetBackground() -> some View { modifier(WidgetBackground()) }
}

// MARK: - Empty / stale state
struct SyncPrompt: View {
  var body: some View {
    VStack(spacing: 8) {
      Text("UpVital").font(.system(size: 15, weight: .bold)).foregroundColor(.uvGreen)
      Text("Open UpVital to sync your scores")
        .font(.system(size: 13))
        .foregroundStyle(.secondary)
        .multilineTextAlignment(.center)
    }
    .padding(8)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .widgetBackground()
  }
}

// MARK: - Small
struct SmallView: View {
  let data: WidgetData
  var body: some View {
    VStack(spacing: 8) {
      RingView(value: data.daily, color: .uvGreen, lineWidth: 10,
               valueFont: .system(size: 30, weight: .bold, design: .rounded))
        .frame(width: 92, height: 92)
      Text(data.daily != nil ? dailyBand(data.daily!) : "Daily")
        .font(.system(size: 13, weight: .semibold))
        .foregroundStyle(.secondary)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .widgetBackground()
  }
}

// MARK: - Medium
struct MediumView: View {
  let data: WidgetData
  var body: some View {
    HStack(spacing: 18) {
      VStack(spacing: 6) {
        RingView(value: data.daily, color: .uvGreen, lineWidth: 9,
                 valueFont: .system(size: 26, weight: .bold, design: .rounded))
          .frame(width: 84, height: 84)
        Text(data.daily != nil ? dailyBand(data.daily!) : "Daily")
          .font(.system(size: 12, weight: .semibold))
          .foregroundStyle(.secondary)
      }
      VStack(spacing: 10) {
        LabeledRing(label: "Recovery", value: data.recovery, color: .uvGreen)
        LabeledRing(label: "Sleep", value: data.sleep, color: .uvIndigo)
        LabeledRing(label: "Stress", value: data.stress, color: .uvAmber)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .widgetBackground()
  }
}

// MARK: - Large
struct LargeView: View {
  let data: WidgetData
  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      HStack {
        Text("UpVital").font(.system(size: 16, weight: .bold)).foregroundColor(.uvGreen)
        Spacer()
        if let streak = data.streak, streak > 0 {
          Text("🔥 \(Int(streak))d").font(.system(size: 13, weight: .semibold)).foregroundStyle(.secondary)
        }
      }
      HStack(spacing: 18) {
        RingView(value: data.daily, color: .uvGreen, lineWidth: 11,
                 valueFont: .system(size: 34, weight: .bold, design: .rounded))
          .frame(width: 108, height: 108)
        VStack(alignment: .leading, spacing: 4) {
          Text("Daily score").font(.system(size: 13)).foregroundStyle(.secondary)
          Text(data.daily != nil ? dailyBand(data.daily!) : "–")
            .font(.system(size: 22, weight: .bold))
            .foregroundColor(.primary)
          if let age = data.biologicalAge {
            Text("Biological age \(Int(age.rounded()))")
              .font(.system(size: 13)).foregroundStyle(.secondary)
          }
        }
        Spacer(minLength: 0)
      }
      Divider()
      VStack(spacing: 12) {
        LabeledRing(label: "Recovery", value: data.recovery, color: .uvGreen)
        LabeledRing(label: "Sleep", value: data.sleep, color: .uvIndigo)
        LabeledRing(label: "Stress", value: data.stress, color: .uvAmber)
      }
      Spacer(minLength: 0)
    }
    .padding(4)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .widgetBackground()
  }
}

// MARK: - Family dispatch
struct UpVitalWidgetView: View {
  @Environment(\.widgetFamily) private var family
  let entry: UpVitalEntry

  var body: some View {
    // No data yet, or the stored day isn't today → show the sync prompt rather than stale numbers.
    if let data = entry.data, data.isToday {
      switch family {
      case .systemSmall: SmallView(data: data)
      case .systemLarge: LargeView(data: data)
      default: MediumView(data: data)
      }
    } else {
      SyncPrompt()
    }
  }
}

// MARK: - Widget
struct UpVitalWidget: Widget {
  let kind = "UpVitalWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: Provider()) { entry in
      UpVitalWidgetView(entry: entry)
    }
    .configurationDisplayName("UpVital")
    .description("Your daily longevity scores at a glance.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
  }
}
