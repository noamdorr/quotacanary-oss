import Foundation

/// The watched balances as shown (QUO-309): every balance the panel, the stack
/// window, the menu bar bird and notification routing put on screen, ranked
/// once. Each carries its status, whether it alerts,
/// whether its check is failing, its freshness and its top-up link. Those
/// surfaces are projections of this value; none of them decides any of it.
public struct BalancesAsShown: Sendable {
  public let local: [Connection]
  /// Local connections whose latest check failed.
  public let failingIDs: Set<String>
  private let health: [String: ConnectionHealth]
  private let errors: [String: String]
  private let lastErrors: [String: MonitorError]

  /// `errors` and `lastErrors` are the latest failed check's message and
  /// error by connection id.
  public init(
    local: [Connection], health: [String: ConnectionHealth] = [:],
    errors: [String: String] = [:], lastErrors: [String: MonitorError] = [:]
  ) {
    self.local = local
    self.health = health
    self.errors = errors
    self.lastErrors = lastErrors
    failingIDs = Self.failing(local, health: health, errors: errors)
  }

  /// A connection is failing when its scheduled check failed, or, before the
  /// scheduler has a result, when the last check left an error or a streak.
  static func failing(
    _ connections: [Connection], health: [String: ConnectionHealth], errors: [String: String]
  ) -> Set<String> {
    Set(connections.filter { connection in
      switch health[connection.id] {
      case .failed: return true
      case .offline, .ok: return false
      case .checking, nil:
        return errors[connection.id] != nil || connection.monitoring.consecutiveFailures > 0
      }
    }.map(\.id))
  }

  // MARK: Health

  public func isFailing(_ connection: Connection) -> Bool { failingIDs.contains(connection.id) }

  public func health(of connection: Connection) -> MonitoringHealth {
    .local(connection, failing: isFailing(connection))
  }

  /// The panel header's one freshness line.
  public func freshness(isBusy: Bool) -> PanelFreshness {
    PanelFreshness.of(
      connections: local, failingIDs: failingIDs, isBusy: isBusy,
      anyOffline: health.values.contains { if case .offline = $0 { return true }; return false }
    )
  }

  // MARK: Menu bar bird and notifications

  /// Worst monitored warning across every balance.
  public var severity: AlertSeverity {
    local.worstAlert
  }

  /// Monitored low, critical or empty balances.
  public var poolsAtRisk: Int { local.flatMap(\.poolRows).filter(\.alerts).count }

  /// Every balance a notification can open.
  public var notificationTargets: [PoolKey] {
    local.flatMap { connection in ConnectionPresentation.rankedPools(connection.poolRows).map { $0.key } }
  }

  // MARK: Panel

  /// One line of the menu bar panel.
  public enum PanelLine: Identifiable, Sendable {
    /// A local connection whose checks fail shows one line, not its balances.
    case localFailure(LocalFailure)
    /// `extra` is how many more balances the collapsed line stands for.
    case local(Connection, PoolRow, extra: Int)

    public var id: String {
      switch self {
      case let .localFailure(failure): return "local-failure:" + failure.connection.id
      case let .local(_, row, _): return "local:\(row.key.connectionID)|\(row.key.creditType)"
      }
    }
  }

  public struct LocalFailure: Sendable {
    public let connection: Connection
    public let health: ConnectionHealth?
    /// The full failure message, for VoiceOver and the tooltip.
    public let reason: String
    /// The short failure word on the line itself.
    public let detail: String
  }

  public struct Panel: Sendable {
    /// Needs attention: failing or alerting connections, worst first.
    public let attention: [PanelLine]
    /// The rest, one collapsed line per connection.
    public let quiet: [PanelLine]
    /// Connections in the quiet group, including any without a line.
    public let quietCount: Int
    public let quietHeading: String
  }

  public var panel: Panel {
    let ranked = ConnectionPresentation.ranked(local, failingIDs: failingIDs)
    let needsAttention = { (connection: Connection) in
      connection.poolRows.contains(where: \.alerts) || self.isFailing(connection)
    }
    let attentionLocal = ranked.filter(needsAttention)
    let quietLocal = ranked.filter { !needsAttention($0) }
    var attention: [PanelLine] = []
    for connection in attentionLocal {
      if isFailing(connection) {
        attention.append(.localFailure(LocalFailure(
          connection: connection, health: health[connection.id],
          reason: errors[connection.id] ?? Copy.stackFailing,
          detail: Self.compactFailure(lastErrors[connection.id])
        )))
      } else {
        attention += ConnectionPresentation.rankedPools(connection.poolRows).filter(\.alerts)
          .map { .local(connection, $0, extra: 0) }
      }
    }
    let quiet: [PanelLine] = quietLocal.compactMap { connection in
      ConnectionPresentation.summaryRow(connection.poolRows).map { .local(connection, $0, extra: connection.poolRows.count - 1) }
    }
    let allHealthy = ConnectionPresentation.allHealthy(quietLocal)
    return Panel(
      attention: attention, quiet: quiet, quietCount: quietLocal.count,
      quietHeading: Self.quietHeading(allHealthy: allHealthy, afterAttention: !attention.isEmpty)
    )
  }

  /// The quiet group's heading: whether it may call itself healthy, and
  /// whether a Needs attention group sits above it.
  static func quietHeading(allHealthy: Bool, afterAttention: Bool) -> String {
    switch (allHealthy, afterAttention) {
    case (true, false): return Copy.allHealthySection
    case (true, true): return Copy.healthySection
    case (false, false): return Copy.connectionsSection
    case (false, true): return Copy.otherConnectionsSection
    }
  }

  /// The short failure word on a failing connection's panel line.
  static func compactFailure(_ error: MonitorError?) -> String {
    switch error {
    case .provider(_, .keyRejected): return Copy.compactKeyRejected
    case .provider(_, .keyLacksScope): return Copy.compactKeyPermissions
    case .provider(_, .rateLimited): return Copy.compactRateLimited
    case .provider(_, .unreachable): return Copy.compactUnreachable
    case let .provider(_, .httpStatus(code)): return Copy.compactHTTPStatus(code)
    case .provider(_, .notJSON), .provider(_, .missingField): return Copy.compactInvalidResponse
    case .provider(_, .reportedError): return Copy.compactProviderError
    case .credentialReadFailed, .credentialMissing: return Copy.compactKeyUnavailable
    case .saveFailed: return Copy.compactSaveFailed
    default: return Copy.compactCheckFailed
    }
  }

  // MARK: Stack window

  /// The stack window's rows matching the search and filter, worst first
  /// with stable connection order for ties.
  public func stackItems(query: String = "", filter: ConnectionFilter = .all) -> [StackItem] {
    let localItems = ConnectionPresentation.balances(local, query: query, filter: filter, failingIDs: failingIDs)
      .map(StackItem.local)
    return localItems
  }

  public func health(of item: StackItem) -> MonitoringHealth {
    switch item {
    case let .local(balance): return health(of: balance.connection)
    }
  }
}

/// One stack window row.
public enum StackItem: Identifiable, Sendable {
  case local(PresentedBalance)

  public var id: PoolKey {
    switch self {
    case let .local(item): return item.id
    }
  }

  public var row: PoolRow {
    switch self {
    case let .local(item): return item.row
    }
  }

  /// The catalog's top-up URL.
  public var topupURL: URL? {
    switch self {
    case let .local(item): return item.connection.provider.topupURL
    }
  }

  public var name: String {
    switch self {
    case let .local(item): return item.connection.name
    }
  }
}
