import QuotaCanaryCore
import SwiftUI

// Monitoring health beside the balances (QUO-262): a failed check is shown
// next to the name it affects, never only in Settings
// or the far-right Checked column.

/// "Check failed · last good 5 minutes ago" under a connection name; nothing while checks work.
struct CheckCue: View {
  let health: MonitoringHealth
  @Environment(\.referenceDate) private var referenceDate

  var body: some View {
    if !health.isTrusted {
      TimelineView(.periodic(from: .now, by: 30)) { context in
        let cue = health.cue { ConnectedView.relative($0, now: referenceDate ?? context.date) } ?? ""
        Label(cue, systemImage: "clock.badge.exclamationmark")
          .font(.caption).foregroundStyle(StatusIndicator.checkFailedTextColor).lineLimit(1).truncationMode(.tail)
          .help(cue)
      }
    }
  }
}

/// Manual Refresh feedback (QUO-268): a spinner while it runs, then how it
/// ended for a few seconds. Nothing while idle.
struct RefreshProgressLabel: View {
  let progress: RefreshProgress

  var body: some View {
    if let label = progress.label {
      let failed = { if case .finished(.failed) = progress { return true }; return false }()
      HStack(spacing: 4) {
        switch progress {
        case .checking: ProgressView().controlSize(.mini)
        case .finished(.checked): Image(systemName: "checkmark")
        case .finished(.failed): Image(systemName: "exclamationmark.triangle.fill")
        case .finished(.offline): Image(systemName: "wifi.slash")
        case .idle: EmptyView()
        }
        Text(label)
      }
      .font(.caption).lineLimit(1).fixedSize()
      .foregroundStyle(failed ? StatusIndicator.checkFailedTextColor : Color.secondary)
      .accessibilityElement(children: .ignore)
      .accessibilityLabel(label)
      .accessibilityAddTraits(.updatesFrequently)
    }
  }
}

/// A panel row: name, then the balance label (or failure reason) and the
/// trailing amount on one line when all of it fits at full length; otherwise
/// the name above and the rest below, so neither is cut to "Searc..." (QUO-269).
struct AdaptiveRowLine<Leading: View, Trailing: View>: View {
  let name: String
  let detail: String
  @ViewBuilder let leading: Leading
  @ViewBuilder let trailing: Trailing

  var body: some View {
    ViewThatFits(in: .horizontal) {
      HStack(spacing: 6) {
        leading
        Text(name).fontWeight(.medium).lineLimit(1)
        Text(detail).foregroundStyle(.secondary).lineLimit(1)
        Spacer(minLength: 0)
        trailing
      }
      HStack(spacing: 6) {
        leading
        VStack(alignment: .leading, spacing: 1) {
          HStack(spacing: 6) {
            Text(name).fontWeight(.medium).lineLimit(1).truncationMode(.middle)
              }
          HStack(spacing: 6) {
            Text(detail).foregroundStyle(.secondary).lineLimit(1).truncationMode(.middle)
            Spacer(minLength: 4)
            trailing
          }
        }
        .padding(.vertical, 2)
      }
    }
  }
}
