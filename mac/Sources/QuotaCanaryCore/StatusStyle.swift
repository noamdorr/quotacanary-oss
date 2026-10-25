import Foundation

// Status reads without hue (QUO-264). Canary Gold stays on dots, fills and
// meter bars, where it does not have to carry text; warning text uses a darker
// tone in light mode, because gold on a white row is about 1.6:1. Healthy and
// Low differ in shape, and an unmonitored row says so in words instead of
// fading out, so it still reads as something you can act on.

/// An sRGB color, for checking the warning text tones against their surfaces.
public struct SRGB: Equatable, Sendable {
  public let red: Double
  public let green: Double
  public let blue: Double

  public init(hex: UInt32) {
    red = Double((hex >> 16) & 0xFF) / 255
    green = Double((hex >> 8) & 0xFF) / 255
    blue = Double(hex & 0xFF) / 255
  }

  /// WCAG relative luminance.
  public var relativeLuminance: Double {
    func linear(_ c: Double) -> Double { c <= 0.03928 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4) }
    return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue)
  }

  /// WCAG contrast ratio, 1...21, either order.
  public func contrastRatio(against other: SRGB) -> Double {
    let (a, b) = (relativeLuminance, other.relativeLuminance)
    return (max(a, b) + 0.05) / (min(a, b) + 0.05)
  }
}

public enum StatusAppearance: CaseIterable, Sendable {
  case light, dark, lightIncreasedContrast, darkIncreasedContrast
}

public enum StatusStyle {
  public static let canaryGold = SRGB(hex: 0xFFC400)

  /// Status glyphs: Low keeps the approved gold dot, Healthy gets a check.
  public static func symbol(_ status: PoolStatus) -> String {
    switch status {
    case .healthy: return "checkmark.circle.fill"
    case .low: return "circle.fill"
    case .critical: return "exclamationmark.triangle.fill"
    case .empty: return "exclamationmark.octagon.fill"
    case .unavailable: return "minus.circle"
    case .unknown: return "circle"
    }
  }

  /// Text tone for a warning caption such as the ETA. Low is dark amber in
  /// light mode and gold in dark mode; Critical and Empty are a red dark
  /// enough (or light enough) for small text. Other statuses are the
  /// Critical tone too, but no caller colors their text.
  public static func warningText(_ status: PoolStatus, _ appearance: StatusAppearance) -> SRGB {
    let low = status == .low
    switch appearance {
    case .light: return SRGB(hex: low ? 0x7A5600 : 0xB3261E)
    case .lightIncreasedContrast: return SRGB(hex: low ? 0x5C4000 : 0x861810)
    case .dark: return low ? canaryGold : SRGB(hex: 0xFF6961)
    case .darkIncreasedContrast: return low ? canaryGold : SRGB(hex: 0xFFA39E)
    }
  }

  /// Text tone for the "Check failed" monitoring cues: a dark orange in light
  /// mode (system orange on white is about 2.2:1), system orange in dark mode.
  public static func checkFailedText(_ appearance: StatusAppearance) -> SRGB {
    switch appearance {
    case .light: return SRGB(hex: 0x9A4A00)
    case .lightIncreasedContrast: return SRGB(hex: 0x6E3500)
    case .dark: return SRGB(hex: 0xFF9F0A)
    case .darkIncreasedContrast: return SRGB(hex: 0xFFB340)
    }
  }

  /// What a stack row's text sits on: the plain row and the selected-row tint,
  /// sampled from the light and dark window snapshots.
  public static func rowSurfaces(_ appearance: StatusAppearance) -> [SRGB] {
    switch appearance {
    case .light, .lightIncreasedContrast: return [SRGB(hex: 0xFFFFFF), SRGB(hex: 0xD8E3F8)]
    case .dark, .darkIncreasedContrast: return [SRGB(hex: 0x1E1E1E), SRGB(hex: 0x20293D)]
    }
  }

  /// WCAG AA for small text, AAA when the user asked for more contrast.
  public static func minimumTextContrast(_ appearance: StatusAppearance) -> Double {
    switch appearance {
    case .light, .dark: return 4.5
    case .lightIncreasedContrast, .darkIncreasedContrast: return 7
    }
  }

  /// SF Symbol beside the "Not monitored" cue.
  public static let notMonitoredSymbol = "bell.slash"

  /// The worded cue an unmonitored row carries instead of being dimmed.
  public static func monitoringCue(_ row: PoolRow) -> String? {
    row.settings.monitored ? nil : Copy.notMonitored
  }
}
