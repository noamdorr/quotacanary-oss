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
  /// Untrusted provider error text, retained for parsing compatibility only.
  /// UI formatters use fixed copy; raw text may echo credentials.
  case reportedError(String?)
  /// Recovery guidance authored in this app, never supplied by a provider.
  case guidance(ProviderGuidance)
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
  case removalHistoryFailed
  case removalRecordFailed
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
      case .reportedError: return Copy.reportedError(name)
      case let .guidance(guidance): return guidance.message
      case .rateLimited: return Copy.rateLimited(name)
      }
    case .credentialWriteFailed: return Copy.credentialWriteFailed
    case .credentialReadFailed: return Copy.credentialReadFailed
    case .credentialMissing: return Copy.credentialMissing
    case .credentialDeleteFailed: return Copy.credentialDeleteFailed
    case .removalHistoryFailed: return Copy.removalHistoryFailed
    case .removalRecordFailed: return Copy.removalRecordFailed
    case .saveFailed: return Copy.saveFailed
    case .loadFailed: return Copy.loadFailed
    case .notConnected: return Copy.notConnected
    case let .invalidThresholds(error): return error.message
    case let .invalidName(error): return error.message
    case .keyReplacedReadingNotSaved: return Copy.keyReplacedReadingNotSaved
    }
  }

  /// A new key is the fix (QUO-437): the inspector offers "Replace key…"
  /// beside the error. Other failures keep their own recovery.
  public var offersKeyReplacement: Bool {
    switch self {
    case .credentialMissing, .provider(_, .keyRejected), .provider(_, .keyLacksScope): return true
    default: return false
    }
  }
}

/// Only fixed, reviewed recovery instructions cross this boundary.
public enum ProviderGuidance: Equatable, Sendable {
  case tregNotTiedToATeam
  case icypeasEmailNotAccepted
  case enrichCRMCreditsUnreadable
  case webshareNothingToWatch
  case firecrawlRejected
  case theCompaniesAPINoTeam

  public var message: String {
    switch self {
    case .tregNotTiedToATeam: return Copy.tregNotTiedToATeam
    case .icypeasEmailNotAccepted: return Copy.icypeasEmailNotAccepted
    case .enrichCRMCreditsUnreadable: return Copy.enrichCRMCreditsUnreadable
    case .webshareNothingToWatch: return Copy.webshareNothingToWatch
    case .firecrawlRejected: return Copy.firecrawlRejected
    case .theCompaniesAPINoTeam: return Copy.theCompaniesAPINoTeam
    }
  }
}
