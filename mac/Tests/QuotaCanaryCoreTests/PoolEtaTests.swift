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
  balances.enumerated().map { HistoryPoint(balance: $1, recordedAt: t.addingTimeInterval(Double($0) * 3600)) }
}

/// Mirrors src/lib/pool-eta.ts: the ETA a pool row shows, if any.
@Suite struct PoolEtaTests {
  @Test func declineOverThreeChecksGivesABurnAndARelativeEta() {
    // 1000 -> 940 -> 880 over two hours: 1440/day, 880 left = 0.61 days.
    #expect(PoolEta.of(row(880), history: points([1000, 940, 880]))
      == BurnEta(short: "in ~15h", long: "Empties in ~15 hours."))
    // 1000 -> 970 -> 940: 720/day, 940 left = 1.31 days.
    #expect(PoolEta.of(row(940), history: points([1000, 970, 940]))?.short == "tomorrow")
    // 1000 -> 990 -> 980: 240/day, 980 left = 4.08 days. Relative, never a weekday.
    #expect(PoolEta.of(row(980), history: points([1000, 990, 980]))
      == BurnEta(short: "in ~4 days", long: "Empties in ~4 days."))
  }

  @Test func freshInstallIsCollectingAndAFlatSpanIsNoConsumptionObserved() {
    let collecting = BurnEta(short: "collecting history", long: "Collecting history.")
    #expect(PoolEta.of(row(880), history: []) == collecting)
    #expect(PoolEta.of(row(880), history: points([880])) == collecting)
    // Flat over a real span is a measurement, not a gap in the evidence.
    let none = BurnEta(short: "not draining", long: "Not draining.")
    #expect(PoolEta.of(row(880), history: points(Array(repeating: 880, count: 25))) == none)
    // Flat over two hours is too soon to say.
    #expect(PoolEta.of(row(880), history: points([880, 880, 880])) == collecting)
  }

  @Test func aDepletedPoolIsAlreadyGoneEvenWithoutAMeasurableBurn() {
    #expect(PoolEta.of(row(0), history: []) == BurnEta(short: "empty now", long: "Already empty."))
  }

  @Test func unreadAndNotInPlanPoolsHaveNoEta() {
    #expect(PoolEta.of(row(nil), history: []) == nil)
    #expect(PoolEta.of(row(0, cap: 0), history: points([0, 0])) == nil)
  }
}
