import Foundation

/// One pool balance at one check. The local history keeps these per pool.
public struct HistoryPoint: Codable, Equatable, Sendable {
  public var balance: Double
  public var recordedAt: Date

  public init(balance: Double, recordedAt: Date) {
    self.balance = balance
    self.recordedAt = recordedAt
  }
}

/// Port of src/lib/burn-rate.ts (QUO-186), same semantics as the web.
public struct BurnRate: Codable, Equatable, Sendable {
  public var perDay: Double
  public var daysLeft: Double

  /// Estimates consumption by summing the balance drops between consecutive
  /// readings, so a mid-window top-up contributes zero rather than cancelling
  /// out the burn that came before it. Nil unless some genuine consumption
  /// happened over a positive time span.
  public static func of(_ history: [HistoryPoint]) -> BurnRate? {
    guard history.count >= 2 else { return nil }
    let sorted = history.sorted { $0.recordedAt < $1.recordedAt }
    let oldest = sorted[0]
    let newest = sorted[sorted.count - 1]
    let days = newest.recordedAt.timeIntervalSince(oldest.recordedAt) / 86_400
    guard days > 0 else { return nil }
    var consumed = 0.0
    for i in 1..<sorted.count {
      let drop = sorted[i - 1].balance - sorted[i].balance
      if drop > 0 { consumed += drop }
    }
    guard consumed > 0 else { return nil }
    let perDay = consumed / days
    return BurnRate(perDay: perDay, daysLeft: newest.balance / perDay)
  }
}

/// What the local history supports saying about consumption (QUO-271).
/// A burn needs the evidence floor (QUO-444): at least `minimumReadings`
/// readings over at least `minimumSpan`. "No consumption observed"
/// additionally needs a flat span of at least `minimumQuietSpanDays`. Below
/// the floor nothing is known, which must never read as "not consuming".
public enum BurnAssessment: Equatable, Sendable {
  case collecting
  case noConsumption(spanDays: Double)
  case burning(BurnRate, spanDays: Double)
}

public extension BurnRate {
  /// A flat balance only counts as "no consumption observed" once the history
  /// spans at least this many days; a shorter flat span is still collecting.
  static let minimumQuietSpanDays = 1.0
  /// QUO-444: no run-out time from fewer readings or a shorter span than this.
  static let minimumReadings = 4
  static let minimumSpan: TimeInterval = 6 * 3600

  static func assess(_ history: [HistoryPoint]) -> BurnAssessment {
    let readings = withoutGlitches(history.sorted { $0.recordedAt < $1.recordedAt })
    guard readings.count >= minimumReadings,
      let first = readings.first, let last = readings.last else { return .collecting }
    let span = last.recordedAt.timeIntervalSince(first.recordedAt)
    guard span >= minimumSpan else { return .collecting }
    let spanDays = span / 86_400
    if let rate = of(readings) { return .burning(rate, spanDays: spanDays) }
    return spanDays >= minimumQuietSpanDays ? .noConsumption(spanDays: spanDays) : .collecting
  }

  /// Drops a reading that departs from both neighbours and is undone by the
  /// next one (its neighbours sit within a tenth of the departure of each
  /// other), so one odd reading cannot create a burn. Steady declines and
  /// refills are untouched. `readings` is sorted oldest first.
  static func withoutGlitches(_ readings: [HistoryPoint]) -> [HistoryPoint] {
    guard readings.count >= 3 else { return readings }
    return readings.enumerated().filter { index, reading in
      guard index > 0, index < readings.count - 1 else { return true }
      let before = readings[index - 1].balance
      let after = readings[index + 1].balance
      let up = reading.balance - before
      let down = reading.balance - after
      guard up * down > 0 else { return true }
      return min(abs(up), abs(down)) < 10 * abs(before - after)
    }.map(\.element)
  }
}
