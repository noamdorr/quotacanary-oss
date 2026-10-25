import Foundation
@testable import QuotaCanaryCore
import Testing

private func presentationConnection(
  _ id: String, name: String? = nil, balances: [Double] = [900, 900]
) -> Connection {
  let pools = ProviderID.hunter.pools
  return Connection(
    id: id, provider: .hunter, name: name ?? id, credentialRef: id,
    lastReading: Reading(
      balances: zip(pools, balances).map { PoolBalance(pool: $0.0, balance: $0.1) },
      checkedAt: Date(timeIntervalSince1970: 0)
    ),
    poolSettings: Dictionary(uniqueKeysWithValues: pools.map {
      ($0.creditType, PoolSettings(monitored: true, low: 300, critical: 100))
    })
  )
}

@Suite struct ConnectionPresentationTests {
  @Test func panelCheckUsesOldestSuccessExcludingFailuresAndMissingReads() {
    var old = presentationConnection("old")
    var recent = presentationConnection("recent")
    var failed = presentationConnection("failed")
    var unread = presentationConnection("unread")
    old.lastReading?.checkedAt = Date(timeIntervalSince1970: 100)
    recent.lastReading?.checkedAt = Date(timeIntervalSince1970: 200)
    failed.lastReading?.checkedAt = Date(timeIntervalSince1970: 10)
    unread.lastReading = nil
    #expect(ConnectionPresentation.oldestSuccessfulCheck([old, recent, failed, unread], failingIDs: ["failed"])
      == Date(timeIntervalSince1970: 100))
    #expect(ConnectionPresentation.oldestSuccessfulCheck([failed, unread], failingIDs: ["failed"]) == nil)
  }

  @Test func warningsRankBySeverityThenFailureThenName() {
    let all = [
      presentationConnection("healthy"), presentationConnection("low", balances: [250, 900]),
      presentationConnection("empty", balances: [0, 900]),
      presentationConnection("critical", balances: [50, 900]),
      presentationConnection("failed", name: "Zebra"),
      presentationConnection("failed-low", name: "Zebra", balances: [250, 900]),
    ]
    #expect(ConnectionPresentation.ranked(all, failingIDs: ["failed", "failed-low"]).map(\.id)
      == ["empty", "critical", "failed-low", "low", "failed", "healthy"])
  }

  @Test func tiesHaveStableNameAndIDOrderIndependentOfInput() {
    let all = [presentationConnection("z", name: "Alpha"), presentationConnection("a", name: "ÁLPHA"),
      presentationConnection("b", name: "Beta")]
    #expect(ConnectionPresentation.ranked(all).map(\.id) == ["a", "z", "b"])
    #expect(ConnectionPresentation.ranked(all.reversed()).map(\.id) == ["a", "z", "b"])
  }

  @Test func poolOrderUsesSeverityThenLabelAndStableID() {
    let source = presentationConnection("account", balances: [0, 50])
    let ranked = ConnectionPresentation.rankedPools(source.poolRows.reversed())
    #expect(ranked.map(\.status) == [.empty, .critical])
    var first = ranked[0]
    var second = ranked[0]
    first.key.creditType = "z"
    first.pool.label = "ÁLPHA"
    second.key.creditType = "a"
    second.pool.label = "Alpha"
    #expect(ConnectionPresentation.rankedPools([first, second]).map(\.key.creditType) == ["a", "z"])
  }

  @Test func unmonitoredEmptyPoolDoesNotMoveConnectionToTop() {
    var muted = presentationConnection("muted", balances: [0, 900])
    muted.poolSettings[ProviderID.hunter.pools[0].creditType]?.monitored = false
    let low = presentationConnection("low", balances: [250, 900])
    #expect(ConnectionPresentation.ranked([muted, low]).map(\.id) == ["low", "muted"])
    #expect(ConnectionPresentation.filtered([muted], filter: .atRisk).isEmpty)
  }

  @Test func atRiskShowsOnlyAlertingPoolsAndRetainsOriginalForEditing() {
    let mixed = presentationConnection("mixed", balances: [250, 900])
    let results = ConnectionPresentation.filtered([mixed, presentationConnection("healthy")], filter: .atRisk)
    #expect(results.count == 1)
    #expect(results.first?.rows.map(\.status) == [.low])
    #expect(results.first?.connection == mixed)
  }

  @Test func searchFindsNameProviderAndPoolIgnoringAccentsAndCase() {
    let connection = presentationConnection("a", name: "Équipe")
    #expect(ConnectionPresentation.filtered([connection], query: " EQUIPE \n").first?.rows.count == 2)
    #expect(ConnectionPresentation.filtered([connection], query: "HUNTER").first?.rows.count == 2)
    let label = ProviderID.hunter.pools[0].label.uppercased()
    let results = ConnectionPresentation.filtered([connection], query: label)
    #expect(results.first?.rows.map(\.key.creditType) == [ProviderID.hunter.pools[0].creditType])
    #expect(ConnectionPresentation.filtered([connection], query: "unmatched").isEmpty)
  }

  @Test func queryAndFilterIntersectRatherThanRestoringHiddenSiblings() {
    let connection = presentationConnection("a", balances: [250, 900])
    let healthyLabel = ProviderID.hunter.pools[1].label
    #expect(ConnectionPresentation.filtered([connection], query: healthyLabel, filter: .atRisk).isEmpty)
    #expect(ConnectionPresentation.filtered([connection], query: "Hunter", filter: .atRisk).first?.rows.count == 1)
    #expect(ConnectionPresentation.filtered([connection], query: "unmatched", filter: .failing, failingIDs: ["a"]).isEmpty)
  }

  @Test func failingFilterIncludesOnlyCurrentFailuresAndMissingReadingsStayVisible() {
    var unread = presentationConnection("unread")
    unread.lastReading = nil
    let results = ConnectionPresentation.filtered([unread, presentationConnection("healthy")], filter: .failing, failingIDs: ["unread"])
    #expect(results.map(\.id) == ["unread"])
    #expect(results.first?.rows.allSatisfy { $0.status == .unknown } == true)
    #expect(ConnectionPresentation.filtered([unread]).count == 1)
    #expect(ConnectionPresentation.filtered([unread], filter: .atRisk).isEmpty)
    #expect(ConnectionPresentation.filtered([unread], filter: .failing).isEmpty)
  }

  @Test func countCountsPoolsAcrossAccountsAndFallsOnRecovery() {
    var warning = presentationConnection("warning", balances: [0, 250])
    let critical = presentationConnection("critical", balances: [50, 900])
    #expect([warning, critical].poolsAtRisk == 3)
    warning.lastReading?.balances[0].balance = 900
    #expect([warning, critical].poolsAtRisk == 2)
    warning.lastReading?.balances[1].balance = 900
    #expect([warning].poolsAtRisk == 0)
    #expect([Connection]().poolsAtRisk == 0)
  }

  @Test func countExcludesMutedUnavailableAndUnknownPools() {
    var muted = presentationConnection("muted", balances: [0, 900])
    muted.poolSettings[ProviderID.hunter.pools[0].creditType]?.monitored = false
    var unavailable = presentationConnection("unavailable", balances: [0, 900])
    unavailable.lastReading?.balances[0].pool.cap = 0
    var unread = presentationConnection("unknown")
    unread.lastReading = nil
    #expect([muted, unavailable, unread].poolsAtRisk == 0)
    #expect(ConnectionPresentation.filtered([muted, unavailable, unread], filter: .atRisk).isEmpty)
  }
}
