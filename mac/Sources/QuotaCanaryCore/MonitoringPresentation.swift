import Foundation

// Balance status and monitoring health are separate facts (QUO-262). A balance
// keeps its last-known number and status, but whether that number still comes
// from a working check is shown on its own: beside the connection name, in the
// VoiceOver label, and in the panel header, so an old balance is never trusted
// as a current one.

/// Whether a balance's number comes from a check that is still working.
public enum MonitoringHealth: Equatable, Sendable {
  /// The last check succeeded; nil when it has never been checked.
  case current(checkedAt: Date?)
  /// This connection's latest check failed; the number is from `lastGood`.
  case checkFailed(lastGood: Date?)

  public var isTrusted: Bool {
    if case .current = self { return true }
    return false
  }

  /// A local balance: `failing` is the connection's latest check result.
  public static func local(_ connection: Connection, failing: Bool) -> MonitoringHealth {
    let at = connection.lastReading?.checkedAt
    return failing ? .checkFailed(lastGood: at) : .current(checkedAt: at)
  }

  /// The persistent cue beside the connection name; nil while checks work.
  public func cue(_ relative: (Date) -> String) -> String? {
    switch self {
    case .current: return nil
    case let .checkFailed(lastGood): return Copy.checkFailedCue(lastGood.map(relative))
    }
  }

  /// Health and last-success time, for the end of a row's VoiceOver label.
  public func accessibilityPhrase(_ relative: (Date) -> String) -> String {
    switch self {
    case let .current(at): return at.map { Copy.checked(relative($0)) } ?? Copy.notCheckedYet
    case .checkFailed: return cue(relative) ?? ""
    }
  }

  /// One table row's VoiceOver label: name, balance summary, health, then any extra.
  public func rowAccessibilityLabel(
    name: String, summary: String, extra: [String] = [], relative: (Date) -> String
  ) -> String {
    ([name, summary, accessibilityPhrase(relative)] + extra).joined(separator: ", ")
  }
}

/// The panel header's one freshness line.
public enum PanelFreshness: Equatable, Sendable {
  case checking
  case offline(lastGood: Date)
  case checked(Date)
  case noGoodCheckYet

  public static func of(
    connections: [Connection], failingIDs: Set<String>, isBusy: Bool, anyOffline: Bool
  ) -> PanelFreshness {
    if isBusy { return .checking }
    guard let date = ConnectionPresentation.oldestSuccessfulCheck(connections, failingIDs: failingIDs) else {
      return .noGoodCheckYet
    }
    return anyOffline ? .offline(lastGood: date) : .checked(date)
  }

  public func text(_ relative: (Date) -> String) -> String {
    switch self {
    case .checking: return Copy.checkingNow
    case let .offline(date): return Copy.offlineLastGoodCheck(relative(date))
    case let .checked(date): return Copy.checked(relative(date))
    case .noGoodCheckYet: return Copy.noGoodCheckYet
    }
  }
}
