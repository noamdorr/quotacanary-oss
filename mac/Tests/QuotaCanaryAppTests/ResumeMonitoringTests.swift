@testable import QuotaCanary
import QuotaCanaryCore
import Testing

/// QUO-398: "Stop monitoring…" in the right-click menu has a right-click way back.
@MainActor @Suite struct ResumeMonitoringTests {
  private func row(_ model: AppModel) throws -> PoolRow {
    try #require(model.connections.first?.poolRows.first)
  }

  @Test func resumeAfterStopMonitorsTheBalanceAgain() async throws {
    let model = await SnapshotStacks.model(.hunter, system: .preview())
    #expect(model.stopMonitoring(try row(model)) == nil)
    #expect(try !row(model).settings.monitored)
    #expect(MuteButton.item(try row(model)) == .resumeMonitoring)
    #expect(model.resumeMonitoring(try row(model)) == nil)
    #expect(try row(model).settings.monitored)
    #expect(MuteButton.item(try row(model)) != .resumeMonitoring)
  }

  @Test func onlyAnUnmonitoredBalanceOffersResume() async throws {
    let model = await SnapshotStacks.model(.hunter, system: .preview())
    var row = try row(model)
    row.settings.monitored = true
    #expect(MuteButton.item(row) != .resumeMonitoring)
    row.settings.monitored = false
    #expect(MuteButton.item(row) == .resumeMonitoring)
    // A muted balance offers Unmute first.
    row.mute = Mute(until: nil, balance: 0, severity: .empty)
    #expect(MuteButton.item(row) == .unmute)
  }
}
