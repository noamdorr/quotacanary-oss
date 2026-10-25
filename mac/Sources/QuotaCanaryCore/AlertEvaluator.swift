import Combine
import Foundation

// The one alert evaluator (QUO-310): low, critical and empty notifications for
// every balance shown (QUO-131), and the "checks keep failing"
// and "key rejected" notifications a connection's monitoring record asks for
// (QUO-133). One notification center, one permission, one in-flight set and
// one queue. Every mark and flag moves only after macOS accepted the request,
// so a denial or a failure retries next time and the panel says why.

/// What a notification is about, for the undelivered list.
public enum AlertSubject: Hashable, Sendable {
  /// One balance.
  case balance(PoolKey)
  /// A connection's checks, by id.
  case connection(String)
}

@MainActor
public final class AlertEvaluator: ObservableObject {
  /// Notifications that are due but did not reach macOS, and why. Cleared
  /// once handed over, recovered, or no longer due.
  @Published public private(set) var undelivered: [AlertSubject: AlertProblem] = [:]
  /// Every balance delivery attempt, oldest first (tests and diagnostics).
  public private(set) var attempts: [AlertAttempt] = []
  /// Every monitoring delivery attempt, oldest first (tests).
  public private(set) var monitoringAttempts: [MonitoringAlertAttempt] = []

  private let service: MonitoringService
  private let center: NotificationCenterLike
  /// Deliveries in progress, so overlapping evaluations never submit the
  /// same notification twice.
  private var inFlight: Set<String> = []
  private var tasks: [Task<Void, Never>] = []

  public init(
    service: MonitoringService, center: NotificationCenterLike
  ) {
    self.service = service
    self.center = center
  }

  /// The most serious reason any notification is not reaching macOS.
  public var problem: AlertProblem? {
    let live = Set(service.connections.map(\.id))
    return AlertProblem.mostSerious(undelivered.compactMap { subject, problem in
      if case let .connection(id) = subject, !live.contains(id) { return nil }
      return problem
    })
  }

  /// Evaluates in the background; `settle()` waits for it.
  public func schedule(_ ids: [String]? = nil) {
    tasks.append(Task { [weak self] in await self?.evaluate(ids) })
  }

  /// Waits for every evaluation and delivery in progress.
  public func settle() async {
    while !tasks.isEmpty {
      await tasks.removeFirst().value
    }
  }

  // MARK: Balances

  private struct Due {
    var subject: AlertSubject
    var key: PoolKey
    var severity: AlertSeverity
    var token: String
    var content: AlertNotification
  }

  /// Decides for every balance of the given local connections, or with nil
  /// for every balance shown; clears recovered
  /// marks and hands new notifications to macOS.
  public func evaluate(_ ids: [String]? = nil) async {
    let due = localDue(ids)
    guard !due.isEmpty else { return }

    // Reserve before the first await, so an overlapping evaluation skips these.
    due.forEach { inFlight.insert($0.token) }
    defer { due.forEach { inFlight.remove($0.token) } }

    let permission = await center.status()
    for item in due {
      let outcome = await handOver(item.content, permission: permission)
      attempts.append(AlertAttempt(key: item.key, severity: item.severity, outcome: outcome))
      record(item.subject, outcome)
      if outcome == .handedToMacOS { markDelivered(item) }
    }
  }

  private func localDue(_ ids: [String]?) -> [Due] {
    let live = Set(service.connections.map(\.id))
    undelivered = undelivered.filter { subject, _ in
      guard case let .balance(key) = subject else { return true }
      return live.contains(key.connectionID)
    }
    var rearmed: [PoolKey: AlertSeverity] = [:]
    var due: [Due] = []
    for connection in service.connections where ids?.contains(connection.id) ?? true {
      for row in connection.poolRows {
        let mark = connection.alertMark(for: row.key.creditType)
        let content = { AlertContent.make(connection: connection, row: row, severity: $0) }
        if let item = decide(row, mark: mark, content: content, rearmed: &rearmed) {
          due.append(item)
        }
      }
    }
    if !rearmed.isEmpty { try? service.updateAlertMarks(rearmed) }
    return due
  }

