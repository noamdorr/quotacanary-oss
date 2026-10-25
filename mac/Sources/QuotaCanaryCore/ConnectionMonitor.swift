import Combine
import Foundation

// The connection monitoring record (QUO-310): one per local connection,
// everything the app knows about how its checks are going. The scheduler
// decides when a check runs and how it ended; `checkFinished` is the one place
// that outcome lands. The panel, the stack window, diagnostics and the alert
// evaluator read the record; none of them rebuilds it.

/// How one local connection's checks are going.
public struct ConnectionMonitoringRecord: Equatable, Sendable {
  /// Freshness from the scheduler (QUO-132). In memory; nil until this
  /// launch has a result.
  public var health: ConnectionHealth?
  /// The latest failed check, or a failed remove. In memory.
  public var error: MonitorError?
  /// What the panel says about `error`: what happened and what to do.
  public var message: String?
  /// The failure streak and which incident alerts went out (QUO-133).
  /// Persisted on `Connection.monitoring`, so a relaunch keeps it.
  public var streak: MonitoringState
  /// The redacted last provider call (QUO-279). In memory.
  public var lastCheck: CheckRecord?
}

/// Owns the monitoring records and the only way they change.
@MainActor
public final class ConnectionMonitor: ObservableObject {
  @Published public private(set) var health: [String: ConnectionHealth] = [:]
  /// The error behind each connection's message, for diagnostics.
  @Published public private(set) var errors: [String: MonitorError] = [:]
  /// What the panel says under each connection whose last check (or remove) failed.
  @Published public private(set) var messages: [String: String] = [:]

  private let service: MonitoringService
  private let alerts: AlertEvaluator?
  /// Set by the scheduler that reports into this monitor.
  weak var scheduler: PollScheduler?
  private var pruning: AnyCancellable?

  public init(service: MonitoringService, alerts: AlertEvaluator? = nil) {
    self.service = service
    self.alerts = alerts
    // A connection that is gone (removed or erased) has
    // no record to show; whoever removed it never cleans up here (QUO-311).
    pruning = service.connectionsChanged.sink { [weak self] connections in
      self?.prune(keeping: Set(connections.map(\.id)))
    }
  }

  public func record(for id: String) -> ConnectionMonitoringRecord {
    ConnectionMonitoringRecord(
      health: health[id], error: errors[id], message: messages[id],
      streak: service.connections.first { $0.id == id }?.monitoring ?? MonitoringState(),
      lastCheck: service.lastChecks[id]
    )
  }

  /// The redacted last provider call per connection, for diagnostics.
  public var lastChecks: [String: CheckRecord] { service.lastChecks }

  // MARK: Changes

  /// A finished check of a still-connected connection, as the scheduler
  /// decided it. Shows at once in the panel; an attempted failure counts
  /// toward the streak and may notify; a success ends the incident. Sleep,
  /// offline, and Keychain or disk trouble neither count nor reset.
  public func checkFinished(id: String, health outcome: ConnectionHealth, error: MonitorError?) {
    update(id, health: outcome, error: error)
    guard let before = service.connections.first(where: { $0.id == id })?.monitoring else { return }
    switch outcome {
    case .ok:
      alerts?.incidentEnded(id: id)
      try? service.updateMonitoring(id: id, MonitoringState())
    case .failed(_, attempted: true):
      guard let error, let reason = CheckFailureReason(error) else { return }
      var counted = before
      counted.consecutiveFailures += 1
      try? service.updateMonitoring(id: id, counted)
      // Decide on what was saved: if the save failed, nothing moved.
      guard let saved = service.connections.first(where: { $0.id == id }) else { return }
      alerts?.checkFailed(saved, reason: reason)
    case .failed(_, attempted: false), .offline, .checking:
      return // nothing went to the provider: not counted, not reset
    }
  }

  /// A new key was verified and its reading saved by the service: the old
  /// key's incident, error and any check still
  /// running on it are over.
  public func keyReplaced(id: String) {
    errors[id] = nil
    messages[id] = nil
    alerts?.incidentEnded(id: id)
    scheduler?.retire(id: id)
  }

  /// Remove failed: the reason shows under the connection until its next check.
  public func removeFailed(id: String, error: Error) {
    errors[id] = error as? MonitorError
    messages[id] = (error as? MonitorError)?.message ?? Copy.saveFailed
  }

  /// The connection is gone (removed or erased): nothing to show.
  public func forget(id: String) {
    health[id] = nil
    errors[id] = nil
    messages[id] = nil
  }

  private func prune(keeping ids: Set<String>) {
    // Most changes are readings, not removals: nothing to do unless a recorded id is gone.
    let recorded = Set(health.keys).union(errors.keys).union(messages.keys)
    for id in recorded where !ids.contains(id) {
      forget(id: id)
    }
  }

  /// Erase from this Mac (QUO-297): first run again.
  public func forgetAll() {
    health = [:]
    errors = [:]
    messages = [:]
  }

  /// Health from the scheduler. `.checking` keeps the last error on screen
  /// until the check ends; success and offline clear it.
  func update(_ id: String, health state: ConnectionHealth, error: MonitorError? = nil) {
    health[id] = state
    switch state {
    case .checking:
      return
    case .ok, .offline:
      errors[id] = nil
      messages[id] = nil
    case .failed:
      errors[id] = error
      messages[id] = error?.checkFailureMessage ?? Copy.saveFailed
    }
  }
}
