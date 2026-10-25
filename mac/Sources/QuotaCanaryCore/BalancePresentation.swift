import Foundation

/// Stable balance identity keeps selection attached to its reading after refresh.
public struct PresentedBalance: Identifiable, Equatable, Sendable {
  public let connection: Connection
  public let row: PoolRow
  public var id: PoolKey { row.key }
}

public extension ConnectionPresentation {
  static func balances(
    _ connections: [Connection], query: String = "", filter: ConnectionFilter = .all,
    failingIDs: Set<String> = []
  ) -> [PresentedBalance] {
    let grouped = filtered(connections, query: query, filter: filter, failingIDs: failingIDs)
    let rows = grouped.flatMap { item in
      item.rows.map { PresentedBalance(connection: item.connection, row: $0) }
    }
    // Rank individual balances globally; retain the shared connection order for ties.
    return rows.enumerated().sorted { a, b in
      let left = a.element.row.alerts ? AlertSeverity(status: a.element.row.status) ?? .none : .none
      let right = b.element.row.alerts ? AlertSeverity(status: b.element.row.status) ?? .none : .none
      return left == right ? a.offset < b.offset : left > right
    }.map(\.element)
  }
}

/// Fractions only. Uncapped balances use three times Warn below, without
/// multiplying a potentially large saved threshold and overflowing.
public struct BalanceMeterScale: Equatable, Sendable {
  public let remaining: Double
  public let low: Double
  public let critical: Double

  public init?(_ row: PoolRow) {
    guard let balance = row.balance, balance.isFinite, row.status != .unavailable,
      row.settings.low.isFinite, row.settings.low > 0 else { return nil }
    func fraction(_ value: Double) -> Double {
      let ratio: Double
      if let cap = row.pool.cap, cap > 0 { ratio = value / cap }
      else { ratio = value / row.settings.low / 3 }
      return min(1, max(0, ratio))
    }
    remaining = fraction(balance)
    low = fraction(row.settings.low)
    critical = fraction(row.settings.critical)
  }
}

/// Stack window widths (QUO-269). The table needs `tableMinWidth` to show
/// every column; the inspector folds away by default when the window cannot
/// give it that plus the inspector, and the toolbar toggle overrides that.
public enum StackLayout {
  public static let tableMinWidth: Double = 720
  public static let inspectorWidth: Double = 260
  /// Table, divider and inspector side by side.
  public static let inspectorAutoMinWidth = tableMinWidth + inspectorWidth + 1

  public static func showsInspectorByDefault(width: Double) -> Bool { width >= inspectorAutoMinWidth }
}
