import Foundation
@testable import QuotaCanaryCore
import Testing

private let ago: (Date) -> String = { _ in "5 minutes ago" }

@MainActor @Suite struct MonitoringPresentationTests {
  @Test func failedLocalRowAnnouncesFailureAndLastGoodCheck() async throws {
    let service = try await ScriptedScenario.hunter.connected()
    let connection = try #require(service.connections.first)
    let summary = "Verifications, Healthy, 480 of 1,000"

    let failed = MonitoringHealth.local(connection, failing: true)
    #expect(failed == .checkFailed(lastGood: connection.lastReading?.checkedAt))
    #expect(!failed.isTrusted)
    #expect(failed.cue(ago) == "Check failed · last good 5 minutes ago")
    let label = failed.rowAccessibilityLabel(name: connection.name, summary: summary, relative: ago)
    #expect(label == "Hunter, \(summary), Check failed · last good 5 minutes ago")

    let current = MonitoringHealth.local(connection, failing: false)
    #expect(current.isTrusted)
    #expect(current.cue(ago) == nil)
    let currentLabel = current.rowAccessibilityLabel(name: connection.name, summary: summary, relative: ago)
    #expect(currentLabel == "Hunter, \(summary), Checked 5 minutes ago")
  }

  @Test func failedCheckWithoutAGoodReadingSaysSo() {
    #expect(MonitoringHealth.checkFailed(lastGood: nil).cue(ago) == "Check failed · no good check yet")
    #expect(MonitoringHealth.current(checkedAt: nil).accessibilityPhrase(ago) == Copy.notCheckedYet)
  }
}
