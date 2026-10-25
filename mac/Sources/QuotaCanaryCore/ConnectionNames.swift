import Foundation

/// Why a connection name was refused.
public enum NameError: Error, Equatable, Sendable {
  case empty
  case tooLong
  /// Another connection to the same provider already uses this name
  /// (compared trimmed and case-insensitively).
  case taken(provider: ProviderID, name: String)

  public var message: String {
    switch self {
    case .empty: return Copy.nameEmpty
    case .tooLong: return Copy.nameTooLong(ConnectionNames.maxLength)
    case let .taken(provider, name): return Copy.nameTaken(provider.displayName, name)
    }
  }
}

/// Display names for connections. Names are unique per provider, so two
/// Hunter accounts can be told apart in the panel and in notifications.
public enum ConnectionNames {
  public static let maxLength = 40

  public static func normalized(_ name: String) -> String {
    name.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  /// The provider name when it is free, else "Hunter 2", "Hunter 3", ...
  public static func suggested(for provider: ProviderID, among connections: [Connection]) -> String {
    let base = provider.displayName
    var candidate = base
    var n = 2
    while validate(candidate, provider: provider, among: connections) != nil {
      candidate = Copy.numberedName(base, n)
      n += 1
    }
    return candidate
  }

  /// Nil when `name` is usable for `provider`. `excluding` is the connection
  /// being renamed, so keeping (or re-casing) its own name is allowed.
  public static func validate(
    _ name: String, provider: ProviderID, among connections: [Connection], excluding id: String? = nil
  ) -> NameError? {
    let trimmed = normalized(name)
    guard !trimmed.isEmpty else { return .empty }
    guard trimmed.count <= maxLength else { return .tooLong }
    let key = trimmed.lowercased()
    let clash = connections.contains {
      $0.id != id && $0.provider == provider && normalized($0.name).lowercased() == key
    }
    return clash ? .taken(provider: provider, name: trimmed) : nil
  }
}
