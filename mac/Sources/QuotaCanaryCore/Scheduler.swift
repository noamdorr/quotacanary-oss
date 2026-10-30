import Foundation

// Keeps balances fresh while the app runs on an awake, online Mac (QUO-132).
// Everything time- or OS-dependent comes in through a boundary below, so the
// cadence, wake, reconnect, coalescing and timeout rules are unit tested with
// a hand-advanced clock. It never keeps the Mac awake and never catches up on
// intervals missed while asleep, offline or not running.

// MARK: - Clock

/// A cancellable piece of scheduled work.
@MainActor
public final class ScheduledWork {
  private var onCancel: (() -> Void)?

  public init(onCancel: @escaping () -> Void) {
    self.onCancel = onCancel
  }

  public func cancel() {
    onCancel?()
    onCancel = nil
  }
}

@MainActor
public protocol SchedulerClock: AnyObject {
  var now: Date { get }
  /// Runs `action` once, `seconds` from now.
  func schedule(after seconds: TimeInterval, _ action: @escaping @MainActor () -> Void) -> ScheduledWork
}

/// Real clock. Dispatch deadlines count awake time only, so a timer armed
/// before sleep does not fire in a burst on wake (the scheduler also cancels
/// it on sleep and re-arms from "now" on wake).
@MainActor
public final class SystemClock: SchedulerClock {
  public init() {}

  public var now: Date { Date() }

  public func schedule(after seconds: TimeInterval, _ action: @escaping @MainActor () -> Void) -> ScheduledWork {
    let item = DispatchWorkItem { MainActor.assumeIsolated { action() } }
    DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: item)
    return ScheduledWork { item.cancel() }
  }
}

/// Test and preview clock: time moves only when `advance` is called.
@MainActor
public final class ManualClock: SchedulerClock {
  public private(set) var now: Date
  private var items: [(id: Int, at: Date, action: @MainActor () -> Void)] = []
  private var nextID = 0

  public init(now: Date) {
    self.now = now
  }

  public var pendingCount: Int { items.count }

  public func schedule(after seconds: TimeInterval, _ action: @escaping @MainActor () -> Void) -> ScheduledWork {
    nextID += 1
    let id = nextID
    items.append((id, now.addingTimeInterval(seconds), action))
    return ScheduledWork { [weak self] in self?.items.removeAll { $0.id == id } }
  }

  /// Moves time forward, firing due work in deadline order.
  public func advance(by seconds: TimeInterval) {
    let target = now.addingTimeInterval(seconds)
    while let next = items.filter({ $0.at <= target })
      .min(by: { ($0.at, $0.id) < ($1.at, $1.id) })
    {
      items.removeAll { $0.id == next.id }
      now = next.at
      next.action()
    }
    now = target
  }
}

// MARK: - Lifecycle and reachability

public enum LifecycleEvent: Equatable, Sendable {
  case willSleep
  case didWake
  case reachabilityChanged(online: Bool)
}

/// Sleep, wake and network changes. Real one: NSWorkspace + NWPathMonitor.
@MainActor
public protocol LifecycleSource: AnyObject {
  func start(_ handler: @escaping @MainActor (LifecycleEvent) -> Void)
}

@MainActor
public protocol ReachabilityProbe: AnyObject {
  var isOnline: Bool { get }
}

@MainActor
public final class ManualLifecycle: LifecycleSource {
  private var handler: (@MainActor (LifecycleEvent) -> Void)?

  public init() {}

  public func start(_ handler: @escaping @MainActor (LifecycleEvent) -> Void) {
    self.handler = handler
  }

  public func emit(_ event: LifecycleEvent) {
    handler?(event)
  }
}

@MainActor
public final class ScriptedReachability: ReachabilityProbe {
  public var isOnline: Bool

  public init(online: Bool = true) {
    isOnline = online
  }
}

// MARK: - Health

public enum CheckTrigger: String, Sendable {
  case launch, timer, wake, reconnect, manual
}

/// Per connection. `failed(attempted: true)` is the only state that means a
/// provider request went out and failed; offline, asleep and interrupted
/// checks are `offline` so downstream failure counting can skip them.
public enum ConnectionHealth: Equatable, Sendable {
  case checking
  case ok(lastSuccess: Date)
  case failed(lastSuccess: Date?, attempted: Bool)
  case offline(lastSuccess: Date?)
}

