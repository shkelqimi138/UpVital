import SwiftUI

// Watch app screen: the Daily ring + band, then the three metric rings. Shows a sync prompt
// until the iPhone has pushed today's scores.
struct ContentView: View {
  @EnvironmentObject private var connectivity: WatchConnectivityManager

  var body: some View {
    ScrollView {
      if let d = connectivity.data, d.isToday {
        VStack(spacing: 12) {
          WatchRing(value: d.daily, color: .uvGreen, lineWidth: 9,
                    valueFont: .system(size: 28, weight: .bold, design: .rounded))
            .frame(width: 92, height: 92)
          Text(d.daily != nil ? dailyBand(d.daily!) : "Daily")
            .font(.caption).foregroundStyle(.secondary)
          HStack(spacing: 12) {
            metric("Rec", d.recovery, .uvGreen)
            metric("Sleep", d.sleep, .uvIndigo)
            metric("Stress", d.stress, .uvAmber)
          }
          if let streak = d.streak, streak > 0 {
            Text("🔥 \(Int(streak)) day streak")
              .font(.footnote).foregroundStyle(.secondary)
          }
        }
        .padding(.vertical, 6)
      } else {
        VStack(spacing: 8) {
          Text("UpVital").font(.headline).foregroundColor(.uvGreen)
          Text("Open UpVital on your iPhone to sync today's scores.")
            .font(.footnote).foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
        }
        .padding()
      }
    }
  }

  private func metric(_ label: String, _ value: Double?, _ color: Color) -> some View {
    VStack(spacing: 4) {
      WatchRing(value: value, color: color, lineWidth: 5,
                valueFont: .system(size: 12, weight: .bold, design: .rounded))
        .frame(width: 42, height: 42)
      Text(label).font(.system(size: 11)).foregroundStyle(.secondary)
    }
  }
}
