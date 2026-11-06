import Foundation

/// Per-pool monitoring choices. Thresholds are absolute amounts in the pool's
/// own unit (dollars for OpenRouter, credits for Hunter), never percentages.
public struct PoolSettings: Codable, Equatable, Sendable {
  public var monitored: Bool
  public var low: Double
  public var critical: Double

  public init(monitored: Bool, low: Double, critical: Double) {
    self.monitored = monitored
    self.low = low
    self.critical = critical
  }
}

/// Scopes a pool to its connection: settings never leak across connections.
public struct PoolKey: Hashable, Sendable {
  public var connectionID: String
  public var creditType: String

  public init(connectionID: String, creditType: String) {
    self.connectionID = connectionID
    self.creditType = creditType
  }
}

public enum PoolStatus: String, Equatable, CaseIterable, Sendable {
  case healthy, low, critical, empty
  /// The provider reports this allowance with a cap of zero: the plan does
  /// not include it. Not exhausted usage, so it never alerts.
  case unavailable
  /// No trustworthy reading for this pool (never checked, or not reported).
  case unknown

  /// Precedence: unknown, unavailable, empty (at or below zero), critical,
  /// low, healthy. Threshold comparisons are inclusive.
  public static func of(_ balance: PoolBalance?, settings: PoolSettings) -> PoolStatus {
    guard let balance else { return .unknown }
    if balance.pool.cap == 0 { return .unavailable }
    if balance.balance <= 0 { return .empty }
    if balance.balance <= settings.critical { return .critical }
    if balance.balance <= settings.low { return .low }
    return .healthy
  }

  public var isWarning: Bool { self == .low || self == .critical || self == .empty }
}

/// One panel row: a pool of one connection, with its reading (if any), its
/// settings (saved or default), and the status those produce.
public struct PoolRow: Equatable, Identifiable, Sendable {
  public var key: PoolKey
  public var pool: Pool
  public var balance: Double?
  public var settings: PoolSettings
  public var status: PoolStatus
  /// Muted right now (QUO-393): out of the at-risk count and alerts, but
  /// still on the bird (QUO-419).
  public var muted: Bool { mute != nil }
  /// The mute in force, for its "Muted until" marker.
  public var mute: Mute?
  /// A timed mute ran out while this balance was still alerting.
  public var backFromMute = false

  public var id: PoolKey { key }

  /// Whether this pool would raise an alert: monitored, not muted and
  /// actually running low. Unavailable and unknown pools never count.
  public var alerts: Bool { warns && !muted }

  /// Whether the menu bar bird shows this pool (QUO-419): monitored and
  /// actually running low, muted or not. A mute silences alerts only.
  public var warns: Bool { settings.monitored && status.isWarning }
}

public extension Connection {
  /// The saved settings, else the provider default sized to the balance's
  /// `cap` when it has one (QUO-441). A saved setting is never touched.
  func settings(for creditType: String, cap: Double? = nil) -> PoolSettings {
    poolSettings[creditType] ?? Thresholds.defaults(provider.defaultSettings, cap: cap)
  }

  /// Forgets every mute that is over and leaves no "Back from mute" marker,
  /// so a later low reading alerts as a new incident. Runs on each reading.
  mutating func dropEndedMutes(now: Date) {
    let rows = Dictionary(allPoolRows(at: now).map { ($0.key.creditType, $0) }) { first, _ in first }
    mutes = mutes.filter { rows[$0.key].map { $0.muted || $0.backFromMute } ?? false }
  }

  /// The watched balances (QUO-283): what the panel, stack and alerts use.
  var poolRows: [PoolRow] { poolRows(at: Date()) }

  /// The watched balances as of `now`, which decides whether a timed mute is over.
  func poolRows(at now: Date) -> [PoolRow] { allPoolRows(at: now).filter { isWatched($0.key.creditType) } }

  /// The provider's catalog pools in catalog order (so a pool missing from a
  /// reading still shows, as unknown), then any other reported pools. Watched
  /// or not.
  var allPoolRows: [PoolRow] { allPoolRows(at: Date()) }

  func allPoolRows(at now: Date) -> [PoolRow] {
    let reported = lastReading?.balances ?? []
    var pools = provider.pools
    for item in reported where !pools.contains(where: { $0.creditType == item.pool.creditType }) {
      pools.append(item.pool)
    }
    return pools.map { catalogPool in
      let reading = reported.first { $0.pool.creditType == catalogPool.creditType }
      let settings = settings(for: catalogPool.creditType, cap: reading?.pool.cap ?? catalogPool.cap)
      let status = PoolStatus.of(reading, settings: settings)
      let (mute, back) = Mute.state(mutes[catalogPool.creditType], balance: reading?.balance, status: status, now: now)
      return PoolRow(
        key: PoolKey(connectionID: id, creditType: catalogPool.creditType),
        pool: reading?.pool ?? catalogPool,
        balance: reading?.balance,
        settings: settings,
        status: status,
        mute: mute,
        backFromMute: back
      )
    }
  }
}

/// A balance's mute (QUO-393): until a date, or until the balance goes up.
public struct Mute: Codable, Equatable, Sendable {
  /// When a timed mute ends; nil means "until I top up".
  public var until: Date?
  /// The balance when muted: a top-up mute ends on a reading above it.
  public var balance: Double
  /// The severity when muted: a worse one breaks any mute.
  public var severity: AlertSeverity

  public init(until: Date?, balance: Double, severity: AlertSeverity) {
    self.until = until
    self.balance = balance
    self.severity = severity
  }

