import Foundation
@testable import QuotaCanaryCore
import Testing

// QUO-310: the connection monitoring record end to end. A scripted provider
// fails, the scheduler reports each check to the record, and the record is
// what the panel reads and what decides the notification, across a relaunch.

/// The app's monitoring wiring over saved state: what a launch builds.
@MainActor
private final class MonitoredApp {
  let service: MonitoringService
  let alerts: AlertEvaluator
  let monitor: ConnectionMonitor
  let scheduler: PollScheduler

  init(store: ConnectionStore, credentials: CredentialStore, transport: ProviderTransport, center: NotificationCenterLike) {
    let clock = ManualClock(now: t0)
    service = MonitoringService(
      credentials: credentials, store: store, transport: transport, now: { clock.now }, makeID: { "conn-1" }
    )
    alerts = AlertEvaluator(service: service, center: center)
    monitor = ConnectionMonitor(service: service, alerts: alerts)
    scheduler = PollScheduler(
      service: service, monitor: monitor, clock: clock, lifecycle: ManualLifecycle(),
      reachability: ScriptedReachability(online: true)
    )
  }

  func check() async {
    await scheduler.check(.manual)
    await alerts.settle()
  }
}

@MainActor @Suite struct ConnectionMonitorTests {
  /// A connection that leaves the service (removed, moved, erased) takes its
  /// record with it; nobody calls `forget` after a removal (QUO-311).
  @Test func aRemovedConnectionsRecordGoesWithIt() async throws {
    let app = MonitoredApp(
      store: InMemoryConnectionStore(), credentials: InMemoryCredentialStore(),
      transport: ScriptedTransport([ok, .respond(status: 500, body: "{}")]), center: FakeNotificationCenter(permission: .allowed)
    )
    try await app.service.connect(provider: .openrouter, key: "k-SYNTHETIC")
    await app.check()
    #expect(app.monitor.record(for: "conn-1").message != nil)

    try app.service.remove(id: "conn-1")
    let record = app.monitor.record(for: "conn-1")
    #expect(record.health == nil && record.error == nil && record.message == nil)
  }

  @Test func threeFailedChecksAcrossARelaunchMakeAStreakOfThreeAndOneNotification() async throws {
    let store = InMemoryConnectionStore()
    let credentials = InMemoryCredentialStore()
    let transport = ScriptedTransport([ok, .respond(status: 500, body: "{}")])
    let center = FakeNotificationCenter(permission: .allowed)
    var app = MonitoredApp(store: store, credentials: credentials, transport: transport, center: center)
    try await app.service.connect(provider: .openrouter, key: secret)
    await app.check()
    await app.check()
    #expect(app.monitor.record(for: "conn-1").streak.consecutiveFailures == 2)

    // Quit and relaunch: only what was saved survives.
    app = MonitoredApp(store: store, credentials: credentials, transport: transport, center: center)
    try app.service.restore()
    await app.check()

    let record = app.monitor.record(for: "conn-1")
    #expect(record.streak.consecutiveFailures == 3)
    #expect(record.health == .failed(lastSuccess: t0, attempted: true))
    #expect(record.error == .provider(.openrouter, .httpStatus(500)))
    #expect(record.message == Copy.checkHTTPStatus("OpenRouter", 500))
    #expect(record.lastCheck?.status == 500)
    #expect(center.delivered.map(\.id) == ["quotacanary.monitor.conn-1.failures"])
    #expect(center.delivered.first?.body == Copy.monitorFailuresBody(3, Copy.reasonProviderError("OpenRouter")))
    #expect(app.monitor.record(for: "conn-1").streak.failureAlertSent)

    // The fourth failure counts but never repeats the notification.
    await app.check()
    #expect(app.monitor.record(for: "conn-1").streak.consecutiveFailures == 4)
    #expect(center.delivered.count == 1)
  }
}
