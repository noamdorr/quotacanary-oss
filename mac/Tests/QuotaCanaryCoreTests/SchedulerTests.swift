import Combine
import Foundation
@testable import QuotaCanaryCore
import Testing

private let fifteen = PollScheduler.nominalInterval
private func balanceBody(_ used: Double) -> String {
  #"{"data":{"total_credits":20,"total_usage":\#(used)}}"#
}

/// One OpenRouter connection ("conn-1", connected at t0) behind a scheduler
/// with a hand-advanced clock, scripted lifecycle and scripted network.
@MainActor
final class SchedulerHarness {
  let clock = ManualClock(now: t0)
  let lifecycle = ManualLifecycle()
  let reachability = ScriptedReachability(online: true)
  let credentials = InMemoryCredentialStore()
  let store = InMemoryConnectionStore()
  let transport: ProviderTransport
  let service: MonitoringService
  let monitor: ConnectionMonitor
  let scheduler: PollScheduler

  init(transport: ProviderTransport) {
    self.transport = transport
    let clock = clock
    service = MonitoringService(
      credentials: credentials, store: store, transport: transport,
      now: { clock.now }, makeID: { "conn-1" }
    )
    monitor = ConnectionMonitor(service: service)
    scheduler = PollScheduler(
      service: service, monitor: monitor, clock: clock, lifecycle: lifecycle, reachability: reachability
    )
  }

  convenience init(_ steps: [ScriptedTransport.Step] = [ok]) {
    self.init(transport: ScriptedTransport(steps))
  }

  var scripted: ScriptedTransport { transport as! ScriptedTransport }
  var requests: Int { scripted.requests.count }
  var health: ConnectionHealth? { monitor.health["conn-1"] }

  func connect() async throws {
    try await service.connect(provider: .openrouter, key: secret)
  }

  /// Advances the clock and lets any checks it started finish.
  func advance(_ seconds: TimeInterval) async {
    clock.advance(by: seconds)
    await scheduler.settle()
  }
}

/// Holds every request until the test answers it, in any order.
final class GatedTransport: ProviderTransport, @unchecked Sendable {
  private let lock = NSLock()
  private var waiting: [CheckedContinuation<HTTPResponse, Error>] = []
  private var count = 0

  func send(_: HTTPRequest) async throws -> HTTPResponse {
    try await withCheckedThrowingContinuation { continuation in
      lock.lock()
      waiting.append(continuation)
      count += 1
      lock.unlock()
    }
  }

  var pending: Int { lock.lock(); defer { lock.unlock() }; return waiting.count }
  var requestCount: Int { lock.lock(); defer { lock.unlock() }; return count }

  func answer(at index: Int, with result: Result<HTTPResponse, Error>) {
    lock.lock()
    let continuation = waiting.remove(at: index)
    lock.unlock()
    continuation.resume(with: result)
  }
}

/// Lets tasks on the main actor run until `condition` holds (bounded).
@MainActor
func yieldUntil(_ condition: () -> Bool) async {
  for _ in 0..<1000 where !condition() {
    await Task.yield()
  }
}

@MainActor @Suite struct SchedulerTests {
  @Test func cadenceChecksAtLaunchThenEveryFifteenMinutes() async throws {
    let h = SchedulerHarness()
    try await h.connect()
    #expect(h.requests == 1)

    h.scheduler.start()
    await h.scheduler.settle()
    #expect(h.requests == 2) // launch asks for a fresh check even though connect just read
    #expect(h.health == .ok(lastSuccess: t0))

    await h.advance(fifteen - 1)
    #expect(h.requests == 2)
    await h.advance(1)
    #expect(h.requests == 3)
    #expect(h.health == .ok(lastSuccess: t0.addingTimeInterval(fifteen)))
    await h.advance(fifteen)
    await h.advance(fifteen)
    #expect(h.requests == 5)
  }

  @Test func launchWithNothingConnectedSendsNothing() async {
    let h = SchedulerHarness()
    h.scheduler.start()
    await h.advance(fifteen * 3)
    #expect(h.requests == 0)
    #expect(h.monitor.health.isEmpty)
  }

  @Test func wakeChecksOnceWithoutCatchUpBurst() async throws {
    let h = SchedulerHarness()
    try await h.connect()
    h.scheduler.start()
    await h.scheduler.settle()
    #expect(h.requests == 2)

    h.lifecycle.emit(.willSleep)
    await h.advance(8 * 3600) // a night asleep: 32 missed intervals
    #expect(h.requests == 2)

    h.lifecycle.emit(.didWake)
    await h.scheduler.settle()
    #expect(h.requests == 3) // one check, not 32

    // The timer restarts from the wake, not from the old schedule.
    await h.advance(fifteen - 1)
    #expect(h.requests == 3)
    await h.advance(1)
    #expect(h.requests == 4)
  }