  private func decide(
    _ row: PoolRow, mark: AlertSeverity,
    content: (AlertSeverity) -> AlertNotification, rearmed: inout [PoolKey: AlertSeverity]
  ) -> Due? {
    let decision = AlertDecider.decide(mark: mark, row: row)
    if decision.mark != mark { rearmed[row.key] = decision.mark }
    guard let severity = decision.notify else {
      undelivered[.balance(row.key)] = nil
      return nil
    }
    let token = "\(row.key.connectionID)|\(row.key.creditType)|\(severity.rawValue)"
    guard !inFlight.contains(token) else { return nil }
    return Due(
      subject: .balance(row.key), key: row.key, severity: severity,
      token: token, content: content(severity)
    )
  }

  /// Upward only: a slow low-level success never demotes a newer mark.
  private func markDelivered(_ item: Due) {
    let current = service.connections.first { $0.id == item.key.connectionID }?
      .alertMark(for: item.key.creditType) ?? .none
    if item.severity > current { try? service.updateAlertMarks([item.key: item.severity]) }
  }

  // MARK: Monitoring (QUO-133)

  /// A counted, attempted failure, already saved to `connection.monitoring`:
  /// sends what the incident is due, in the background.
  func checkFailed(_ connection: Connection, reason: CheckFailureReason) {
    guard let kind = MonitoringDecider.due(connection.monitoring, reason: reason) else { return }
    let token = "monitor|\(connection.id)|\(kind.rawValue)"
    guard !inFlight.contains(token) else { return }
    inFlight.insert(token)
    let content = MonitoringContent.make(connection: connection, kind: kind, reason: reason)
    let countAtDecision = connection.monitoring.consecutiveFailures
    tasks.append(Task { [weak self] in
      await self?.deliver(content, kind: kind, id: connection.id, count: countAtDecision)
      self?.inFlight.remove(token)
    })
  }

  /// A successful check or a replaced key ended the connection's incident.
  func incidentEnded(id: String) {
    undelivered[.connection(id)] = nil
  }

  private func deliver(_ content: AlertNotification, kind: MonitoringAlertKind, id: String, count: Int) async {
    let outcome = await handOver(content, permission: await center.status())
    monitoringAttempts.append(MonitoringAlertAttempt(connectionID: id, kind: kind, outcome: outcome))
    record(.connection(id), outcome)
    guard outcome == .handedToMacOS else { return }
    // Same incident still running (a success meanwhile would have reset the
    // count): only then does the flag move, so a new incident is never muted.
    guard var current = service.connections.first(where: { $0.id == id })?.monitoring,
          current.consecutiveFailures >= count else { return }
    switch kind {
    case .failures: current.failureAlertSent = true
    case .credentials: current.credentialAlertSent = true
    }
    try? service.updateMonitoring(id: id, current)
  }

  // MARK: Delivery

  /// `.handedToMacOS` means macOS accepted the request, not that anyone saw it.
  private func handOver(_ content: AlertNotification, permission: NotificationPermission) async -> AlertAttempt.Outcome {
    guard permission == .allowed else { return .notSubmitted(permission) }
    do {
      try await center.deliver(title: content.title, body: content.body, id: content.id, target: content.target)
    } catch let NotificationDeliveryError.notAllowed(state) {
      return .notSubmitted(state)
    } catch {
      return .failed
    }
    return .handedToMacOS
  }

  private func record(_ subject: AlertSubject, _ outcome: AlertAttempt.Outcome) {
    switch outcome {
    case .handedToMacOS: undelivered[subject] = nil
    case let .notSubmitted(permission): undelivered[subject] = .notSubmitted(permission)
    case .failed: undelivered[subject] = .failed
    }
  }
}
