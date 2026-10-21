import SwiftUI

@main
struct UpVitalWatchApp: App {
  // Single shared connectivity manager, created at launch so it's ready to receive the
  // iPhone's application-context pushes.
  @StateObject private var connectivity = WatchConnectivityManager.shared

  var body: some Scene {
    WindowGroup {
      ContentView()
        .environmentObject(connectivity)
    }
  }
}
