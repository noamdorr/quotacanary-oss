import AppKit
import Foundation
import QuotaCanaryCore
import SwiftUI
import UniformTypeIdentifiers

/// App version + build identity, read from the bundled Info.plist when running as a real .app
/// (see scripts/bundle.sh); falls back to the same values for `swift run` / `--snapshot`, which
/// have no Info.plist.
enum AppVersionInfo {
  /// CFBundleShortVersionString (mac/VERSION at bundle time). The update check compares against it.
  static var short: String {
    Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.1.0"
  }

  static var combined: String {
    let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "1"
    return "\(short) (\(build))"
  }
}

/// Drives the "Export diagnostics..." button: shows an NSSavePanel, writes the report, and holds
/// the one-line result. Never calls into MonitoringService, so exporting can never trigger a
/// provider refresh, and never touches the Keychain, disk state, telemetry, or a crash/email/
/// support path. The user decides afterward whether and how to share the file.
@MainActor
@Observable
final class DiagnosticsExportModel {
  private(set) var resultMessage: String?
  private(set) var resultIsError = false

  private let appVersion: String

  init(appVersion: String = AppVersionInfo.combined) {
    self.appVersion = appVersion
    // --snapshot seam only: previews the "saved" line without a real panel or file write, so it
    // can be eyeballed. Never set in a normal run.
    if ProcessInfo.processInfo.environment["QUOTACANARY_DIAGNOSTICS_PREVIEW"] == "saved" {
      resultMessage = Copy.diagnosticsSaved(folder: "Downloads")
      resultIsError = false
    }
  }

  func export(
    connections: [Connection], errors: [String: MonitorError], checks: [String: CheckRecord] = [:],
    updates: Diagnostics.UpdatesInfo
  ) {
    let snapshots = connections.map {
      Diagnostics.ConnectionSnapshot(connection: $0, lastError: errors[$0.id], lastCheck: checks[$0.id])
    }
    let report = Diagnostics.report(connections: snapshots, appVersion: appVersion, updates: updates)
    apply(Diagnostics.export(report, chooseDestination: Self.chooseDestination))
  }

  private func apply(_ outcome: Diagnostics.ExportOutcome) {
    switch outcome {
    case let .saved(url):
      resultIsError = false
      resultMessage = Copy.diagnosticsSaved(folder: url.deletingLastPathComponent().lastPathComponent)
    case .cancelled:
      resultIsError = false
      resultMessage = Copy.diagnosticsCancelled
    case let .failed(message):
      resultIsError = true
      resultMessage = message
    }
  }

  private static func chooseDestination() -> URL? {
    let panel = NSSavePanel()
    panel.nameFieldStringValue = Diagnostics.suggestedFilename()
    panel.allowedContentTypes = [.json]
    panel.canCreateDirectories = true
    return panel.runModal() == .OK ? panel.url : nil
  }
}

/// One button plus its inline result line. Used from both the connect form and the connected
/// view; each instance owns its own result state.
struct DiagnosticsExportRow: View {
  var model: AppModel
  @State private var exporter = DiagnosticsExportModel()

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Button(Copy.exportDiagnosticsButton) {
        exporter.export(
          connections: model.connections, errors: model.monitor.errors, checks: model.monitor.lastChecks,
          updates: Diagnostics.UpdatesInfo(
            automaticUpdateChecks: model.updater.automaticChecks, lastUpdateCheckAt: model.updater.lastCheckAt
          )
        )
      }
      if let message = exporter.resultMessage {
        if exporter.resultIsError {
          ErrorLine(message: message)
        } else {
          Text(message).font(.caption).foregroundStyle(.secondary)
        }
      }
    }
  }
}
