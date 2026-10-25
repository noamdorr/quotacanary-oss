import AppKit
import QuotaCanaryCore
import SwiftUI

/// One pool of one connection: status glyph, label, amount in the pool's
/// unit. Unmonitored pools stay legible and carry a "Not monitored" cue.
struct PoolRowView: View {
  let row: PoolRow

  var body: some View {
    HStack(spacing: 8) {
      StatusIndicator(status: row.status)
      Text(row.pool.label).lineLimit(1)
      Spacer(minLength: 8)
      NotMonitoredCue(row: row, compact: true)
      Text(Self.amount(row))
        .font(.title3.weight(.medium).monospacedDigit())
        .fixedSize(horizontal: true, vertical: false)
        .foregroundStyle(row.balance == nil || row.status == .unavailable ? Color.secondary : Color.primary)
    }
    .help(Self.summary(row))
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(Self.summary(row)))
  }

  static func amount(_ row: PoolRow) -> String {
    if row.status == .unavailable { return Copy.notInPlan }
    guard let balance = row.balance else { return Copy.noData }
    return Format.amount(balance, pool: row.pool)
  }

  static func summary(_ row: PoolRow) -> String {
    var parts = [row.pool.label, StatusIndicator.label(row.status), amount(row)]
    if !row.settings.monitored { parts.append(Copy.notMonitored) }
    return parts.joined(separator: ", ")
  }
}

/// Status uses shape as well as color, so it reads without color vision:
/// check healthy, gold dot low, warning triangle critical, octagon
/// empty, dash unavailable, hollow circle unknown (`StatusStyle.symbol`).
struct StatusIndicator: View {
  let status: PoolStatus

  var body: some View {
    Image(systemName: Self.symbol(status))
      .font(.caption.weight(.bold))
      .foregroundStyle(Self.color(status))
      .frame(width: 14)
      .accessibilityLabel(Self.label(status))
  }

  static func symbol(_ status: PoolStatus) -> String { StatusStyle.symbol(status) }

  static func color(_ status: PoolStatus) -> Color {
    switch status {
    case .healthy: return .green
    case .low: return Brand.gold
    case .critical, .empty: return .red
    case .unavailable, .unknown: return .secondary
    }
  }

  /// For warning text (ETA captions): gold stays on glyphs and fills, text
  /// gets the contrast-checked tone for the current appearance.
  static func textColor(_ status: PoolStatus) -> Color {
    appearanceColor { StatusStyle.warningText(status, $0) }
  }

  /// The "Check failed" cue text tone (`StatusStyle.checkFailedText`).
  static let checkFailedTextColor = appearanceColor { StatusStyle.checkFailedText($0) }

  /// A color that follows the effective appearance, including Increase Contrast.
  private static func appearanceColor(_ tone: @escaping @Sendable (StatusAppearance) -> SRGB) -> Color {
    Color(nsColor: NSColor(name: nil) { appearance in
      let names: [NSAppearance.Name] = [.aqua, .darkAqua, .accessibilityHighContrastAqua, .accessibilityHighContrastDarkAqua]
      let look: StatusAppearance = switch appearance.bestMatch(from: names) {
      case .darkAqua: .dark
      case .accessibilityHighContrastAqua: .lightIncreasedContrast
      case .accessibilityHighContrastDarkAqua: .darkIncreasedContrast
      default: .light
      }
      let rgb = tone(look)
      return NSColor(srgbRed: rgb.red, green: rgb.green, blue: rgb.blue, alpha: 1)
    })
  }

  static func label(_ status: PoolStatus) -> String {
    switch status {
    case .healthy: return Copy.statusHealthy
    case .low: return Copy.statusLow
    case .critical: return Copy.statusCritical
    case .empty: return Copy.statusEmpty
    case .unavailable: return Copy.statusUnavailable
    case .unknown: return Copy.statusUnknown
    }
  }
}

/// "Not monitored" in place of dimming the row; `compact` shows only the
/// symbol where a row has no room (the row's help and VoiceOver say the words).
struct NotMonitoredCue: View {
  let row: PoolRow
  var compact = false

  var body: some View {
    if let cue = StatusStyle.monitoringCue(row) {
      Group {
        if compact {
          Image(systemName: StatusStyle.notMonitoredSymbol).help(cue)
        } else {
          Label(cue, systemImage: StatusStyle.notMonitoredSymbol).lineLimit(1)
        }
      }
      .font(.caption).foregroundStyle(.secondary)
      .accessibilityLabel(cue)
    }
  }
}

/// "Top up" opens the vendor's billing page (QUO-214). Renders nothing
/// without a URL, so it can sit in any context menu or row unconditionally.
struct TopUpButton: View {
  let url: URL?

  var body: some View {
    if let url {
      Button(Copy.topUpButton) { NSWorkspace.shared.open(url) }
    }
  }
}
