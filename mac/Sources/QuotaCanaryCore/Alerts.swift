import Observation
import Foundation

// Low, critical and empty notifications (QUO-131). The decision is pure
// (`AlertDecider`), the high-water marks live on each `Connection` keyed by
// creditType (like `poolSettings`), and macOS is reached only through
// `NotificationCenterLike`, so every rule here is unit tested with a fake.
// Semantics follow the web app's per-pool marks (src/lib/alerts/severity.ts)
// with an extra empty stage.

// MARK: - Severity and marks

/// How bad a pool is, for alerting. Also the persisted high-water mark:
/// the highest severity already notified in the pool's current cycle.
public enum AlertSeverity: String, Codable, CaseIterable, Comparable, Sendable {
  case none, low, critical, empty

  var rank: Int {
    switch self {
    case .none: return 0
    case .low: return 1
    case .critical: return 2
    case .empty: return 3
    }
  }

  public static func < (a: AlertSeverity, b: AlertSeverity) -> Bool { a.rank < b.rank }

  /// Only warning statuses have a severity; healthy, unavailable and unknown do not.
  public init?(status: PoolStatus) {
    switch status {
    case .low: self = .low
    case .critical: self = .critical
    case .empty: self = .empty
    case .healthy, .unavailable, .unknown: return nil
    }
  }
}

public struct AlertDecision: Equatable, Sendable {
  /// A severity to notify now, or nil for nothing.
  public var notify: AlertSeverity?
  /// The mark to keep right now. When `notify` is set, the mark only moves
  /// up to it after macOS accepted the notification.
  public var mark: AlertSeverity
}

public enum AlertDecider {
  /// One pool, one reading:
  /// - monitored and low/critical/empty above the mark: notify at that
  ///   severity (a jump straight to empty is one empty alert, not three);
  /// - same or lower warning: nothing, the mark stays (no repeats, no
  ///   demotion while still warning);
  /// - healthy (above low) or muted: nothing, and the mark clears, re-arming
  ///   the pool, so the reading that ends a mute alerts as a new incident;
  /// - unmonitored, unavailable (not in plan) or unknown: nothing, mark kept.
  public static func decide(mark: AlertSeverity, row: PoolRow) -> AlertDecision {
    if row.status == .healthy || row.muted { return AlertDecision(notify: nil, mark: .none) }
    guard row.settings.monitored, let severity = AlertSeverity(status: row.status) else {
      return AlertDecision(notify: nil, mark: mark)
    }
    if severity > mark { return AlertDecision(notify: severity, mark: mark) }
    return AlertDecision(notify: nil, mark: mark)
  }
}

public extension Connection {
  func alertMark(for creditType: String) -> AlertSeverity { alertMarks[creditType] ?? .none }
}

public extension Array where Element == Connection {
  /// Monitored low, critical or empty pools, not the number of accounts.
  var poolsAtRisk: Int {
    reduce(0) { $0 + $1.poolRows.filter(\.alerts).count }
  }

  /// The worst monitored warning across every connection, for the menu bar.
  var worstAlert: AlertSeverity {
    flatMap(\.poolRows).filter(\.alerts).compactMap { AlertSeverity(status: $0.status) }.max() ?? .none
  }
}

// MARK: - Content

public struct AlertNotification: Equatable, Sendable {
  public var id: String
  public var title: String
  public var body: String
  /// What a click on the notification opens (QUO-266).
  public var target: NotificationTarget? = nil
}

public enum AlertContent {
  /// Names the connection, the pool, the amount left and the severity.
  /// Never the key, and never a claim about the whole provider.
  public static func make(connection: Connection, row: PoolRow, severity: AlertSeverity) -> AlertNotification {
    make(title: title(for: connection), connectionID: connection.id, row: row, severity: severity)
  }

  /// Shared with hosted pools (QUO-188), whose title names the web tool.
  public static func make(title: String, connectionID: String, row: PoolRow, severity: AlertSeverity) -> AlertNotification {
    let body: String
    switch severity {
    case .empty, .none:
      body = Copy.alertBodyEmpty(row.pool.label)
    case .low, .critical:
      let amount = row.balance.map { Format.amount($0, pool: row.pool) } ?? Copy.noData
      body = Copy.alertBody(row.pool.label, severity == .low ? Copy.severityLow : Copy.severityCritical, amount)
    }
    // Stable per pool and stage: a resubmission replaces, never stacks.
    let id = "quotacanary.alert.\(connectionID).\(row.key.creditType).\(severity.rawValue)"
    return AlertNotification(
      id: id, title: title, body: body,
      target: NotificationTarget(connectionID: connectionID, creditType: row.key.creditType)
    )
  }

