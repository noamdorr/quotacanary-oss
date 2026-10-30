import Foundation
@testable import QuotaCanaryCore
import Testing

/// Mirrors src/lib/burn-eta.test.ts, except the 1.5 to 7 day band, which is
/// relative on Mac per QUO-184 (no weekday names anywhere).
@Suite struct BurnEtaTests {
  @Test func returnsADeadOnArrivalVerdictForZeroBalanceRunway() {
    #expect(BurnEta.format(daysLeft: 0) == BurnEta(short: "empty now", long: "Already empty."))
  }

  @Test func usesHoursWhenUnderADay() {
    #expect(BurnEta.format(daysLeft: 0.25) == BurnEta(short: "in ~6h", long: "Empties in ~6 hours."))
  }

  @Test func usesRelativeDaysNotAWeekdayWhenUnderAWeekOut() {
    #expect(BurnEta.format(daysLeft: 2) == BurnEta(short: "in ~2 days", long: "Empties in ~2 days."))
    #expect(BurnEta.format(daysLeft: 3) == BurnEta(short: "in ~3 days", long: "Empties in ~3 days."))
    #expect(BurnEta.format(daysLeft: 5.6) == BurnEta(short: "in ~6 days", long: "Empties in ~6 days."))
  }

  @Test func usesTomorrowForRoughlyOneDayOut() {
    #expect(BurnEta.format(daysLeft: 1) == BurnEta(short: "tomorrow", long: "Empties tomorrow."))
  }

  @Test func usesWeeksWhenUnder28Days() {
    #expect(BurnEta.format(daysLeft: 16) == BurnEta(short: "in ~2 weeks", long: "Empties in ~16 days."))
  }

  @Test func usesMonthsWhenUnderAYear() {
    #expect(BurnEta.format(daysLeft: 90) == BurnEta(short: "in ~3 months", long: "Empties in ~3 months."))
  }

  @Test func treatsNilAsNoMeasurableBurn() {
    #expect(BurnEta.format(daysLeft: nil) == BurnEta(short: "no burn yet", long: "Not draining yet."))
  }

  @Test func usesSingularHourAtExactlyOneHour() {
    #expect(BurnEta.format(daysLeft: 1 / 24) == BurnEta(short: "in ~1h", long: "Empties in ~1 hour."))
  }

  @Test func plentyOfRunwayPastAYear() {
    #expect(BurnEta.format(daysLeft: 400) == BurnEta(short: "next year or later", long: "Plenty of runway."))
  }

  /// No ETA string, at any runway, names a day of the week (QUO-184).
  @Test func noWeekdayNameInAnyEtaString() throws {
    let weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    var outputs: [String] = ["\(BurnEta.format(daysLeft: nil))"]
    for tenths in stride(from: 0, through: 4000, by: 1) {
      let eta = BurnEta.format(daysLeft: Double(tenths) / 10)
      outputs.append(eta.short)
      outputs.append(eta.long)
    }
    // And the Copy source itself, so a future string cannot sneak one in.
    let copySource = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
      .appendingPathComponent("Sources/QuotaCanaryCore/Copy.swift")
    outputs.append(try String(contentsOf: copySource, encoding: .utf8))
    for text in outputs {
      for weekday in weekdays {
        #expect(!text.contains(weekday), "weekday \(weekday) found in: \(text.prefix(80))")
      }
    }
  }
}
