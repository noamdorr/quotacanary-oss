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
/// A burn needs what `BurnRate.of` requires: two readings over a positive time
/// span. "No consumption observed" additionally needs a flat span of at least
/// `minimumQuietSpanDays`. Below that nothing is known, which must never read
/// as "not consuming".
public enum BurnAssessment: Equatable, Sendable {
  case collecting
  case noConsumption(spanDays: Double)
  case burning(BurnRate, spanDays: Double)
}

public extension BurnRate {
  /// A flat balance only counts as "no consumption observed" once the history
  /// spans at least this many days; a shorter flat span is still collecting.
  static let minimumQuietSpanDays = 1.0

  static func assess(_ history: [HistoryPoint]) -> BurnAssessment {
    guard history.count >= 2 else { return .collecting }
    let times = history.map(\.recordedAt)
    let spanDays = (times.max()!.timeIntervalSince(times.min()!)) / 86_400
    guard spanDays > 0 else { return .collecting }
    if let rate = of(history) { return .burning(rate, spanDays: spanDays) }
    return spanDays >= minimumQuietSpanDays ? .noConsumption(spanDays: spanDays) : .collecting
  }
}
