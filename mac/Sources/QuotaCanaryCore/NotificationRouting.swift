import Foundation

// A notification click opens the affected balance (QUO-266). The target rides
// in the notification's userInfo as plain strings (macOS stores it with the
// delivered notification, so it survives a relaunch) and is resolved against
// what exists at click time, never against what existed at delivery.

/// Which connection (and, for balance alerts, which pool) a notification is about.
public struct NotificationTarget: Equatable, Sendable {
  public var connectionID: String
  /// nil for monitoring alerts: they are about the connection, not one balance.
  public var creditType: String?

  public init(connectionID: String, creditType: String? = nil) {
    self.connectionID = connectionID
    self.creditType = creditType
  }

  static let connectionKey = "quotacanary.connection"
  static let creditTypeKey = "quotacanary.pool"

  public var userInfo: [String: String] {
    var info = [Self.connectionKey: connectionID]
    if let creditType { info[Self.creditTypeKey] = creditType }
    return info
  }

  /// nil when the notification carries no QuotaCanary target (the test
  /// notification, or one from an older build).
  public init?(userInfo: [AnyHashable: Any]) {
    guard let id = userInfo[Self.connectionKey] as? String, !id.isEmpty else { return nil }
    self.init(connectionID: id, creditType: userInfo[Self.creditTypeKey] as? String)
  }
}

public enum NotificationRoute: Equatable, Sendable {
  /// Open the stack with exactly this balance selected.
  case select(PoolKey)
  /// Open the stack with no selection of ours: the target is gone, or the
  /// notification never had one. The window keeps its own default.
  case openOnly

  /// `available` lists every balance that exists now (local and hosted), best
  /// first. An exact balance wins; a connection-level target, or a balance
  /// that vanished from a connection that still exists, selects that
  /// connection's first balance; a removed connection falls back to `openOnly`.
  public static func resolve(_ target: NotificationTarget?, available: [PoolKey]) -> NotificationRoute {
    guard let target else { return .openOnly }
    if let creditType = target.creditType {
      let exact = PoolKey(connectionID: target.connectionID, creditType: creditType)
      if available.contains(exact) { return .select(exact) }
    }
    if let first = available.first(where: { $0.connectionID == target.connectionID }) { return .select(first) }
    return .openOnly
  }
}
