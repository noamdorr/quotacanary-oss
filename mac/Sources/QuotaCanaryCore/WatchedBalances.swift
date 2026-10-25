import Foundation

/// Which of a connection's balances are watched (QUO-283). A tool that reports
/// more than one balance gets a checklist at connect: its catalog pools ticked,
/// anything else it reports (Apollo's website visitor credits, say) unticked.
/// Unwatched balances stay out of the panel, the stack and alerts.
public enum WatchedBalances {
  /// Whether the connect flow shows the checklist: more than one balance.
  public static func offersChoice(_ connection: Connection) -> Bool {
    connection.allPoolRows.count > 1
  }

  /// The set a new connection starts with: its catalog pools, or nil (all)
  /// when it reports nothing beyond them. A provider with no catalog pools
  /// (every balance is read live, like Deepgram's projects) watches all.
  public static func defaults(for connection: Connection) -> [String]? {
    let core = declared(connection.provider)
    guard !core.isEmpty else { return nil }
    return normalized(core, for: connection)
  }

  /// The pools the hosted tools row declares, which the web's picker ticks by
  /// default and its API accepts as watched. The provider's catalog pools,
  /// plus Tavily's per-key cap, which has no row of its own while a key is
  /// unlimited (so it is not a catalog pool here).
  static func declared(_ provider: ProviderID) -> [String] {
    provider.pools.map(\.creditType) + (provider == .tavily ? [Tavily.keyPool.creditType] : [])
  }

  /// In row order; nil when every balance the connection has is in it.
  static func normalized(_ creditTypes: [String], for connection: Connection) -> [String]? {
    let choices = connection.allPoolRows.map(\.key.creditType)
    let chosen = Set(creditTypes)
    return Set(choices).isSubset(of: chosen) ? nil : choices.filter(chosen.contains)
  }
}

public extension Connection {
  func isWatched(_ creditType: String) -> Bool {
    watchedCreditTypes?.contains(creditType) ?? true
  }

  /// The balances the user chose not to watch, for "Show N hidden balances".
  var hiddenPoolRows: [PoolRow] { allPoolRows.filter { !isWatched($0.key.creditType) } }
}
