import Foundation

public enum ConnectionFilter: String, CaseIterable, Identifiable, Sendable {
  case all, atRisk, failing

  public var id: String { rawValue }
}

/// A connection plus the pools visible in the current search and filter.
/// Keeps the original connection intact for account and threshold editing.
public struct PresentedConnection: Identifiable, Equatable, Sendable {
  public var connection: Connection
  public var rows: [PoolRow]

  public var id: String { connection.id }
}

/// Shared ordering for the compact popover and full connections window.
/// These transformations never change persisted connections or readings.
public enum ConnectionPresentation {
  public static func ranked(_ connections: [Connection], failingIDs: Set<String> = []) -> [Connection] {
    connections.sorted { a, b in
      let aSeverity = severity(a.poolRows)
      let bSeverity = severity(b.poolRows)
      if aSeverity != bSeverity { return aSeverity > bSeverity }
      if failingIDs.contains(a.id) != failingIDs.contains(b.id) { return failingIDs.contains(a.id) }
      let aName = normalized(a.name)
      let bName = normalized(b.name)
      if aName != bName { return aName < bName }
      return a.id < b.id
    }
  }

  /// Unmonitored warnings do not outrank pools that need action.
  public static func rankedPools(_ rows: [PoolRow]) -> [PoolRow] {
    rows.sorted { a, b in
      let aSeverity = severity([a])
      let bSeverity = severity([b])
      if aSeverity != bSeverity { return aSeverity > bSeverity }
      let aLabel = normalized(a.pool.label)
      let bLabel = normalized(b.pool.label)
      if aLabel != bLabel { return aLabel < bLabel }
      if a.key.creditType != b.key.creditType { return a.key.creditType < b.key.creditType }
      return a.key.connectionID < b.key.connectionID
    }
  }

  /// Name/provider matches show every eligible pool; a pool-label match
  /// shows only that pool. At-risk filtering never includes healthy siblings.
  public static func filtered(
    _ connections: [Connection], query: String = "", filter: ConnectionFilter = .all,
    failingIDs: Set<String> = []
  ) -> [PresentedConnection] {
    let query = normalized(query.trimmingCharacters(in: .whitespacesAndNewlines))
    return ranked(connections, failingIDs: failingIDs).compactMap { connection in
      if filter == .failing && !failingIDs.contains(connection.id) { return nil }
      var rows = rankedPools(connection.poolRows)
      if filter == .atRisk { rows = rows.filter(\.alerts) }
      let matchesConnection = query.isEmpty || normalized(connection.name).contains(query)
        || normalized(connection.provider.displayName).contains(query)
      if !matchesConnection { rows = rows.filter { normalized($0.pool.label).contains(query) } }
      guard !rows.isEmpty || (matchesConnection && filter != .atRisk) else { return nil }
      return PresentedConnection(connection: connection, rows: rows)
    }
  }

  /// The one balance a collapsed quiet row shows: the one most worth a look,
  /// first in catalog order on ties, so a healthy first balance never hides a
  /// sibling that is low, empty or unread, even with monitoring off (QUO-160).
  public static func summaryRow(_ rows: [PoolRow]) -> PoolRow? {
    rows.max { concern($0.status) < concern($1.status) }
  }

  /// Whether the quiet group may call itself healthy: every balance has a
  /// healthy reading or is not in the plan, and each connection has at least
  /// one healthy reading. No alert alone is not a healthy balance (QUO-160).
  public static func allHealthy(_ connections: [Connection]) -> Bool {
    connections.allSatisfy { connection in
      let statuses = connection.poolRows.map(\.status)
      return statuses.contains(.healthy) && statuses.allSatisfy { $0 == .healthy || $0 == .unavailable }
    }
  }

  /// Exclude failed connections so stale failure data never supplies the panel's Checked time.
  public static func oldestSuccessfulCheck(_ connections: [Connection], failingIDs: Set<String>) -> Date? {
    connections.filter { !failingIDs.contains($0.id) }.compactMap { $0.lastReading?.checkedAt }.min()
  }

  private static func severity(_ rows: [PoolRow]) -> AlertSeverity {
    rows.filter(\.alerts).compactMap { AlertSeverity(status: $0.status) }.max() ?? .none
  }

  private static func concern(_ status: PoolStatus) -> Int {
    switch status {
    case .unavailable: return 0
    case .healthy: return 1
    case .unknown: return 2
    case .low: return 3
    case .critical: return 4
    case .empty: return 5
    }
  }

  private static func normalized(_ value: String) -> String {
    value.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: Locale(identifier: "en_US_POSIX"))
  }
}