// MARK: - Scheduler

@MainActor
public final class PollScheduler {
  /// Nominal cadence while running, awake and online.
  public nonisolated static let nominalInterval: TimeInterval = 15 * 60
  /// Upper bound on one check, on top of the transport's own timeout.
  public static let checkTimeout: TimeInterval = 30
  /// Wake and reconnect skip a connection attempted less than this long ago.
  public static let eventGap: TimeInterval = 60
  /// Timer ticks tolerate this much jitter against the minimum interval.
  static let timerSlack: TimeInterval = 30
  /// Providers that need a longer gap than the nominal interval. None yet;
  /// nothing may go below `nominalInterval`.
  static let providerMinimumIntervals: [ProviderID: TimeInterval] = [:]

  public static func minimumInterval(for provider: ProviderID) -> TimeInterval {
    max(nominalInterval, providerMinimumIntervals[provider] ?? 0)
  }

  /// Where every check's health and outcome land (QUO-310).
  public let monitor: ConnectionMonitor
  public private(set) var isAsleep = false
  private final class Run {
    let epoch: Int
    var task: Task<Void, Never>?
    var timeout: ScheduledWork?
    var waiters: [CheckedContinuation<Void, Never>] = []
    init(epoch: Int) { self.epoch = epoch }
  }

  private enum Outcome {
    case success
    case failure(MonitorError)
    case timedOut
  }

  private let service: MonitoringService
  private let clock: SchedulerClock
  private let lifecycle: LifecycleSource
  private let reachability: ReachabilityProbe
  private var timer: ScheduledWork?
  private var runs: [String: Run] = [:]
  private var lastAttemptAt: [String: Date] = [:]
  /// Bumped on sleep, so a check that straddles a sleep is not blamed on the provider.
  private var epoch = 0
  private var wasOnline = true
  private var started = false

  public init(
    service: MonitoringService, monitor: ConnectionMonitor, clock: SchedulerClock, lifecycle: LifecycleSource,
    reachability: ReachabilityProbe
  ) {
    self.service = service
    self.monitor = monitor
    self.clock = clock
    self.lifecycle = lifecycle
    self.reachability = reachability
    monitor.scheduler = self
  }

  /// App launch: subscribe to lifecycle events, arm the timer, check once.
  public func start() {
    guard !started else { return }
    started = true
    wasOnline = reachability.isOnline
    lifecycle.start { [weak self] event in self?.handle(event) }
    armTimer()
    request(.launch)
  }

  public func handle(_ event: LifecycleEvent) {
    switch event {
    case .willSleep:
      isAsleep = true
      epoch += 1
      timer?.cancel()
      timer = nil
    case .didWake:
      isAsleep = false
      armTimer()
      request(.wake)
    case let .reachabilityChanged(online):
      let regained = online && !wasOnline
      wasOnline = online
      if !online {
        markOffline()
      } else if regained, !isAsleep {
        armTimer()
        request(.reconnect)
      }
    }
  }

  /// Starts checks for every due connection and returns at once. A
  /// connection already being checked is not checked again.
  public func request(_ trigger: CheckTrigger) {
    _ = begin(trigger)
  }

  /// Like `request`, but waits for the checks it started or joined.
  public func check(_ trigger: CheckTrigger) async {
    for run in begin(trigger) {
      await wait(run)
    }
  }

  /// Waits for every check in flight.
  public func settle() async {
    for run in Array(runs.values) {
      await wait(run)
    }
  }

  public var isChecking: Bool { !runs.isEmpty }

  /// A replacement key was verified and its fresh reading saved by the
  /// service (via `ConnectionMonitor.keyReplaced`). Retire any old-key
  /// request so its late failure cannot revive the resolved incident or
  /// overwrite the new health.
  func retire(id: String) {
    guard let reading = service.connections.first(where: { $0.id == id })?.lastReading else { return }
    lastAttemptAt[id] = reading.checkedAt
    if let run = runs[id] {
      run.task?.cancel()
      finish(id, run, .success)
    } else {
      monitor.update(id, health: .ok(lastSuccess: reading.checkedAt))
    }
  }

  // MARK: Internals

