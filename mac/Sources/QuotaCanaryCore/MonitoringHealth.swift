import Foundation

// Know when monitoring stops working (QUO-133). The scheduler reports every
// finished check to the connection's monitoring record
// (`ConnectionMonitor.checkFinished`, QUO-310); only a provider request
// that went out and failed counts. Sleep, offline, a check interrupted by
// either, and Keychain or disk trouble never count and never reset. Rules:
// - every attempted failure shows at once in the panel (health line + reason);
// - the third in a row sends ONE "checks keep failing" notification;
// - a rejected key, or an Apollo key without the usage scope, notifies at once,
//   once per incident;
// - a successful check (or a replaced key) ends the incident and re-arms both.
// The count and the sent flags live on `Connection.monitoring`, so a relaunch
// neither forgets an incident nor repeats its notification. macOS is reached
// only through `NotificationCenterLike`, with the same "a flag moves only
// after macOS accepted it" rule as the credit alerts.

// MARK: - Persisted state

public struct MonitoringState: Codable, Equatable, Sendable {
  /// Attempted provider checks that failed since the last success.
  public var consecutiveFailures: Int
  /// The "checks keep failing" notification reached macOS this incident.
  public var failureAlertSent: Bool
  /// The "key rejected / lacks scope" notification reached macOS this incident.
  public var credentialAlertSent: Bool

  public init(consecutiveFailures: Int = 0, failureAlertSent: Bool = false, credentialAlertSent: Bool = false) {
    self.consecutiveFailures = consecutiveFailures
    self.failureAlertSent = failureAlertSent
    self.credentialAlertSent = credentialAlertSent
  }

  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    consecutiveFailures = try c.decodeIfPresent(Int.self, forKey: .consecutiveFailures) ?? 0
    failureAlertSent = try c.decodeIfPresent(Bool.self, forKey: .failureAlertSent) ?? false
    credentialAlertSent = try c.decodeIfPresent(Bool.self, forKey: .credentialAlertSent) ?? false
  }
}

// MARK: - Reason classes

/// Why an attempted check failed, as a class. Never carries provider text.
public enum CheckFailureReason: String, Equatable, Sendable {
  case keyRejected, keyLacksScope, rateLimited, unreachable, providerError, unexpectedResponse

  /// Nil for anything that is not a provider answer (Keychain, disk).
  public init?(_ error: MonitorError) {
    guard case let .provider(_, providerError) = error else { return nil }
    switch providerError {
    case .keyRejected: self = .keyRejected
    case .keyLacksScope: self = .keyLacksScope
    case .rateLimited: self = .rateLimited
    case .unreachable: self = .unreachable
    case .httpStatus, .reportedError: self = .providerError
    case .notJSON, .missingField: self = .unexpectedResponse
    }
  }

  /// Confirmed bad credentials: worth a notification on the first failure.
  public var isCredentialProblem: Bool { self == .keyRejected || self == .keyLacksScope }

  /// The reason as a clause for a notification body.
  func clause(_ provider: ProviderID) -> String {
    let name = provider.displayName
    switch self {
    case .keyRejected: return Copy.reasonKeyRejected(name)
    case .keyLacksScope: return Copy.reasonKeyLacksScope(provider)
    case .rateLimited: return Copy.reasonRateLimited(name)
    case .unreachable: return Copy.reasonUnreachable(name)
    case .providerError: return Copy.reasonProviderError(name)
    case .unexpectedResponse: return Copy.reasonUnexpected(name)
    }
  }
}

public extension MonitorError {
  /// What the panel says under a connection whose scheduled or manual check
  /// failed: what happened and what to do. A throttle, an outage or an odd
  /// answer is never called a bad key.
  var checkFailureMessage: String {
    guard case let .provider(provider, error) = self else { return message }
    let name = provider.displayName
    switch error {
    case .keyRejected: return Copy.checkKeyRejected(name)
    case .keyLacksScope: return Copy.checkKeyLacksScope(provider)
    case .rateLimited: return Copy.checkRateLimited(name)
    case .unreachable: return Copy.checkUnreachable(name)
    case let .httpStatus(status): return Copy.checkHTTPStatus(name, status)
    case let .reportedError(vendor): return vendor ?? Copy.checkReportedError(name)
    case .notJSON, .missingField: return Copy.checkUnexpected(name)
    }
  }
}

// MARK: - Decision and content

public enum MonitoringAlertKind: String, Equatable, Sendable {
  case failures, credentials
}

public enum MonitoringDecider {
  public static let failureThreshold = 3

  /// After an attempted failure has been counted into `state`: which alert
  /// is due, if any. A credential problem notifies at once, once per incident.
  /// The "keeps failing" alert goes once at the threshold, and not at all when
  /// a credential alert already told the user this incident.
  public static func due(_ state: MonitoringState, reason: CheckFailureReason) -> MonitoringAlertKind? {
    if reason.isCredentialProblem { return state.credentialAlertSent ? nil : .credentials }
    guard state.consecutiveFailures >= failureThreshold, !state.failureAlertSent, !state.credentialAlertSent else {
      return nil
    }
    return .failures
  }
}

public enum MonitoringContent {
  /// Names the connection and the reason class. Never the key, never
  /// anything the provider said.
  public static func make(
    connection: Connection, kind: MonitoringAlertKind, reason: CheckFailureReason
  ) -> AlertNotification {
    let provider = connection.provider.displayName
    let body: String
    switch (kind, reason) {
    case (.credentials, .keyLacksScope): body = Copy.monitorScopeBody(connection.provider)
    case (.credentials, _): body = Copy.monitorKeyRejectedBody(provider)
    case (.failures, _):
      body = Copy.monitorFailuresBody(connection.monitoring.consecutiveFailures, reason.clause(connection.provider))
    }
    return AlertNotification(
      id: "quotacanary.monitor.\(connection.id).\(kind.rawValue)",
      title: AlertContent.title(for: connection),
      body: body,
      target: NotificationTarget(connectionID: connection.id)
    )
  }
}

// MARK: - Attempts

public struct MonitoringAlertAttempt: Equatable, Sendable {
  public var connectionID: String
  public var kind: MonitoringAlertKind
  public var outcome: AlertAttempt.Outcome
}
