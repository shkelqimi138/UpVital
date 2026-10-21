import SwiftUI

// Progress ring matching the app's ScoreRing and the iOS widget: full track, colored arc
// sweeping clockwise from 12 o'clock, rounded cap, value centered. Shared by the watch app
// and (for the in-app layout) sized down for the small screen.
struct WatchRing: View {
  let value: Double?          // 0–100, or nil for "no data"
  let color: Color
  var lineWidth: CGFloat = 7
  var valueFont: Font = .system(size: 16, weight: .bold, design: .rounded)
  var showValue: Bool = true

  private var fraction: Double {
    guard let v = value else { return 0 }
    return max(0, min(1, v / 100))
  }

  var body: some View {
    ZStack {
      Circle().stroke(Color.primary.opacity(0.16), lineWidth: lineWidth)
      Circle()
        .trim(from: 0, to: fraction)
        .stroke(color, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
        .rotationEffect(.degrees(-90))
      if showValue {
        Text(value == nil ? "–" : "\(Int(value!.rounded()))")
          .font(valueFont)
          .minimumScaleFactor(0.5)
      }
    }
  }
}
