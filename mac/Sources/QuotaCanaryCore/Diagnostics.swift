import Foundation

/// Builds the file the "Export diagnostics..." button writes, and the pieces used to redact
/// anything that could carry provider text before it reaches that file.
///
/// The report is built from a small, fixed allowlist and nothing else:
/// - `app`: app version + build identity (one string), the macOS version, and the CPU
///   architecture.
/// - `exportedAt`: when the report was generated.
/// - one entry per connection: the provider id, a short 1-based index (never the Keychain
///   reference or the connection's UUID), whether a credential reference exists (a bool, never
///   the reference itself, and never a live Keychain read), the last reading's timestamp, its
///   per-pool safe creditType/unit/balance/cap, the number of consecutive failed provider checks
///   (QUO-133: an integer, attempted checks only), and the last error's enum CASE NAME only
///   (never any provider-supplied or otherwise free-form error text), and (QUO-279) the last
///   check's `CheckRecord`: method, host + path, HTTP status, duration, and a redacted,
///   truncated response body of a failed check. The record is redacted when it is built (the
///   key, auth header values and emails are replaced), the one place provider text reaches the
///   file.
/// - `updates` (QUO-139): whether automatic update checks are on and when the last verified
///   update check happened. The caller passes these two values in; nothing else from
///   preferences.json is read or reported.
///
/// Deliberately excluded: API keys, credential payloads, connection ids, connection names (a
/// user-editable field that could hold anything, including a pasted secret), authorization
/// headers, raw (unredacted) provider requests or responses, and any other account identifier. Nothing here
/// reads preferences, log files, or network traffic itself.
public enum Diagnostics {
  public struct Report: Codable, Equatable, Sendable {
    public var app: AppInfo
    public var exportedAt: Date
    public var connections: [ConnectionInfo]
    public var updates: UpdatesInfo
  }

  /// The two update settings diagnostics may report (QUO-139).
  public struct UpdatesInfo: Codable, Equatable, Sendable {
    public var automaticUpdateChecks: Bool
    public var lastUpdateCheckAt: Date?

    public init(automaticUpdateChecks: Bool = false, lastUpdateCheckAt: Date? = nil) {
      self.automaticUpdateChecks = automaticUpdateChecks
      self.lastUpdateCheckAt = lastUpdateCheckAt
    }
  }

  public struct AppInfo: Codable, Equatable, Sendable {
    public var version: String
    public var macOSVersion: String
    public var architecture: String
  }

  public struct ConnectionInfo: Codable, Equatable, Sendable {
    public var index: Int
    public var provider: ProviderID
    public var hasCredential: Bool
    public var lastReadingAt: Date?
    public var pools: [PoolInfo]
    public var consecutiveFailures: Int
    public var lastErrorCase: String?
    public var lastCheck: CheckRecord?
  }

  public struct PoolInfo: Codable, Equatable, Sendable {
    public var creditType: String
    public var unit: CreditUnit
    public var balance: Double
    public var cap: Double?
  }

  /// One connection's diagnosable state, gathered by the caller from the live app model. This is
  /// not the persisted `Connection`: it deliberately drops the id, the name, and the credential
  /// reference itself, keeping only whether one exists.
  public struct ConnectionSnapshot: Sendable {
    public var provider: ProviderID
    public var hasCredential: Bool
    public var lastReading: Reading?
    public var consecutiveFailures: Int
    public var lastError: MonitorError?
    public var lastCheck: CheckRecord?

    public init(
      provider: ProviderID, hasCredential: Bool, lastReading: Reading?, consecutiveFailures: Int = 0,
      lastError: MonitorError?, lastCheck: CheckRecord? = nil
    ) {
      self.provider = provider
      self.hasCredential = hasCredential
      self.lastReading = lastReading
      self.consecutiveFailures = consecutiveFailures
      self.lastError = lastError
      self.lastCheck = lastCheck
    }

    /// Reduces a live `Connection` to the safe allowlist. `hasCredential` reflects the
    /// connection referencing a credential slot, not a fresh Keychain read: diagnostics export
    /// must never touch the Keychain.
    public init(connection: Connection, lastError: MonitorError?, lastCheck: CheckRecord? = nil) {
      self.init(
        provider: connection.provider,
        hasCredential: !connection.credentialRef.isEmpty,
        lastReading: connection.lastReading,
        consecutiveFailures: connection.monitoring.consecutiveFailures,
        lastError: lastError,
        lastCheck: lastCheck
      )
    }
  }

