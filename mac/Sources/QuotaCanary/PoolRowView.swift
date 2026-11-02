import AppKit
import QuotaCanaryCore
import SwiftUI

/// One pool of one connection: status word, label, amount in the pool's
/// unit. Unmonitored pools stay legible and carry a "Not monitored" cue.
struct PoolRowView: View {
  let row: PoolRow

  var body: some View {
    HStack(spacing: 8) {
      StatusCue(row: row)
      Text(row.pool.label).lineLimit(1)
      Spacer(minLength: 8)
      NotMonitoredCue(row: row, compact: true)
      MutedCue(row: row)
      Text(Self.amount(row))
        .font(.title3.weight(.medium).monospacedDigit())
        .fixedSize(horizontal: true, vertical: false)
        .foregroundStyle(Self.amountColor(row))
    }
    .opacity(row.muted ? MutedCue.dimming : 1)
    .help(Self.summary(row))
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(Self.summary(row)))
  }

  static func amount(_ row: PoolRow) -> String {
    if row.status == .unavailable { return Copy.notInPlan }
    guard let balance = row.balance else { return Copy.noData }
    return Format.amount(balance, pool: row.pool)
  }

  /// An alerting balance takes its status tone (QUO-393); a muted one is
  /// plain gray, never tinted.
  static func amountColor(_ row: PoolRow) -> Color {
    if row.muted || row.balance == nil || row.status == .unavailable { return .secondary }
    return row.status.isWarning ? StatusIndicator.textColor(row.status) : .primary
  }

  /// The panel row's short run-out time (QUO-401). An unmonitored row hides
  /// it: its "Not monitored" cue already says nobody is watching. So does a
  /// fresh install's "collecting history", which at panel width would push
  /// out the pool label; the window keeps it in its own column.
  static func etaCaption(_ row: PoolRow, eta: BurnEta?) -> String? {
    guard row.settings.monitored, let eta, eta.short != Copy.etaCollectingShort else { return nil }
    return eta.short
  }

  static func summary(_ row: PoolRow, eta: BurnEta? = nil, now: Date = Date()) -> String {
    var parts = [row.pool.label, StatusIndicator.label(row.status), amount(row)]
    if !row.settings.monitored { parts.append(Copy.notMonitored) }
    if let cue = MutedCue.text(row, now: now) { parts.append(cue) }
    if let eta, row.settings.monitored { parts.append(eta.long) }
    return parts.joined(separator: ", ")
  }
}

/// The status in the old glyph slot (QUO-393): nothing on a healthy row, the
/// word on a warning or not-in-plan row (the non-color cue that replaced the
/// QUO-264 glyphs), the hollow circle on an unread one. A muted row gets the
/// bell in the window's column (QUO-399) and nothing in the panel, whose
/// `MutedCue` carries it. `width` pins the window's column.
struct StatusCue: View {
  let row: PoolRow
  var width: CGFloat?

  var body: some View {
    if let width {
      // Half the table's 12pt spacing goes back to the connection column.
      cue.frame(width: width, alignment: .leading).padding(.trailing, -6)
    } else {
      cue
    }
  }

  @ViewBuilder private var cue: some View {
    if row.muted && width != nil {
      // The words are in the row's MutedCue; VoiceOver reads those.
      Image(systemName: StatusStyle.mutedSymbol).font(.caption).foregroundStyle(.secondary)
        .accessibilityHidden(true)
    } else if row.muted || row.status == .healthy {
      // A clear spacer, not EmptyView: the window column keeps its width.
      Color.clear.frame(width: 0, height: 0)
    } else if row.status == .unknown {
      StatusIndicator(status: .unknown)
    } else {
      Text(StatusIndicator.label(row.status))
        .font(width == nil ? .caption.weight(.semibold) : .caption2.weight(.semibold))
        .foregroundStyle(row.status.isWarning ? StatusIndicator.textColor(row.status) : Color.secondary)
        .lineLimit(width == nil ? 1 : 3)
        .fixedSize(horizontal: width == nil, vertical: true)
    }
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

/// "Muted until Fri" beside the bell on a muted balance (QUO-399), plain
/// "Back from mute" on one whose timed mute ran out while still alerting
/// (QUO-393); a muted row around it is dimmed by `dimming`. The window passes
/// `symbol: false`: its bell sits in the status column, where it fits.
struct MutedCue: View {
  let row: PoolRow
  var symbol = true
  static let dimming = 0.55
  @Environment(\.referenceDate) private var referenceDate

  var body: some View {
    if let text = Self.text(row, now: referenceDate ?? Date()) {
      Group {
        if row.muted && symbol {
          Label(text, systemImage: StatusStyle.mutedSymbol)
        } else {
          Text(text)
        }
      }
      .font(.caption).foregroundStyle(.secondary).lineLimit(1).fixedSize()
      .accessibilityLabel(text)
    }
  }

  static func text(_ row: PoolRow, now: Date) -> String? {
    if let mute = row.mute { return MuteMarker.text(mute, now: now) }
    return row.backFromMute ? Copy.backFromMute : nil
  }
}

/// The mute choices (QUO-393). "Stop monitoring…" is the one "always": it
/// unticks the balance's monitor setting.
struct MuteChoices: View {
  let model: AppModel
  let row: PoolRow

  var body: some View {
    ForEach(MuteChoice.allCases, id: \.self) { choice in
      Button(choice.title) { model.setMute(row.key, choice) }
    }
    Divider()
    Button(Copy.stopMonitoringButton) { model.stopMonitoring(row) }
  }
}

/// The context menu item: a "Mute" submenu on an alerting balance, "Unmute"
/// on a muted one, "Resume monitoring" on an unmonitored one (QUO-398).
/// Renders nothing otherwise, so it can sit in any context menu.
struct MuteButton: View {
  let model: AppModel
  let row: PoolRow

  enum Item: Equatable { case unmute, mute, resumeMonitoring }

  static func item(_ row: PoolRow) -> Item? {
    if row.muted { return .unmute }
    if row.alerts { return .mute }
    return row.settings.monitored ? nil : .resumeMonitoring
  }

  var body: some View {
    switch Self.item(row) {
    case .unmute: Button(Copy.unmuteButton) { model.setMute(row.key, nil) }
    case .mute: Menu(Copy.muteButton) { MuteChoices(model: model, row: row) }
    case .resumeMonitoring: Button(Copy.resumeMonitoringButton) { model.resumeMonitoring(row) }
    case nil: EmptyView()
    }
  }
}

/// The visible bell-slash beside Top up (QUO-393): opens the mute choices on
/// an alerting balance; "Unmute" on a muted one and "Resume monitoring" on an
/// unmonitored one (QUO-398) where `unmute` is set (the window inspector).
/// Callers style it like the Top up beside it.
struct MuteMenuButton: View {
  let model: AppModel
  let row: PoolRow
  var unmute = false

  var body: some View {
    if row.muted && unmute {
      Button(Copy.unmuteButton) { model.setMute(row.key, nil) }
    } else if !row.settings.monitored && unmute {
      Button(Copy.resumeMonitoringButton) { model.resumeMonitoring(row) }
    } else if row.alerts {
      Menu {
        MuteChoices(model: model, row: row)
      } label: {
        Image(systemName: StatusStyle.mutedSymbol)
      }
      .menuStyle(.button)
      .menuIndicator(.hidden)
      .fixedSize()
      .help(Copy.muteButton)
      .accessibilityLabel(Copy.muteButton)
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

extension StatusCue {
  /// The window's status column: "Critical" on one line, "Not in your plan" wraps.
  static let columnWidth: CGFloat = 40
}