  private func armTimer() {
    timer?.cancel()
    timer = clock.schedule(after: Self.nominalInterval) { [weak self] in
      guard let self else { return }
      self.armTimer()
      self.request(.timer)
    }
  }

  private func begin(_ trigger: CheckTrigger) -> [Run] {
    if trigger == .manual, isAsleep {
      // Someone clicked Refresh, so the Mac is awake: recover from a missed wake event.
      isAsleep = false
      armTimer()
    }
    guard !isAsleep else { return [] }
    let now = clock.now
    var involved: [Run] = []
    for connection in service.connections {
      if let run = runs[connection.id] {
        involved.append(run)
        continue
      }
      guard isDue(connection, trigger: trigger, now: now) else { continue }
      guard reachability.isOnline else {
        monitor.update(connection.id, health: .offline(lastSuccess: connection.lastReading?.checkedAt))
        continue
      }
      involved.append(launch(connection.id, at: now))
    }
    return involved
  }

  private func isDue(_ connection: Connection, trigger: CheckTrigger, now: Date) -> Bool {
    let last = [lastAttemptAt[connection.id], connection.lastReading?.checkedAt].compactMap { $0 }.max()
    guard let last else { return true }
    let age = now.timeIntervalSince(last)
    if age < 0 { return true } // wall clock moved backwards; do not stall
    switch trigger {
    case .manual, .launch: return true
    case .timer: return age >= Self.minimumInterval(for: connection.provider) - Self.timerSlack
    case .wake, .reconnect: return age >= Self.eventGap
    }
  }

  private func launch(_ id: String, at now: Date) -> Run {
    let run = Run(epoch: epoch)
    runs[id] = run
    lastAttemptAt[id] = now
    monitor.update(id, health: .checking)
    run.timeout = clock.schedule(after: Self.checkTimeout) { [weak self] in
      self?.finish(id, run, .timedOut)
    }
    run.task = Task { [weak self] in
      guard let self else { return }
      do {
        try await self.service.refresh(id: id)
        self.finish(id, run, .success)
      } catch {
        self.finish(id, run, .failure(error as? MonitorError ?? .saveFailed))
      }
    }
    return run
  }

  private func finish(_ id: String, _ run: Run, _ outcome: Outcome) {
    guard runs[id] === run else { return } // already finished (timed out, then returned)
    runs[id] = nil
    run.timeout?.cancel()
    if case .timedOut = outcome { run.task?.cancel() }

    if let connection = service.connections.first(where: { $0.id == id }) {
      let lastSuccess = connection.lastReading?.checkedAt
      let result: (health: ConnectionHealth, error: MonitorError?)
      switch outcome {
      case .success:
        result = (lastSuccess.map { .ok(lastSuccess: $0) } ?? .failed(lastSuccess: nil, attempted: true), nil)
      case let .failure(error):
        result = judge(error, run: run, lastSuccess: lastSuccess)
      case .timedOut:
        result = judge(.provider(connection.provider, .unreachable), run: run, lastSuccess: lastSuccess)
      }
      monitor.checkFinished(id: id, health: result.health, error: result.error)
    } else {
      monitor.forget(id: id)
      lastAttemptAt[id] = nil
    }

    let waiters = run.waiters
    run.waiters = []
    waiters.forEach { $0.resume() }
  }

  private func judge(_ error: MonitorError, run: Run, lastSuccess: Date?) -> (ConnectionHealth, MonitorError?) {
    let unreachable: Bool
    if case .provider(_, .unreachable) = error { unreachable = true } else { unreachable = false }
    // No answer because the Mac slept or went offline mid-check: not the provider's fault.
    if unreachable, isAsleep || run.epoch != epoch || !reachability.isOnline {
      return (.offline(lastSuccess: lastSuccess), nil)
    }
    let attempted: Bool
    if case .provider = error { attempted = true } else { attempted = false }
    return (.failed(lastSuccess: lastSuccess, attempted: attempted), error)
  }

  private func markOffline() {
    for connection in service.connections where runs[connection.id] == nil {
      monitor.update(connection.id, health: .offline(lastSuccess: connection.lastReading?.checkedAt))
    }
  }

  private func wait(_ run: Run) async {
    guard runs.values.contains(where: { $0 === run }) else { return }
    await withCheckedContinuation { run.waiters.append($0) }
  }
}