  public static func report(
    connections: [ConnectionSnapshot],
    appVersion: String,
    updates: UpdatesInfo = UpdatesInfo(),
    now: Date = Date()
  ) -> Report {
    Report(
      app: AppInfo(version: appVersion, macOSVersion: macOSVersionString(), architecture: architectureString()),
      exportedAt: now,
      connections: connections.enumerated().map { offset, snapshot in
        ConnectionInfo(
          index: offset + 1,
          provider: snapshot.provider,
          hasCredential: snapshot.hasCredential,
          lastReadingAt: snapshot.lastReading?.checkedAt,
          pools: (snapshot.lastReading?.balances ?? []).enumerated().map { poolIndex, balance in
            // Deepgram's persisted pool key includes a provider project ID.
            // The report uses a local ordinal without changing that key.
            let creditType = snapshot.provider == .deepgram ? "project:\(poolIndex + 1)" : balance.pool.creditType
            return PoolInfo(creditType: creditType, unit: balance.pool.unit, balance: balance.balance, cap: balance.pool.cap)
          },
          consecutiveFailures: snapshot.consecutiveFailures,
          lastErrorCase: snapshot.lastError?.diagnosticsCaseName,
          lastCheck: snapshot.lastCheck
        )
      },
      updates: updates
    )
  }

  /// Pretty, sorted-key, ISO 8601 JSON: this file is read by a person, not round-tripped by the
  /// app, so readability wins over the sub-second precision `ConnectionStore` needs.
  public static func encode(_ report: Report) -> Data {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    encoder.dateEncodingStrategy = .iso8601
    return (try? encoder.encode(report)) ?? Data()
  }

  /// `quotacanary-diagnostics-<yyyyMMdd-HHmm>.json`. A pure function of `now`: nothing
  /// connection- or provider-derived can reach the filename.
  public static func suggestedFilename(now: Date = Date()) -> String {
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyyMMdd-HHmm"
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = .current
    return "quotacanary-diagnostics-\(formatter.string(from: now)).json"
  }

  /// Redacts every occurrence of each secret in `text`, case-sensitively. Use this on anything
  /// that could carry provider-supplied text (a raw response body, an underlying error's
  /// description) before it reaches a log, a filename, or a message shown to the user.
  public static func redact(_ text: String, secrets: [String]) -> String {
    var result = text
    for secret in secrets where !secret.isEmpty {
      result = result.replacingOccurrences(of: secret, with: "[redacted]")
    }
    return result
  }

  /// What happened when `export` tried to write a report.
  public enum ExportOutcome: Equatable, Sendable {
    case saved(URL)
    case cancelled
    case failed(String)
  }

  /// Writes `report` to wherever `chooseDestination` picks; `nil` means the user cancelled.
  /// `write` defaults to an atomic file write and is overridable so tests can exercise the save,
  /// cancel, and failure branches without a real `NSSavePanel` or touching disk. The failure
  /// message is a fixed, static string: whatever the underlying error says is never surfaced, so
  /// it can never carry provider text either.
  public static func export(
    _ report: Report,
    chooseDestination: () -> URL?,
    write: (Data, URL) throws -> Void = { try $0.write(to: $1, options: .atomic) }
  ) -> ExportOutcome {
    guard let url = chooseDestination() else { return .cancelled }
    do {
      try write(encode(report), url)
      return .saved(url)
    } catch {
      return .failed(Copy.diagnosticsExportFailed)
    }
  }

  public static func macOSVersionString() -> String {
    let v = ProcessInfo.processInfo.operatingSystemVersion
    return "\(v.majorVersion).\(v.minorVersion).\(v.patchVersion)"
  }

  public static func architectureString() -> String {
    #if arch(arm64)
      return "arm64"
    #elseif arch(x86_64)
      return "x86_64"
    #else
      return "unknown"
    #endif
  }
}

extension MonitorError {
  /// The case name only, used exclusively by diagnostics. Associated values (an HTTP status
  /// number, a field path, provider identity) are never included, so no future case can leak
  /// provider text through here just by being added.
  var diagnosticsCaseName: String {
    switch self {
    case .missingKey: return "missingKey"
    case let .provider(_, providerError):
      switch providerError {
      case .unreachable: return "provider.unreachable"
      case .keyRejected: return "provider.keyRejected"
      case .httpStatus: return "provider.httpStatus"
      case .notJSON: return "provider.notJSON"
      case .missingField: return "provider.missingField"
      case .keyLacksScope: return "provider.keyLacksScope"
      case .reportedError: return "provider.reportedError"
      case .rateLimited: return "provider.rateLimited"
      }
    case .credentialWriteFailed: return "credentialWriteFailed"
    case .credentialReadFailed: return "credentialReadFailed"
    case .credentialMissing: return "credentialMissing"
    case .credentialDeleteFailed: return "credentialDeleteFailed"
    case .saveFailed: return "saveFailed"
    case .loadFailed: return "loadFailed"
    case .notConnected: return "notConnected"
    case .invalidThresholds: return "invalidThresholds"
    case .invalidName: return "invalidName"
    case .keyReplacedReadingNotSaved: return "keyReplacedReadingNotSaved"
    }
  }
}
