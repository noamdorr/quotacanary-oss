import Foundation
@testable import QuotaCanaryCore
import Testing

/// Mirrors src/lib/burn-rate.test.ts case for case (QUO-186). `day(n)` is
/// midnight on day n of a month, so one unit is exactly one day.
private func day(_ n: Int) -> Date { Date(timeIntervalSince1970: 1_767_225_600 + Double(n - 1) * 86_400) }
private func point(_ balance: Double, _ n: Int) -> HistoryPoint { HistoryPoint(balance: balance, recordedAt: day(n)) }
private func close(_ a: Double, _ b: Double) -> Bool { abs(a - b) < 1e-5 }

@Suite struct BurnRateTests {
  @Test func computesPerDayConsumptionAndDaysLeftOnADownwardTrend() throws {
    // newest 8000 on day 11, oldest 10000 on day 1: 2000 over 10 days = 200/day
    let r = try #require(BurnRate.of([point(8000, 11), point(9000, 6), point(10000, 1)]))
    #expect(close(r.perDay, 200))
    #expect(r.daysLeft == 40)
  }

  @Test func keepsFractionalDaysLeftForSubDayRunway() throws {
    let r = try #require(BurnRate.of([point(104, 3), point(1000, 1)]))
    #expect(close(r.perDay, 448))
    #expect(close(r.daysLeft, 104 / 448))
  }

  @Test func returnsNilForAFlatTrend() {
    #expect(BurnRate.of([point(5000, 10), point(5000, 1)]) == nil)
  }

  @Test func returnsNilForAnIncreasingTrend() {
    #expect(BurnRate.of([point(7000, 10), point(5000, 1)]) == nil)
  }

  @Test func returnsNilWithFewerThanTwoReadings() {
    #expect(BurnRate.of([point(5000, 1)]) == nil)
    #expect(BurnRate.of([]) == nil)
  }

  @Test func returnsNilWhenReadingsShareTheSameTimestamp() {
    #expect(BurnRate.of([point(4000, 1), point(5000, 1)]) == nil)
  }

  @Test func reflectsBurnAfterAMidWindowTopUpInsteadOfMaskingIt() throws {
    // The QUO-59 worked example: decline, refill, decline again. Oldest-vs-newest
    // would see 1000 -> 900 and report ~63 days; the real burn empties it in a week.
    let r = try #require(BurnRate.of([point(1000, 1), point(100, 6), point(1200, 7), point(900, 9)]))
    #expect(close(r.perDay, 150))
    #expect(close(r.daysLeft, 6))
  }

  @Test func sumsConsumptionAcrossMultipleRefillsInTheSameWindow() throws {
    let r = try #require(BurnRate.of([
      point(1000, 1), point(800, 2), point(1600, 3), point(1400, 4), point(2200, 5), point(2000, 6),
    ]))
    #expect(close(r.perDay, 120))
    #expect(close(r.daysLeft, 2000 / 120))
  }

  @Test func stillProjectsARunwayWhenTheMostRecentReadingIsItselfARefill() throws {
    let r = try #require(BurnRate.of([point(1000, 1), point(600, 2), point(1200, 3)]))
    #expect(close(r.perDay, 200))
    #expect(close(r.daysLeft, 6))
  }

  // QUO-271: "not enough history" is not "no consumption".
  @Test func assessmentNeedsTwoReadingsOverATimeSpanBeforeItJudges() {
    #expect(BurnRate.assess([]) == .collecting)
    #expect(BurnRate.assess([point(5000, 1)]) == .collecting)
    #expect(BurnRate.assess([point(4000, 1), point(5000, 1)]) == .collecting)
  }

  @Test func assessmentOfFlatReadingsOverASpanIsNoConsumptionObserved() {
    #expect(BurnRate.assess([point(5000, 10), point(5000, 8), point(5000, 1)]) == .noConsumption(spanDays: 9))
    #expect(BurnRate.assess([point(7000, 10), point(5000, 1)]) == .noConsumption(spanDays: 9))
  }

  @Test func aFlatSpanUnderADayIsStillCollecting() {
    let t = day(1)
    let minutes = [0.0, 5, 10].map { HistoryPoint(balance: 5000, recordedAt: t.addingTimeInterval($0 * 60)) }
    #expect(BurnRate.assess(minutes) == .collecting)
    let almost = [0.0, 23].map { HistoryPoint(balance: 5000, recordedAt: t.addingTimeInterval($0 * 3600)) }
    #expect(BurnRate.assess(almost) == .collecting)
    let full = [0.0, 24].map { HistoryPoint(balance: 5000, recordedAt: t.addingTimeInterval($0 * 3600)) }
    #expect(BurnRate.assess(full) == .noConsumption(spanDays: 1))
  }

  @Test func assessmentOfADeclineCarriesTheRateAndTheSpan() throws {
    let a = BurnRate.assess([point(8000, 11), point(9000, 6), point(10000, 1)])
    guard case let .burning(rate, spanDays) = a else { Issue.record("expected burning, got \(a)"); return }
    #expect(close(rate.perDay, 200))
    #expect(close(spanDays, 10))
  }
}
