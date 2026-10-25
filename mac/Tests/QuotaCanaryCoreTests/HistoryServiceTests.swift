import Foundation
@testable import QuotaCanaryCore
import Testing

private let credits = PoolKey(connectionID: "conn-1", creditType: OpenRouter.creditsPool.creditType)
private func openRouter(_ credits: Double) -> ScriptedTransport.Step {
  .respond(status: 200, body: #"{"data":{"total_credits":\#(credits),"total_usage":0}}"#)
}

/// Every successful check lands in the local history (QUO-186).
@MainActor @Suite struct HistoryServiceTests {
  @Test func connectAndRefreshAppendToHistory() async throws {
    let h = Harness([openRouter(20), openRouter(18), openRouter(15)])
    try await h.service.connect(provider: .openrouter, key: secret)
    h.clock = t0.addingTimeInterval(3600)
    try await h.service.refresh(id: "conn-1")
    h.clock = t0.addingTimeInterval(7200)
    try await h.service.refresh(id: "conn-1")
    #expect(h.service.history.points(for: credits) == [
      HistoryPoint(balance: 20, recordedAt: t0),
      HistoryPoint(balance: 18, recordedAt: t0.addingTimeInterval(3600)),
      HistoryPoint(balance: 15, recordedAt: t0.addingTimeInterval(7200)),
    ])
    #expect(try h.history.load() == h.service.history)
    // Three checks over two hours on a declining balance: a burn and an ETA.
    let rate = try #require(BurnRate.of(h.service.history(for: credits)))
    #expect(abs(rate.perDay - 60) < 1e-9)
    #expect(abs(rate.daysLeft - 0.25) < 1e-9)
  }

  @Test func replaceKeyAppendsItsReading() async throws {
    let h = Harness([openRouter(20), openRouter(12)])
    try await h.service.connect(provider: .openrouter, key: secret)
    h.clock = t0.addingTimeInterval(60)
    try await h.service.replaceKey(id: "conn-1", key: "new-key")
    #expect(h.service.history.points(for: credits).map(\.balance) == [20, 12])
  }

  @Test func removeDropsTheConnectionsHistory() async throws {
    let h = Harness([openRouter(20)])
    try await h.service.connect(provider: .openrouter, key: secret)
    try h.service.remove(id: "conn-1")
    #expect(h.service.history.points(for: credits).isEmpty)
    #expect(try h.history.load() == ReadingHistory())
  }

  @Test func failedCheckWritesNoHistory() async throws {
    let h = Harness([openRouter(20), .respond(status: 500, body: "{}")])
    try await h.service.connect(provider: .openrouter, key: secret)
    h.clock = t0.addingTimeInterval(60)
    _ = await monitorError { try await h.service.refresh(id: "conn-1") }
    #expect(h.service.history.points(for: credits).map(\.balance) == [20])
  }

  /// A relaunch loads the saved history; a state file with only
  /// lastReading (no history.json yet) starts empty and does not fail.
  @Test func restoreLoadsHistoryAndToleratesNone() async throws {
    let h = Harness([openRouter(20), openRouter(18)])
    try await h.service.connect(provider: .openrouter, key: secret)
    h.clock = t0.addingTimeInterval(3600)
    try await h.service.refresh(id: "conn-1")
    let relaunched = h.makeService()
    try relaunched.restore()
    #expect(relaunched.history.points(for: credits).map(\.balance) == [20, 18])

    let upgrade = Harness([openRouter(20)])
    try upgrade.store.save(h.service.connections) // lastReading only, no history
    try upgrade.service.restore()
    #expect(upgrade.service.connections.first?.lastReading?.balances.first?.balance == 18)
    #expect(upgrade.service.history == ReadingHistory())
    #expect(upgrade.service.history(for: credits).isEmpty)
  }

  /// The reading is the source of truth; a history write that fails never
  /// turns a good check into a failed one.
  @Test func historySaveFailureKeepsTheReading() async throws {
    let h = Harness([openRouter(20), openRouter(18)])
    try await h.service.connect(provider: .openrouter, key: secret)
    h.history.failSaves = true
    h.clock = t0.addingTimeInterval(60)
    let updated = try await h.service.refresh(id: "conn-1")
    #expect(updated.lastReading?.balances.first?.balance == 18)
    #expect(h.service.history.points(for: credits).map(\.balance) == [20, 18])
  }

  /// Burn reads the raw 7-day window; the sparkline reads the 6-hour sample.
  /// Both move with the service clock.
  @Test func historyAndSparklineAreTheSevenDayWindowAtTheServiceClock() async throws {
    let h = Harness([openRouter(20), openRouter(19), openRouter(18)])
    try await h.service.connect(provider: .openrouter, key: secret)
    h.clock = t0.addingTimeInterval(1800)
    try await h.service.refresh(id: "conn-1")
    h.clock = t0.addingTimeInterval(7200)
    try await h.service.refresh(id: "conn-1")
    #expect(h.service.history(for: credits).map(\.balance) == [20, 19, 18])
    // t0 and t0+30m share a 6-hour bucket (its edge is at t0+1h46m); t0+2h does not.
    #expect(h.service.sparkline(for: credits).map(\.balance) == [19, 18])
    h.clock = t0.addingTimeInterval(10 * 86_400)
    #expect(h.service.history(for: credits).isEmpty)
    #expect(h.service.sparkline(for: credits).map(\.balance) == [18]) // newest overall, as the web
  }
}
