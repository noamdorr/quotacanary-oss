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

  var isWarning: Bool { self == .low || self == .critical || self == .empty }
}

/// One panel row: a pool of one connection, with its reading (if any), its
/// settings (saved or default), and the status those produce.
public struct PoolRow: Equatable, Identifiable, Sendable {
  public var key: PoolKey
  public var pool: Pool
  public var balance: Double?
  public var settings: PoolSettings
  public var status: PoolStatus

  public var id: PoolKey { key }

  /// Whether this pool would raise an alert: monitored and actually running
  /// low. Unavailable and unknown pools never count.
  public var alerts: Bool { settings.monitored && status.isWarning }
}

public extension Connection {
  func settings(for creditType: String) -> PoolSettings {
    poolSettings[creditType] ?? provider.defaultSettings
  }

  /// The watched balances (QUO-283): what the panel, stack and alerts use.
  var poolRows: [PoolRow] { allPoolRows.filter { isWatched($0.key.creditType) } }

  /// The provider's catalog pools in catalog order (so a pool missing from a
  /// reading still shows, as unknown), then any other reported pools. Watched
  /// or not.
  var allPoolRows: [PoolRow] {
    let reported = lastReading?.balances ?? []
    var pools = provider.pools
    for item in reported where !pools.contains(where: { $0.creditType == item.pool.creditType }) {
      pools.append(item.pool)
    }
    return pools.map { catalogPool in
      let reading = reported.first { $0.pool.creditType == catalogPool.creditType }
      let settings = settings(for: catalogPool.creditType)
      return PoolRow(
        key: PoolKey(connectionID: id, creditType: catalogPool.creditType),
        pool: reading?.pool ?? catalogPool,
        balance: reading?.balance,
        settings: settings,
        status: PoolStatus.of(reading, settings: settings)
      )
    }
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

  /// One third, floored for Warn below >= 3, otherwise rounded to two decimals.
  public static func critical(for warnBelow: Double) -> Double {
    warnBelow >= 3 ? floor(warnBelow / 3) : (warnBelow / 3 * 100).rounded() / 100
  }

  /// Parses the single editable threshold. Zero is not a warning threshold.
  public static func parse(_ text: String) -> Double? {
    let trimmed = text.trimmingCharacters(in: .whitespaces)
    guard let value = Double(trimmed), value.isFinite, value > 0 else { return nil }
    return value
  }

  public static func text(_ value: Double) -> String {
    if value == value.rounded(), abs(value) < 1e15 { return String(Int64(value)) }
    return String(value)
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