  @Test func wakeRightAfterACheckDoesNotCheckAgain() async throws {
    let h = SchedulerHarness()
    try await h.connect()
    h.scheduler.start()
    await h.scheduler.settle()
    h.lifecycle.emit(.willSleep)
    await h.advance(10) // a lid bounce
    h.lifecycle.emit(.didWake)
    await h.scheduler.settle()
    #expect(h.requests == 2)
  }

  @Test func concurrentTriggersCoalesceIntoOneRequest() async throws {
    let gate = GatedTransport()
    let h = SchedulerHarness(transport: gate)
    let connecting = Task { try await h.service.connect(provider: .openrouter, key: secret) }
    await yieldUntil { gate.pending == 1 }
    gate.answer(at: 0, with: .success(HTTPResponse(status: 200, body: Data(balanceBody(7.5).utf8))))
    _ = try await connecting.value

    h.scheduler.start() // launch
    await yieldUntil { gate.pending == 1 }
    h.scheduler.request(.timer) // timer tick (called directly: advancing 15 min would also hit the check timeout)
    h.lifecycle.emit(.willSleep)
    h.lifecycle.emit(.didWake) // wake
    h.scheduler.request(.manual) // manual
    let manual = Task { await h.scheduler.check(.manual) }
    await yieldUntil { gate.requestCount > 2 }
    #expect(gate.requestCount == 2) // connect + one check, no parallel duplicates
    #expect(h.health == .checking)

    gate.answer(at: 0, with: .success(HTTPResponse(status: 200, body: Data(balanceBody(10).utf8))))
    await manual.value // the joined manual refresh waits for the shared result
    #expect(h.service.connections[0].lastReading?.balances.first?.balance == 10)

    // Once it lands, the next trigger checks again.
    let next = Task { await h.scheduler.check(.manual) }
    await yieldUntil { gate.pending == 1 }
    #expect(gate.requestCount == 3)
    gate.answer(at: 0, with: .success(HTTPResponse(status: 200, body: Data(balanceBody(11).utf8))))
    await next.value
  }

  @Test func staleResultDoesNotOverwriteNewerReading() async throws {
    let gate = GatedTransport()
    let credentials = InMemoryCredentialStore()
    let store = InMemoryConnectionStore()
    try credentials.save(secret, ref: "conn-1")
    try store.save([Connection(
      id: "conn-1", provider: .openrouter, name: "OpenRouter", credentialRef: "conn-1", lastReading: nil
    )])
    var clock = t0
    let service = MonitoringService(
      credentials: credentials, store: store, transport: gate, now: { clock }
    )
    try service.restore()

    clock = t0.addingTimeInterval(100)
    let slow = Task { try await service.refresh(id: "conn-1") }
    await yieldUntil { gate.pending == 1 }
    clock = t0.addingTimeInterval(200)
    let fast = Task { try await service.refresh(id: "conn-1") }
    await yieldUntil { gate.pending == 2 }

    gate.answer(at: 1, with: .success(HTTPResponse(status: 200, body: Data(balanceBody(10).utf8))))
    _ = try await fast.value
    gate.answer(at: 0, with: .success(HTTPResponse(status: 200, body: Data(balanceBody(2).utf8))))
    _ = try await slow.value

    let newer = Reading(
      balances: [PoolBalance(pool: OpenRouter.creditsPool, balance: 10)],
      checkedAt: t0.addingTimeInterval(200)
    )
    #expect(service.connections[0].lastReading == newer)
    #expect(try store.load()[0].lastReading == newer)
  }

  @Test func offlineSkipsWithoutCountingAsAttemptedFailure() async throws {
    let h = SchedulerHarness()
    try await h.connect()
    h.reachability.isOnline = false
    h.scheduler.start()
    await h.scheduler.check(.manual)
    await h.advance(fifteen)
    #expect(h.requests == 1) // only the connect
    #expect(h.health == .offline(lastSuccess: t0))
    #expect(h.monitor.errors.isEmpty)
  }

  @Test func providerFailureWhileOnlineCountsAsAttempted() async throws {
    let h = SchedulerHarness([ok, .respond(status: 500, body: "")])
    try await h.connect()
    await h.scheduler.check(.manual)
    #expect(h.health == .failed(lastSuccess: t0, attempted: true))
    #expect(h.monitor.errors["conn-1"] == .provider(.openrouter, .httpStatus(500)))
    #expect(h.service.connections[0].lastReading?.balances.first?.balance == 12.5)
  }