  /// Same rule as the panel's ConnectionTitle: add the provider only when the
  /// name lacks it. Shared with the monitoring alerts (QUO-133).
  public static func title(for connection: Connection) -> String {
    title(provider: connection.provider.displayName, name: connection.name)
  }

  public static func title(provider: String, name: String) -> String {
    name.localizedCaseInsensitiveContains(provider) ? name : Copy.alertTitle(provider: provider, name: name)
  }
}

// MARK: - Notification boundary

public enum NotificationPermission: String, Equatable, Sendable {
  case notAsked, denied, allowed
  /// No notification center for this process (for example `swift run`,
  /// which has no app bundle).
  case unavailable
}

public enum NotificationDeliveryError: Error, Equatable, Sendable {
  case notAllowed(NotificationPermission)
  /// macOS refused the request; the code is the NSError code, never text.
  case failed(code: Int?)
}

/// macOS's notification center, or a fake. `deliver` returning means macOS
/// accepted the request, not that anyone saw it (Focus, alert style None and
/// notification summaries can all keep it off screen).
@MainActor
public protocol NotificationCenterLike: AnyObject {
  /// Asks macOS (it shows its own prompt at most once). True when allowed.
  func requestPermission() async -> Bool
  func status() async -> NotificationPermission
  func deliver(title: String, body: String, id: String, target: NotificationTarget?) async throws
}

public extension NotificationCenterLike {
  func deliver(title: String, body: String, id: String) async throws {
    try await deliver(title: title, body: body, id: id, target: nil)
  }
}

/// Tests, synthetic mode and snapshots. Records what was handed over and can
/// deny, fail, or hold deliveries until released.
@MainActor
public final class FakeNotificationCenter: NotificationCenterLike {
  public var permission: NotificationPermission
  /// What a permission request turns `.notAsked` into.
  public var answer: NotificationPermission
  public var failDeliveries = false
  /// Holds each delivery until `releaseHeld()`, to overlap evaluations.
  public var holdDeliveries = false
  public private(set) var delivered: [AlertNotification] = []
  public private(set) var deliverCalls = 0
  public private(set) var requestCalls = 0
  private var held: [CheckedContinuation<Void, Never>] = []

  public init(permission: NotificationPermission = .notAsked, answer: NotificationPermission = .allowed) {
    self.permission = permission
    self.answer = answer
  }

  public func requestPermission() async -> Bool {
    requestCalls += 1
    if permission == .notAsked { permission = answer }
    return permission == .allowed
  }

  public func status() async -> NotificationPermission { permission }

  public func deliver(title: String, body: String, id: String, target: NotificationTarget?) async throws {
    deliverCalls += 1
    if holdDeliveries { await withCheckedContinuation { held.append($0) } }
    guard permission == .allowed else { throw NotificationDeliveryError.notAllowed(permission) }
    if failDeliveries { throw NotificationDeliveryError.failed(code: 1) }
    delivered.append(AlertNotification(id: id, title: title, body: body, target: target))
  }

  public var heldCount: Int { held.count }

  public func releaseHeld() {
    let waiting = held
    held = []
    waiting.forEach { $0.resume() }
  }
}

// MARK: - Delivery problems

public enum AlertProblem: Equatable, Sendable {
  /// Not submitted: macOS permission is not granted (or not available).
  case notSubmitted(NotificationPermission)
  /// Submitted and refused by macOS.
  case failed

  public var message: String {
    switch self {
    case .failed: return Copy.undeliveredFailed
    case .notSubmitted(.denied): return Copy.undeliveredDenied
    case .notSubmitted(.unavailable): return Copy.undeliveredUnavailable
    case .notSubmitted: return Copy.undeliveredNotAsked
    }
  }

  /// Failed first, then denied, unavailable, not asked. Shared with QUO-133.
  public static func mostSerious(_ problems: [AlertProblem]) -> AlertProblem? {
    let order: [AlertProblem] = [.failed, .notSubmitted(.denied), .notSubmitted(.unavailable), .notSubmitted(.notAsked)]
    return order.first { problems.contains($0) }
  }
}

public struct AlertAttempt: Equatable, Sendable {
  public enum Outcome: Equatable, Sendable {
    /// macOS accepted the request. Not a claim that it was seen.
    case handedToMacOS
    case notSubmitted(NotificationPermission)
    case failed
  }

  public var key: PoolKey
  public var severity: AlertSeverity
  public var outcome: Outcome
}

// MARK: - Permission, first-run row, test notification

public struct NotificationTestResult: Equatable, Sendable {
  public var message: String
  public var isError: Bool
}

