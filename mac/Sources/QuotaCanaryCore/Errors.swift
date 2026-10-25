import Foundation

/// How a provider read failed. Mirrors the web adapter's distinctions.
public enum ProviderReadError: Error, Equatable, Sendable {
  case unreachable
  case keyRejected
  case httpStatus(Int)
  case notJSON
  case missingField(String)
  /// The key is valid but not allowed to read usage (Apollo's 403 for a key
  /// without the credit usage endpoint in its scope).
  case keyLacksScope
  /// The provider answered with its own error instead of a balance (Tavily's
  /// `detail.error`, a catalog `errorPath` or `bodyError`). Catalog reads
  /// carry the vendor's string for the row, as the web does; nil falls back
  /// to the generic copy. Diagnostics never export it.
  case reportedError(String?)
  /// HTTP 429: the provider is throttling this key. Not a bad key; the next
  /// scheduled check retries (QUO-133).
  case rateLimited
}

/// Every failure the monitoring service can surface. Messages never include
/// the credential; OS status codes are carried only as numbers.
public enum MonitorError: Error, Equatable, Sendable {
  case missingKey
  case provider(ProviderID, ProviderReadError)
  case credentialWriteFailed
  case credentialReadFailed
  case credentialMissing
  case credentialDeleteFailed
  case saveFailed
  case loadFailed
  case notConnected
  case invalidThresholds(ThresholdError)
  case invalidName(NameError)
  /// Key replacement: the new key is in Keychain and in use, but its fresh
  /// reading could not be saved to disk and the old key could not be put back.
  case keyReplacedReadingNotSaved

  public var message: String {
    switch self {
    case .missingKey: return Copy.missingKey
    case let .provider(id, error):
      let name = id.displayName
      switch error {
      case .unreachable: return Copy.unreachable(name)
      case .keyRejected: return Copy.keyRejected(name)
      case let .httpStatus(status): return Copy.httpStatus(name, status)
      case .notJSON, .missingField: return Copy.unexpectedResponse(name)
      case .keyLacksScope: return Copy.keyLacksScope(id)
      case let .reportedError(vendor): return vendor ?? Copy.reportedError(name)
      case .rateLimited: return Copy.rateLimited(name)
      }
    case .credentialWriteFailed: return Copy.credentialWriteFailed
    case .credentialReadFailed: return Copy.credentialReadFailed
    case .credentialMissing: return Copy.credentialMissing
    case .credentialDeleteFailed: return Copy.credentialDeleteFailed
    case .saveFailed: return Copy.saveFailed
    case .loadFailed: return Copy.loadFailed
    case .notConnected: return Copy.notConnected
    case let .invalidThresholds(error): return error.message
    case let .invalidName(error): return error.message
    case .keyReplacedReadingNotSaved: return Copy.keyReplacedReadingNotSaved
    }
  }
}
