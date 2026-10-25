import Foundation

/// Port of src/lib/burn-eta.ts (QUO-186): days of runway into the brand's
/// phrasing. `short` is the row caption, `long` the inspector sentence.
public struct BurnEta: Codable, Equatable, Sendable {
  public var short: String
  public var long: String

  public init(short: String, long: String) {
    self.short = short
    self.long = long
  }

  /// Same bands as the web: hours under a day, "tomorrow" from 1 to 1.5 days,
  /// days to a week, weeks to 28 days, months to a year. `daysLeft` is nil
  /// when there is no measurable burn.
  public static func format(daysLeft: Double?) -> BurnEta {
    guard let daysLeft else { return BurnEta(short: Copy.etaNoBurnShort, long: Copy.etaNoBurnLong) }
    if daysLeft <= 0 { return BurnEta(short: Copy.etaGoneShort, long: Copy.etaGoneLong) }
    if daysLeft < 1 {
      let hours = max(1, Int((daysLeft * 24).rounded()))
      return BurnEta(short: Copy.etaHoursShort(hours), long: Copy.etaHoursLong(hours))
    }
    if daysLeft < 1.5 { return BurnEta(short: Copy.etaTomorrowShort, long: Copy.etaTomorrowLong) }
    // The web names a weekday here. QUO-184 makes it relative ("in ~3 days")
    // so nobody has to recall today's date; this tracks QUO-184's final
    // wording pick, which is still pending. No weekday names anywhere.
    if daysLeft < 7 {
      let days = Int(daysLeft.rounded())
      return BurnEta(short: Copy.etaDaysShort(days), long: Copy.etaDaysLong(days))
    }
    if daysLeft < 28 {
      let weeks = Int((daysLeft / 7).rounded())
      return BurnEta(short: Copy.etaWeeksShort(weeks), long: Copy.etaDaysLong(Int(daysLeft.rounded())))
    }
    if daysLeft < 365 {
      let months = Int((daysLeft / 30).rounded())
      return BurnEta(short: Copy.etaMonthsShort(months), long: Copy.etaMonthsLong(months))
    }
    return BurnEta(short: Copy.etaNextYearShort, long: Copy.etaNextYearLong)
  }
}

/// Port of src/lib/pool-eta.ts: composes the burn estimate with the ETA
/// wording for one pool row. Nil when there is nothing to say (no reading,
/// or an allowance the plan does not include).
public enum PoolEta {
  public static func of(_ row: PoolRow, history: [HistoryPoint]) -> BurnEta? {
    guard let balance = row.balance, row.status != .unavailable else { return nil }
    // A depleted pool is already gone, even with too few readings to measure
    // a burn. Without this it would read "no burn yet", a self-contradiction.
    if balance <= 0 { return BurnEta.format(daysLeft: 0) }
    switch BurnRate.assess(history) {
    case .collecting: return BurnEta(short: Copy.etaCollectingShort, long: Copy.etaCollectingLong)
    case .noConsumption: return BurnEta(short: Copy.etaNoConsumptionShort, long: Copy.etaNoConsumptionLong)
    case let .burning(rate, _): return BurnEta.format(daysLeft: rate.daysLeft)
    }
  }
}
