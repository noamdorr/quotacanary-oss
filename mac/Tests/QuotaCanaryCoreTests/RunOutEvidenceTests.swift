import Foundation
@testable import QuotaCanaryCore
import Testing

private let now = Date(timeIntervalSince1970: 1_767_225_600)
private let hunter = ProviderID.hunter.pools[0]
private let settings = PoolSettings(monitored: true, low: 100, critical: 20)

private func row(_ balance: Double) -> PoolRow {
  var pool = hunter
  pool.cap = 10_000
  return PoolRow(
    key: PoolKey(connectionID: "c1", creditType: pool.creditType), pool: pool, balance: balance,
    settings: settings, status: PoolStatus.of(PoolBalance(pool: pool, balance: balance), settings: settings)
  )
}

/// `balances` oldest first, `every` seconds apart, the newest at `end`.
private func series(_ balances: [Double], every: TimeInterval, end: Date = now) -> [HistoryPoint] {
  balances.enumerated().map { index, balance in
    HistoryPoint(balance: balance, recordedAt: end.addingTimeInterval(-Double(balances.count - 1 - index) * every))
  }
}

/// QUO-444 (audit F04): the run-out time needs a minimum of evidence and ages
/// with the reading it came from.
@Suite struct RunOutEvidenceTests {
  /// 29 checks six hours apart over a week, 10,000 down to 8,600: 200/day.
  private var steadyWeek: [HistoryPoint] {
    series((0...28).map { 10_000 - Double($0) * 50 }, every: 6 * 3600)
  }

  @Test func aWeekOfSteadyDeclineKeepsItsRunOutTime() throws {
    // Pinned before the floor was added: 1,400 over 7 days = 200/day, 8,600 left = 43 days.
    guard case let .burning(rate, spanDays) = BurnRate.assess(steadyWeek) else {
      Issue.record("a steady week must be burning")
      return
    }
    #expect(abs(rate.perDay - 200) < 1e-6)
    #expect(abs(rate.daysLeft - 43) < 1e-6)
    #expect(abs(spanDays - 7) < 1e-9)
    #expect(PoolEta.of(row(8_600), history: steadyWeek, now: now) == BurnEta(short: "in ~1 month", long: "Empties in ~1 month."))
  }

  @Test func twoChecksFiveMinutesApartAreStillCollecting() {
    let history = series([9_990, 9_940], every: 300)
    #expect(BurnRate.assess(history) == .collecting)
    #expect(PoolEta.of(row(9_940), history: history, now: now)
      == BurnEta(short: "collecting history", long: "Collecting history."))
  }

  @Test func theFloorIsSixHoursAndFourReadings() {
    // Four readings over five hours: not enough span.
    #expect(BurnRate.assess(series([100, 90, 80, 70], every: 5 * 3600 / 3)) == .collecting)
    // Six hours but three readings: not enough readings.
    #expect(BurnRate.assess(series([100, 90, 80], every: 3 * 3600)) == .collecting)
    // Four readings over exactly six hours is enough.
    guard case .burning = BurnRate.assess(series([100, 90, 80, 70], every: 2 * 3600)) else {
      Issue.record("four readings over six hours must be burning")
      return
    }
  }

  @Test func aFlatWeekWithOneGlitchReadingHasNoBurn() {
    var balances = Array(repeating: 6_000.0, count: 8)
    balances[4] = 60_000
    let history = series(balances, every: 86_400)
    #expect(BurnRate.assess(history) == .noConsumption(spanDays: 7))
    #expect(PoolEta.of(row(6_000), history: history, now: now)?.short == "not draining")
  }

  @Test func aGenuineDeclineIsNotMistakenForAGlitch() {
    // Steady steps and a top-up in the middle are real consumption.
    guard case .burning = BurnRate.assess(series([1_000, 900, 800, 700, 600], every: 6 * 3600)) else {
      Issue.record("steady decline must burn")
      return
    }
    guard case .burning = BurnRate.assess(series([1_000, 100, 1_200, 900], every: 3 * 3600)) else {
      Issue.record("a decline, refill and decline must burn")
      return
    }
  }

  @Test func theEstimateIsCountedFromTheReadingsTime() {
    // 1,000/day with 500 left: 12 hours when read.
    let history = series([1_500, 1_250, 1_000, 750, 500], every: 6 * 3600)
    #expect(PoolEta.of(row(500), history: history, now: now)?.short == "in ~12h")
    // An hour later, with the next check late: 11 hours, not 12.
    #expect(PoolEta.of(row(500), history: history, now: now.addingTimeInterval(3600))?.short == "in ~11h")
  }

  @Test func anOldReadingNeverPresentsItsEstimateAsCurrent() {
    let history = series([1_500, 1_250, 1_000, 750, 500], every: 6 * 3600)
    #expect(PoolEta.of(row(500), history: history, now: now.addingTimeInterval(3 * 86_400)) == nil)
    // Even a long runway is not claimed from a three-day-old reading.
    let slow = series([10_000, 9_990, 9_980, 9_970, 9_960], every: 6 * 3600)
    #expect(PoolEta.of(row(9_960), history: slow, now: now.addingTimeInterval(3 * 86_400)) == nil)
  }
}

/// The `--snapshot` scenario for the four states (QUO-444) keeps saying what it is named for.
@MainActor @Suite struct RunOutEvidenceScenarioTests {
  @Test func eachScenarioConnectionLandsInItsState() async throws {
    let scenario = StackScenario.runOutEvidence
    let service = scenario.service()
    try service.restore()
    let first = service.connections.map { $0.poolRows.first! }
    let states = first.map { BurnRate.assess(service.history(for: $0.key)) }
    #expect(states[0] == .collecting)
    #expect(states[1] != .collecting)  // a real steady week, but...
    #expect(PoolEta.of(first[1], history: service.history(for: first[1].key), now: service.currentTime) == nil)
    #expect(states[2] == .noConsumption(spanDays: 7))
    guard case .burning = states[3] else { Issue.record("a 0.1% dip is still a measured burn"); return }
  }
}