/// What the Settings alerts section offers for a permission state (QUO-273).
/// `openSettings` is the denied-state recovery: macOS shows its prompt only
/// once, so after a denial the only way back is System Settings.
public enum NotificationControl: Equatable, Sendable {
  case none, turnOn, openSettings

  public static func forPermission(_ permission: NotificationPermission) -> NotificationControl {
    switch permission {
    case .notAsked: return .turnOn
    case .denied: return .openSettings
    case .allowed, .unavailable: return .none
    }
  }

  /// The System Settings > Notifications pane, scoped to this app when its
  /// bundle id is known (macOS 13+ Settings extension URL).
  public static func settingsURL(bundleID: String?) -> URL {
    var url = "x-apple.systempreferences:com.apple.Notifications-Settings.extension"
    if let bundleID, !bundleID.isEmpty { url += "?id=\(bundleID)" }
    return URL(string: url)!
  }
}

/// The "Turn on alerts?" row and the Settings section. Asking is explicit;
/// a denial only changes what Settings says, never the connections.
@MainActor
@Observable
public final class NotificationSettings {
  public private(set) var permission: NotificationPermission = .notAsked
  public private(set) var promptAnswered: Bool
  public private(set) var promptError: String?
  public private(set) var testResult: NotificationTestResult?

  private let center: NotificationCenterLike
  private let preferences: PreferencesStore
  private var setupGeneration = 0

  public init(center: NotificationCenterLike, preferences: PreferencesStore) {
    self.center = center
    self.preferences = preferences
    promptAnswered = preferences.load().alertsPromptAnswered
  }

  /// Re-reads macOS (the user may have changed it in System Settings).
  public func reload() async {
    let generation = setupGeneration
    let current = await center.status()
    guard generation == setupGeneration else { return }
    permission = current
  }

  /// Forget app choices, then read actual OS permission before offering setup.
  public func resetAfterErase() {
    setupGeneration += 1
    promptAnswered = false
    promptError = nil
    testResult = nil
    permission = .unavailable
  }

  /// Ask once, after something is connected, unless macOS already knows.
  public func showsPrompt(hasConnections: Bool) -> Bool {
    hasConnections && !promptAnswered && permission == .notAsked
  }

  public var statusLine: String {
    switch permission {
    case .allowed: return Copy.alertsAllowed
    case .denied: return Copy.alertsDenied
    case .notAsked: return Copy.alertsNotAsked
    case .unavailable: return Copy.alertsUnavailable
    }
  }

  /// Asks macOS and returns what it now says.
  @discardableResult
  public func request() async -> NotificationPermission {
    let generation = setupGeneration
    _ = await center.requestPermission()
    let current = await center.status()
    guard generation == setupGeneration else { return permission }
    permission = current
    return permission
  }

  /// Enable asks macOS. Any answer from macOS (allow or deny) settles the
  /// row; macOS not asking at all keeps it, with the reason. Returns true
  /// when notifications are now allowed.
  @discardableResult
  public func answerPrompt(enable: Bool) async -> Bool {
    let generation = setupGeneration
    promptError = nil
    if enable {
      let result = await request()
      guard generation == setupGeneration else { return false }
      if result == .notAsked || result == .unavailable {
        promptError = result == .unavailable ? Copy.alertsUnavailable : Copy.alertsPromptFailed
        return false
      }
    }
    promptAnswered = true
    var saved = preferences.load()
    saved.alertsPromptAnswered = true
    try? preferences.save(saved) // worst case the question comes back next launch
    return permission == .allowed
  }

  /// One synthetic notification through the same path real alerts use. The
  /// result says whether macOS took it, never that it was seen.
  public func sendTest() async {
    var state = await center.status()
    if state == .notAsked { state = await request() }
    permission = state
    switch state {
    case .allowed:
      do {
        try await center.deliver(
          title: Copy.testNotificationTitle, body: Copy.testNotificationBody, id: "quotacanary.test"
        )
        testResult = NotificationTestResult(message: Copy.testHandedToMacOS, isError: false)
      } catch NotificationDeliveryError.notAllowed(.denied) {
        testResult = NotificationTestResult(message: Copy.testDenied, isError: true)
      } catch {
        testResult = NotificationTestResult(message: Copy.testFailed, isError: true)
      }
    case .denied: testResult = NotificationTestResult(message: Copy.testDenied, isError: true)
    case .notAsked: testResult = NotificationTestResult(message: Copy.testNotAsked, isError: true)
    case .unavailable: testResult = NotificationTestResult(message: Copy.alertsUnavailable, isError: true)
    }
  }
}