  /// Whether the mute is in force, or ran out while still alerting ("Back
  /// from mute"). An unread or healthy balance, a worse status and a top-up
  /// end it outright.
  static func state(_ mute: Mute?, balance: Double?, status: PoolStatus, now: Date) -> (Mute?, Bool) {
    guard let mute, let balance, let severity = AlertSeverity(status: status), severity <= mute.severity else {
      return (nil, false)
    }
    if let until = mute.until { return now < until ? (mute, false) : (nil, true) }
    return balance > mute.balance ? (nil, false) : (mute, false)
  }
}

/// The mute menu's durations. "Always" is the existing monitor setting.
public enum MuteChoice: CaseIterable, Sendable {
  case oneDay, oneWeek, untilTopUp

  public var title: String {
    switch self {
    case .oneDay: return Copy.muteForDay
    case .oneWeek: return Copy.muteForWeek
    case .untilTopUp: return Copy.muteUntilTopUp
    }
  }

  public func mute(balance: Double, severity: AlertSeverity, now: Date, calendar: Calendar = .current) -> Mute {
    switch self {
    case .oneDay: return Mute(until: calendar.date(byAdding: .day, value: 1, to: now), balance: balance, severity: severity)
    case .oneWeek: return Mute(until: calendar.date(byAdding: .day, value: 7, to: now), balance: balance, severity: severity)
    case .untilTopUp: return Mute(until: nil, balance: balance, severity: severity)
    }
  }
}

/// The marker on a muted row: "Muted until Fri" within a week, else a short
/// date, or "Muted until top-up". English, like the rest of the copy.
public enum MuteMarker {
  public static func text(_ mute: Mute, now: Date, calendar: Calendar = .current) -> String {
    guard let until = mute.until else { return Copy.mutedUntilTopUp }
    var style = Date.FormatStyle(locale: Locale(identifier: "en_US"), calendar: calendar, timeZone: calendar.timeZone)
    let withinWeek = until.timeIntervalSince(now) <= 7 * 86_400
    style = withinWeek ? style.weekday(.abbreviated) : style.month(.abbreviated).day()
    return Copy.mutedUntil(until.formatted(style))
  }
}

public enum ThresholdError: Error, Equatable, Sendable {
  case notANumber

  public var message: String { Copy.thresholdNotANumber }
}

public enum Thresholds {
  /// Stored legacy pairs remain valid without being normalized on load.
  public static func validate(_ settings: PoolSettings) -> ThresholdError? {
    guard settings.low.isFinite, settings.low > 0,
      settings.critical.isFinite, settings.critical >= 0,
      settings.low > settings.critical else { return .notANumber }
    return nil
  }

  /// The share of a plan's cap that a default Warn below never exceeds
  /// (QUO-441): a full small plan must not start out low.
  public static let defaultShareOfCap = 0.2

  /// The flat provider default, or 20% of the cap when the flat Warn below
  /// would sit at or above that share. Critical stays one third. No cap (or a
  /// cap of zero, which is "not in plan") keeps the flat default.
  public static func defaults(_ flat: PoolSettings, cap: Double?) -> PoolSettings {
    guard let cap, cap.isFinite, cap > 0 else { return flat }
    let share = cap * defaultShareOfCap
    guard flat.low >= share else { return flat }
    var sized = flat
    sized.low = share
    sized.critical = critical(for: share)
    return sized
  }

  /// Whether a typed Warn below is at or above the balance's cap, so it
  /// would warn from the first reading.
  public static func isAtOrAboveCap(_ warnBelow: Double, cap: Double?) -> Bool {
    guard let cap, cap > 0 else { return false }
    return warnBelow >= cap
  }

  /// One third, floored for Warn below >= 3, otherwise rounded to two decimals.
  public static func critical(for warnBelow: Double) -> Double {
    warnBelow >= 3 ? floor(warnBelow / 3) : (warnBelow / 3 * 100).rounded() / 100
  }

  /// Parses the single editable threshold in the user's locale ("12,5" under
  /// fr_FR). The whole string must be a number: a lenient parse would read
  /// "12.5" under fr_FR as 12. Zero is not a warning threshold.
  public static func parse(_ text: String, locale: Locale = .autoupdatingCurrent) -> Double? {
    let trimmed = text.trimmingCharacters(in: .whitespaces)
    let formatter = NumberFormatter()
    formatter.locale = locale
    formatter.numberStyle = .decimal
    formatter.isLenient = false
    guard let value = formatter.number(from: trimmed)?.doubleValue, value.isFinite, value > 0 else { return nil }
    return value
  }

  /// The field text for a saved threshold, in the locale `parse` reads back.
  public static func text(_ value: Double, locale: Locale = .autoupdatingCurrent) -> String {
    value.formatted(.number.locale(locale).grouping(.never).precision(.fractionLength(0...10)))
  }
}

/// Raw Warn below input. Critical is derived only when this balance is saved.
public struct PoolSettingsDraft: Equatable, Sendable {
  public var monitored: Bool
  public var low: String

  public init(monitored: Bool, low: String) {
    self.monitored = monitored
    self.low = low
  }

  public init(_ settings: PoolSettings) {
    self.init(monitored: settings.monitored, low: Thresholds.text(settings.low))
  }

  public func validated() -> Result<PoolSettings, ThresholdError> {
    guard let low = Thresholds.parse(low) else { return .failure(.notANumber) }
    return .success(PoolSettings(monitored: monitored, low: low, critical: Thresholds.critical(for: low)))
  }

  public var error: ThresholdError? {
    if case let .failure(error) = validated() { return error }
    return nil
  }
}
