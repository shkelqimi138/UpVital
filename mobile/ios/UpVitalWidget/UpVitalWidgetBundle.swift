//
//  UpVitalWidgetBundle.swift
//  UpVitalWidget
//

import SwiftUI
import WidgetKit

// Single entry point for the widget extension. The sample Control Widget Xcode generated
// (UpVitalWidgetControl) was removed — ControlWidget is iOS 18+ and this target deploys to 16.4.
@main
struct UpVitalWidgetBundle: WidgetBundle {
  var body: some Widget {
    UpVitalWidget()
  }
}