  @Test func replacementKeyClearsFailedHealthAndFutureSyncUsesNewReading() async throws {
    let h = SchedulerHarness([ok, .respond(status: 401, body: "{}"), ok])
    try await h.connect()
    await h.scheduler.check(.manual)
    #expect(h.health == .failed(lastSuccess: t0, attempted: true))
    #expect(h.monitor.errors["conn-1"] == .provider(.openrouter, .keyRejected))

    h.clock.advance(by: 10)
    try await h.service.replaceKey(id: "conn-1", key: "SYNTHETIC-replacement")
    h.monitor.keyReplaced(id: "conn-1")
    let recovered = ConnectionHealth.ok(lastSuccess: t0.addingTimeInterval(10))
    #expect(h.health == recovered)
    #expect(h.monitor.record(for: "conn-1").error == nil)
    #expect(h.monitor.record(for: "conn-1").message == nil)
    h.scheduler.request(.timer) // Not due: the record keeps the new key's state.
    #expect(h.monitor.record(for: "conn-1").health == recovered)
    #expect(h.monitor.record(for: "conn-1").error == nil)
    #expect(h.requests == 3) // Replacement's verification is sufficient.
  }

  @Test(arguments: [200, 401]) func lateOldKeyResultCannotUndoSuccessfulReplacement(status: Int) async throws {
    let gate = GatedTransport()
    let h = SchedulerHarness(transport: gate)
    let response = HTTPResponse(status: 200, body: Data(balanceBody(7.5).utf8))
    let connecting = Task { try await h.connect() }
    await yieldUntil { gate.pending == 1 }
    gate.answer(at: 0, with: .success(response))
    try await connecting.value

    var completed: [ConnectionHealth] = []
    let watching = h.monitor.$health.dropFirst().compactMap { $0["conn-1"] }.filter { $0 != .checking }
      .sink { completed.append($0) }
    defer { watching.cancel() }
    let oldCheck = Task { await h.scheduler.check(.manual) }
    await yieldUntil { gate.pending == 1 }
    let replacing = Task { try await h.service.replaceKey(id: "conn-1", key: "SYNTHETIC-replacement") }
    await yieldUntil { gate.pending == 2 }
    gate.answer(at: 1, with: .success(response))
    _ = try await replacing.value
    h.monitor.keyReplaced(id: "conn-1")
    await oldCheck.value // Joined waiters are released when the old run retires.
    #expect(!h.scheduler.isChecking)

    // Both requests have the same timestamp: cancellation must protect the
    // verified reading even when timestamp ordering cannot distinguish them.
    gate.answer(at: 0, with: .success(HTTPResponse(status: status, body: Data(balanceBody(19).utf8))))
    for _ in 0..<10 { await Task.yield() }
    let recovered = ConnectionHealth.ok(lastSuccess: t0)
    #expect(h.health == recovered)
    #expect(h.monitor.errors.isEmpty)
    #expect(completed == [recovered])
    #expect(h.service.connections[0].lastReading?.balances.first?.balance == 12.5)
    #expect(try h.store.load()[0].lastReading?.balances.first?.balance == 12.5)
  }

  @Test func keychainFailureIsFailedButNotAnAttemptedProviderFailure() async throws {
    let h = SchedulerHarness()
    try await h.connect()
    h.credentials.failing = true
    await h.scheduler.check(.manual)
    #expect(h.health == .failed(lastSuccess: t0, attempted: false))
    #expect(h.requests == 1)
  }

  @Test func networkDroppingMidCheckIsOfflineNotAttempted() async throws {
    let gate = GatedTransport()
    let h = SchedulerHarness(transport: gate)
    let connecting = Task { try await h.service.connect(provider: .openrouter, key: secret) }
    await yieldUntil { gate.pending == 1 }
    gate.answer(at: 0, with: .success(HTTPResponse(status: 200, body: Data(balanceBody(7.5).utf8))))
    _ = try await connecting.value

    let check = Task { await h.scheduler.check(.manual) }
    await yieldUntil { gate.pending == 1 }
    h.reachability.isOnline = false // the path went down while the request was out
    gate.answer(at: 0, with: .failure(TransportFailure()))
    await check.value
    #expect(h.health == .offline(lastSuccess: t0))
    #expect(h.monitor.errors.isEmpty)
  }

