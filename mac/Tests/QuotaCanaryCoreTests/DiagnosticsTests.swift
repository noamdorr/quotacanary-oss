import Foundation
@testable import QuotaCanaryCore
import Testing

private let diagSecret = "sk-or-SYNTHETIC-MARKER"

private func jsonString(_ report: Diagnostics.Report) -> String {
  String(decoding: Diagnostics.encode(report), as: UTF8.self)
}

@Suite struct DiagnosticsTests {
  @Test func reportIncludesOnlyTheAllowlistedFields() {
    let reading = Reading(
      balances: [PoolBalance(pool: Pool(creditType: "credits", label: "Credits", unit: .usd, cap: 100), balance: 12.5)],
      checkedAt: Date(timeIntervalSince1970: 1_700_000_000)
    )
    let snapshot = Diagnostics.ConnectionSnapshot(provider: .openrouter, hasCredential: true, lastReading: reading, lastError: nil)
    let report = Diagnostics.report(
      connections: [snapshot], appVersion: "0.1.0 (1)", now: Date(timeIntervalSince1970: 1_700_000_100)
    )

    #expect(report.app.version == "0.1.0 (1)")
    #expect(!report.app.macOSVersion.isEmpty)
    #expect(["arm64", "x86_64", "unknown"].contains(report.app.architecture))
    #expect(report.exportedAt == Date(timeIntervalSince1970: 1_700_000_100))
    #expect(report.connections == [
      Diagnostics.ConnectionInfo(
        index: 1, provider: .openrouter, hasCredential: true,
        lastReadingAt: Date(timeIntervalSince1970: 1_700_000_000),
        pools: [Diagnostics.PoolInfo(creditType: "credits", unit: .usd, balance: 12.5, cap: 100)],
        consecutiveFailures: 0,
        lastErrorCase: nil
      ),
    ])

    let json = jsonString(report)
    #expect(json.contains("\"hasCredential\""))
    #expect(!json.contains("credentialRef"))
    #expect(!json.contains("\"id\""))
    #expect(report.updates == Diagnostics.UpdatesInfo(automaticUpdateChecks: false, lastUpdateCheckAt: nil))
  }

  @Test func updateSettingsAreTheOnlyPreferencesReported() {
    // QUO-139: the two update values the caller passes in, nothing else from preferences.json.
    let checked = Date(timeIntervalSince1970: 1_700_000_050)
    let report = Diagnostics.report(
      connections: [], appVersion: "0.1.0",
      updates: Diagnostics.UpdatesInfo(automaticUpdateChecks: true, lastUpdateCheckAt: checked)
    )
    #expect(report.updates.automaticUpdateChecks)
    #expect(report.updates.lastUpdateCheckAt == checked)
    let json = jsonString(report)
    #expect(json.contains("\"automaticUpdateChecks\" : true"))
    #expect(json.contains("\"lastUpdateCheckAt\""))
    for excluded in ["updatePromptAnswered", "loginPromptAnswered", "alertsPromptAnswered", "feed", "sha256"] {
      #expect(!json.contains(excluded))
    }
  }

  @Test func consecutiveFailuresAndTheLastErrorCaseAreReported() {
    // QUO-133: an integer count and a case name, nothing the provider said.
    let connection = Connection(
      id: diagSecret, provider: .hunter, name: diagSecret, credentialRef: diagSecret, lastReading: nil,
      monitoring: MonitoringState(consecutiveFailures: 3, failureAlertSent: true)
    )
    let snapshot = Diagnostics.ConnectionSnapshot(connection: connection, lastError: .provider(.hunter, .rateLimited))
    let report = Diagnostics.report(connections: [snapshot], appVersion: "0.1.0")

    #expect(report.connections.first?.consecutiveFailures == 3)
    #expect(report.connections.first?.lastErrorCase == "provider.rateLimited")
    let json = jsonString(report)
    #expect(json.contains("\"consecutiveFailures\" : 3"))
    #expect(!json.contains(diagSecret))
    #expect(!json.contains("failureAlertSent")) // flags are app state, not diagnostics
  }

  @Test func connectionNameAndCredentialRefNeverReachTheReport() {
    let connection = Connection(id: diagSecret, provider: .openrouter, name: diagSecret, credentialRef: diagSecret, lastReading: nil)
    let snapshot = Diagnostics.ConnectionSnapshot(connection: connection, lastError: nil)
    let report = Diagnostics.report(connections: [snapshot], appVersion: "0.1.0")

    #expect(report.connections.first?.hasCredential == true)
    let json = jsonString(report)
    #expect(!json.contains(diagSecret))
  }

  @Test func providerErrorTextNeverReachesTheReport() {
    // .missingField's associated string stands in for provider-supplied text: it must never
    // surface, only the case name does.
    let error = MonitorError.provider(.openrouter, .missingField(diagSecret))
    let snapshot = Diagnostics.ConnectionSnapshot(provider: .openrouter, hasCredential: true, lastReading: nil, lastError: error)
    let report = Diagnostics.report(connections: [snapshot], appVersion: "0.1.0")

    #expect(report.connections.first?.lastErrorCase == "provider.missingField")
    #expect(!jsonString(report).contains(diagSecret))
  }

  @Test func vendorTextFromACatalogReadNeverReachesTheReport() async throws {
    // QUO-196: errorPath and bodyError carry the vendor string for the row; diagnostics keep
    // only the case name, for the message paths and for the no-message fallback alike.
    let base = CatalogEntry(
      id: "acme", name: "Acme", request: .init(method: .get, url: "https://api.acme.test/"),
      auth: .init(in: .header, name: "Authorization"),
      pools: [.init(creditType: "c", label: "C", unit: .credits, balance: "left")]
    )
    var viaErrorPath = base
    viaErrorPath.errorPath = "error"
    var viaBodyError = base
    viaBodyError.bodyError = .init(when: .equals(path: "success", false), messagePaths: ["message"])
    let cases: [(CatalogEntry, String, String)] = [
      (viaErrorPath, #"{"error":"\#(diagSecret)"}"#, "provider.reportedError"),
      (viaBodyError, #"{"success":false,"message":"\#(diagSecret)"}"#, "provider.reportedError"),
      (viaBodyError, #"{"success":false}"#, "provider.reportedError"),
    ]
    for (entry, body, caseName) in cases {
      let transport = ScriptedTransport([.respond(status: 200, body: body)])
      do {
        _ = try await CatalogProvider.read(entry, key: "key", transport: transport)
        Issue.record("expected a reported error")
      } catch let readError as ProviderReadError {
        let error = MonitorError.provider(ProviderID("acme"), readError)
        if body.contains(diagSecret) { #expect(error.checkFailureMessage == diagSecret) }
        let snapshot = Diagnostics.ConnectionSnapshot(provider: ProviderID("acme"), hasCredential: true, lastReading: nil, lastError: error)
        let report = Diagnostics.report(connections: [snapshot], appVersion: "0.1.0")
        #expect(report.connections.first?.lastErrorCase == caseName)
        #expect(!jsonString(report).contains(diagSecret))
      }
    }
  }

  @Test func everyErrorCaseNameExcludesTheSecret() {
    let allErrors: [MonitorError] = [
      .missingKey, .credentialWriteFailed, .credentialReadFailed, .credentialMissing,
      .credentialDeleteFailed, .saveFailed, .loadFailed, .notConnected,
      .provider(.openrouter, .unreachable), .provider(.openrouter, .keyRejected),
      .provider(.openrouter, .httpStatus(500)), .provider(.openrouter, .notJSON),
      .provider(.openrouter, .missingField(diagSecret)),
      .provider(.apollo, .keyLacksScope), .provider(.tavily, .reportedError(nil)),
      .provider(.tavily, .reportedError(diagSecret)),
      .provider(.hunter, .rateLimited),
    ]
    for error in allErrors {
      #expect(!error.diagnosticsCaseName.contains(diagSecret))
    }
  }

  @Test func redactStripsSecretsFromArbitraryProviderText() {
    let fakeProviderBody = #"{"error":{"message":"key \#(diagSecret) is invalid"}}"#
    #expect(fakeProviderBody.contains(diagSecret))

    let redacted = Diagnostics.redact(fakeProviderBody, secrets: [diagSecret])
    #expect(!redacted.contains(diagSecret))
    #expect(redacted.contains("[redacted]"))
  }

  @Test func suggestedFilenameIsTimestampOnlyAndNeverContainsASecret() {
    let name = Diagnostics.suggestedFilename(now: Date(timeIntervalSince1970: 1_700_000_000))
    #expect(name.hasPrefix("quotacanary-diagnostics-"))
    #expect(name.hasSuffix(".json"))
    #expect(!name.contains(diagSecret))
  }

  @Test func exportWritesTheReportWhenADestinationIsChosen() {
    let report = Diagnostics.report(connections: [], appVersion: "0.1.0")
    let destination = URL(fileURLWithPath: "/tmp/quotacanary-diagnostics-test.json")
    var written: (data: Data, url: URL)?

    let outcome = Diagnostics.export(
      report, chooseDestination: { destination }, write: { data, url in written = (data, url) }
    )

    #expect(outcome == .saved(destination))
    #expect(written?.url == destination)
    #expect(!(written.map { String(decoding: $0.data, as: UTF8.self) } ?? "").isEmpty)
  }

  @Test func exportReturnsCancelledWithoutWritingWhenNoDestinationIsChosen() {
    let report = Diagnostics.report(connections: [], appVersion: "0.1.0")
    var wrote = false

    let outcome = Diagnostics.export(report, chooseDestination: { nil }, write: { _, _ in wrote = true })

    #expect(outcome == .cancelled)
    #expect(!wrote)
  }

  @Test func exportFailureNeverLeaksTheUnderlyingErrorText() {
    struct WriteFailure: Error { let text: String }
    let report = Diagnostics.report(connections: [], appVersion: "0.1.0")

    let outcome = Diagnostics.export(
      report,
      chooseDestination: { URL(fileURLWithPath: "/tmp/quotacanary-diagnostics-test.json") },
      write: { _, _ in throw WriteFailure(text: "OpenRouter said: \(diagSecret)") }
    )

    guard case let .failed(message) = outcome else {
      Issue.record("expected a failure outcome")
      return
    }
    #expect(!message.contains(diagSecret))
    #expect(message == Copy.diagnosticsExportFailed)
  }
}
