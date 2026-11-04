@testable import QuotaCanary
import QuotaCanaryCore
import Testing

/// QUO-437: the inspector's mute control is temporary only. Permanent warning
/// participation is its checkbox, so it never offers Stop or Resume monitoring,
/// while the row's context menu keeps both (QUO-398).
@MainActor @Suite struct InspectorMuteTests {
  private func row(_ model: AppModel) throws -> PoolRow {
    try #require(model.connections.first?.poolRows.first)
  }

  /// Hunter's critical balance (its first pool is not in the plan).
  private func alerting(_ model: AppModel) throws -> PoolRow {
    try #require(model.connections.first?.poolRows.first { $0.alerts })
  }

  @Test func unmonitoredBalanceOffersNoInspectorMuteControl() async throws {
    let model = await SnapshotStacks.model(.hunter, system: .preview())
    #expect(model.stopMonitoring(try row(model)) == nil)
    #expect(InspectorMuteButton.item(try row(model)) == nil)
    // The context menu's way back stays.
    #expect(MuteButton.item(try row(model)) == .resumeMonitoring)
  }

  @Test func alertingOffersMuteAndMutedOffersUnmute() async throws {
    let model = await SnapshotStacks.model(.hunter, system: .preview())
    var row = try alerting(model)
    #expect(InspectorMuteButton.item(row) == .mute)
    row.mute = Mute(until: nil, balance: 0, severity: .empty)
    #expect(InspectorMuteButton.item(row) == .unmute)
  }

  @Test func mutingLeavesAWarningsDraftAlone() async throws {
    let model = await SnapshotStacks.model(.hunter, system: .preview())
    let store = DraftStore()
    let saved = try alerting(model)
    let draft = PoolSettingsDraft(monitored: false, low: "123")
    let changed = store.drafts.set(draft, for: saved.key, saved: saved.settings)
    #expect(changed)
    model.setMute(saved.key, .oneDay)
    let after = try #require(model.connections.first?.poolRows.first { $0.key == saved.key })
    #expect(after.muted)
    #expect(after.settings == saved.settings)
    #expect(store.drafts.draft(for: saved.key, saved: saved.settings) == draft)
  }
}
