import QuotaCanaryCore
import SwiftUI

private struct ReferenceDateKey: EnvironmentKey {
  static let defaultValue: Date? = nil
}

extension EnvironmentValues {
  /// Offscreen previews freeze relative freshness text; production follows the clock.
  var referenceDate: Date? {
    get { self[ReferenceDateKey.self] }
    set { self[ReferenceDateKey.self] = newValue }
  }
}

/// Glass belongs to the floating controls, not behind the balance content.
struct PanelControlMaterial: ViewModifier {
  @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
  @Environment(\.colorSchemeContrast) private var contrast

  @ViewBuilder
  func body(content: Content) -> some View {
    if reduceTransparency || contrast == .increased {
      content
    } else {
      content.glassEffect(.regular, in: .rect(cornerRadius: 14))
    }
  }
}