  @Test func sleepingMidCheckIsOfflineNotAttempted() async throws {
    let gate = GatedTransport()
    let h = SchedulerHarness(transport: gate)
    let connecting = Task { try await h.service.connect(provider: .openrouter, key: secret) }
    await yieldUntil { gate.pending == 1 }
    gate.answer(at: 0, with: .success(HTTPResponse(status: 200, body: Data(balanceBody(7.5).utf8))))
    _ = try await connecting.value

    let check = Task { await h.scheduler.check(.manual) }
    await yieldUntil { gate.pending == 1 }
    h.scheduler.handle(.willSleep)
    gate.answer(at: 0, with: .failure(TransportFailure()))
    await check.value
    #expect(h.health == .offline(lastSuccess: t0))
    #expect(h.monitor.errors.isEmpty)
  }

  @Test func timeoutIsBounded() async throws {
    let h = SchedulerHarness([ok, .hang])
    try await h.connect()
    h.scheduler.request(.manual)
    await yieldUntil { h.requests == 2 }
    #expect(h.health == .checking)

    h.clock.advance(by: PollScheduler.checkTimeout - 1)
    #expect(h.health == .checking)
    h.clock.advance(by: 1)
    #expect(h.health == .failed(lastSuccess: t0, attempted: true))
    #expect(h.monitor.errors["conn-1"] == .provider(.openrouter, .unreachable))
    #expect(!h.scheduler.isChecking)
    #expect(h.service.connections[0].lastReading?.checkedAt == t0)

    // The hung request does not block the next check.
    h.scripted.script([ok])
    await h.scheduler.check(.manual)
    #expect(h.requests == 3)
    #expect(h.health == .ok(lastSuccess: t0.addingTimeInterval(PollScheduler.checkTimeout)))
  }

  @Test func reachabilityRegainedTriggersOneCheck() async throws {
    let h = SchedulerHarness()
    try await h.connect()
    h.scheduler.start()
    await h.scheduler.settle()
    #expect(h.requests == 2)

    h.reachability.isOnline = false
    h.lifecycle.emit(.reachabilityChanged(online: false))
    #expect(h.health == .offline(lastSuccess: t0))
    await h.advance(fifteen) // timer tick while offline: skipped, not a failure
    #expect(h.requests == 2)
    #expect(h.health == .offline(lastSuccess: t0))

    h.reachability.isOnline = true
    h.lifecycle.emit(.reachabilityChanged(online: true))
    h.lifecycle.emit(.reachabilityChanged(online: true)) // duplicate path update
    await h.scheduler.settle()
    #expect(h.requests == 3)
    #expect(h.health == .ok(lastSuccess: t0.addingTimeInterval(fifteen)))

    // Timer restarted from the reconnect.
    await h.advance(fifteen)
    #expect(h.requests == 4)
  }

  @Test func timerRespectsTheProviderMinimumInterval() async throws {
    let h = SchedulerHarness()
    try await h.connect()
    h.scheduler.start()
    await h.scheduler.settle()
    await h.advance(10 * 60)
    await h.scheduler.check(.manual) // manual always goes out
    #expect(h.requests == 3)
    await h.advance(5 * 60) // timer at 15 min: only 5 min since the manual check
    #expect(h.requests == 3)
    await h.advance(fifteen) // timer at 30 min: 20 min since
    #expect(h.requests == 4)
    #expect(PollScheduler.minimumInterval(for: .hunter) >= fifteen)
    #expect(PollScheduler.minimumInterval(for: .openrouter) >= fifteen)
  }

  @Test func manualRefreshRecoversFromAMissedWakeEvent() async throws {
    let h = SchedulerHarness()
    try await h.connect()
    h.scheduler.start()
    await h.scheduler.settle()
    h.scheduler.handle(.willSleep)
    await h.advance(3600) // didWake never arrives
    await h.scheduler.check(.manual)
    #expect(h.requests == 3)
    #expect(!h.scheduler.isAsleep)
    await h.advance(fifteen)
    #expect(h.requests == 4)
  }

  @Test func removedConnectionMidCheckLeavesNoHealth() async throws {
    let gate = GatedTransport()
    let h = SchedulerHarness(transport: gate)
    let connecting = Task { try await h.service.connect(provider: .openrouter, key: secret) }
    await yieldUntil { gate.pending == 1 }
    gate.answer(at: 0, with: .success(HTTPResponse(status: 200, body: Data(balanceBody(7.5).utf8))))
    _ = try await connecting.value

    let check = Task { await h.scheduler.check(.manual) }
    await yieldUntil { gate.pending == 1 }
    try h.service.remove(id: "conn-1")
    gate.answer(at: 0, with: .success(HTTPResponse(status: 200, body: Data(balanceBody(1).utf8))))
    await check.value
    #expect(h.monitor.health.isEmpty)
    #expect(h.service.connections.isEmpty)
  }
}
