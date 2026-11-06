import Foundation
@testable import QuotaCanaryCore
import Testing

private let searches = ProviderID.hunter.pools[0]
private let settings = PoolSettings(monitored: true, low: 100, critical: 20)
private let t = Date(timeIntervalSince1970: 1_767_225_600)
private func row(_ balance: Double?, cap: Double? = 1000) -> PoolRow {
  var pool = searches
  pool.cap = cap
  let reading = balance.map { PoolBalance(pool: pool, balance: $0) }
  return PoolRow(
    key: PoolKey(connectionID: "c1", creditType: pool.creditType), pool: pool, balance: balance,
    settings: settings, status: PoolStatus.of(reading, settings: settings)
  )
}
private func points(_ balances: [Double]) -> [HistoryPoint] {
  balances.enumerated().map { HistoryPoint(balance: $1, recordedAt: t.addingTimeInterval(Double($0) * 2 * 3600)) }
}
// QUO-444: the ETA is read at the newest reading, so ageing never enters these cases.
private func eta(_ row: PoolRow, history: [HistoryPoint]) -> BurnEta? {
  PoolEta.of(row, history: history, now: history.map(\.recordedAt).max() ?? t)
}

/// Mirrors src/lib/pool-eta.ts: the ETA a pool row shows, if any.
@Suite struct PoolEtaTests {
  @Test func declineOverFourChecksGivesABurnAndARelativeEta() {
    // 1000 -> 640 over six hours: 1440/day, 640 left = 0.44 days.
    #expect(eta(row(640), history: points([1000, 880, 760, 640]))
      == BurnEta(short: "in ~11h", long: "Empties in ~11 hours."))
    // 600/day, 850 left = 1.42 days.
    #expect(eta(row(850), history: points([1000, 950, 900, 850]))?.short == "tomorrow")
    // 240/day, 940 left = 3.92 days. Relative, never a weekday.
    #expect(eta(row(940), history: points([1000, 980, 960, 940]))
      == BurnEta(short: "in ~4 days", long: "Empties in ~4 days."))
  }

  @Test func freshInstallIsCollectingAndAFlatSpanIsNoConsumptionObserved() {
    let collecting = BurnEta(short: "collecting history", long: "Collecting history.")
    #expect(eta(row(880), history: []) == collecting)
    #expect(eta(row(880), history: points([880])) == collecting)
    // Flat over a real span is a measurement, not a gap in the evidence.
    let none = BurnEta(short: "not draining", long: "Not draining.")
    #expect(eta(row(880), history: points(Array(repeating: 880, count: 25))) == none)
    // Flat over four hours is too soon to say.
    #expect(eta(row(880), history: points([880, 880, 880])) == collecting)
  }

  @Test func aDepletedPoolIsAlreadyGoneEvenWithoutAMeasurableBurn() {
    #expect(eta(row(0), history: []) == BurnEta(short: "empty now", long: "Already empty."))
  }

  @Test func unreadAndNotInPlanPoolsHaveNoEta() {
    #expect(eta(row(nil), history: []) == nil)
    #expect(eta(row(0, cap: 0), history: points([0, 0])) == nil)
  }
}
