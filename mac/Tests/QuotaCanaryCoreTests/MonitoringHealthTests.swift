import Foundation
@testable import QuotaCanaryCore
import Testing

// QUO-133: failure counting, monitoring notifications, and what never counts.
// Driven end to end: scripted provider -> MonitoringService -> PollScheduler
// -> ConnectionMonitor -> AlertEvaluator -> fake notification center, over a saved state file.

private let fifteen = PollScheduler.nominalInterval
private func http(_ code: Int, _ body: String = "{}") -> ScriptedTransport.Step {
  .respond(status: code, body: body)
}

@MainActor
private final class HealthHarness {
  let clock = ManualClock(now: t0)
  let lifecycle = ManualLifecycle()
  let reachability = ScriptedReachability(online: true)
  let credentials = InMemoryCredentialStore()
  let store = InMemoryConnectionStore()
  let center: FakeNotificationCenter
  let transport: ProviderTransport
  private(set) var service: MonitoringService!
  private(set) var scheduler: PollScheduler!
  private(set) var monitor: ConnectionMonitor!
  private(set) var alerts: AlertEvaluator!
  private let ids = IDCounter()

  init(transport: ProviderTransport, permission: NotificationPermission = .allowed) {
    self.transport = transport
    center = FakeNotificationCenter(permission: permission)
    build()
  }

  convenience init(_ steps: [ScriptedTransport.Step], permission: NotificationPermission = .allowed) {
    self.init(transport: ScriptedTransport(steps), permission: permission)
  }

  /// A fresh service, scheduler and coordinator over the same saved state:
  /// what a quit and relaunch looks like.
  private func build() {
    let clock = clock
    service = MonitoringService(
      credentials: credentials, store: store, transport: transport, now: { clock.now },
      makeID: { [ids] in ids.next() }
    )
    alerts = AlertEvaluator(service: service, center: center)
    monitor = ConnectionMonitor(service: service, alerts: alerts)
    scheduler = PollScheduler(
      service: service, monitor: monitor, clock: clock, lifecycle: lifecycle, reachability: reachability
    )
  }

  func relaunch() throws {
    build()
    try service.restore()
  }

  var scripted: ScriptedTransport { transport as! ScriptedTransport }

  @discardableResult
  func connect(_ provider: ProviderID = .openrouter) async throws -> String {
    try await service.connect(provider: provider, key: secret).id
  }

  /// One manual check of everything, then any notification it caused.
  func check() async {
    await scheduler.check(.manual)
    await alerts.settle()
  }

  func state(_ id: String = "conn-1") -> MonitoringState {
    service.connections.first { $0.id == id }!.monitoring
  }

  var sent: [AlertNotification] { center.delivered.filter { $0.id.hasPrefix("quotacanary.monitor.") } }
}

@MainActor @Suite struct MonitoringHealthTests {
  @Test func failuresOneThroughFourNotifyOnceAtTheThird() async throws {
    let h = HealthHarness([ok, http(500)])
    try await h.connect()
    for n in 1...4 {
      await h.check()
      // Visible at once, stale reading kept and dated, reason is not "bad key".
      #expect(h.monitor.health["conn-1"] == .failed(lastSuccess: t0, attempted: true))
      #expect(h.monitor.errors["conn-1"]?.checkFailureMessage == Copy.checkHTTPStatus("OpenRouter", 500))
      #expect(h.service.connections[0].lastReading?.balances.first?.balance == 12.5)
      #expect(h.state().consecutiveFailures == n)
      #expect(h.sent.count == (n >= 3 ? 1 : 0))
    }
    let alert = try #require(h.sent.first)
    #expect(alert.id == "quotacanary.monitor.conn-1.failures")
    #expect(alert.title == "OpenRouter")
    #expect(alert.body == Copy.monitorFailuresBody(3, Copy.reasonProviderError("OpenRouter")))
    #expect(h.state().failureAlertSent)
    #expect(try h.store.load()[0].monitoring.consecutiveFailures == 4)
  }

  @Test func successResetsAndASeparateOutageNotifiesAgain() async throws {
    let h = HealthHarness([ok, .fail])
    try await h.connect()
    for _ in 1...3 { await h.check() }
    #expect(h.sent.count == 1)

    h.scripted.script([ok])
    await h.check()
    #expect(h.state() == MonitoringState())
    #expect(h.monitor.health["conn-1"] == .ok(lastSuccess: t0))

    h.scripted.script([.fail])
    await h.check()
    await h.check()
    #expect(h.sent.count == 1)
    await h.check()
    #expect(h.sent.count == 2)
    #expect(h.sent[1].body == Copy.monitorFailuresBody(3, Copy.reasonUnreachable("OpenRouter")))
  }

  @Test func offlineTimerTicksAndSleepNeverCount() async throws {
    let h = HealthHarness([ok, .fail])
    try await h.connect()
    h.scheduler.start()
    await h.scheduler.settle()
    await h.check()
    #expect(h.state().consecutiveFailures == 2) // launch + manual, both attempted

    // Offline: manual and timer checks are skipped, not failures.
    h.reachability.isOnline = false
    h.lifecycle.emit(.reachabilityChanged(online: false))
    await h.check()
    await h.advance(fifteen * 4)
    #expect(h.state().consecutiveFailures == 2)

    // Back online, then a night asleep: nothing is attempted while asleep.
    h.reachability.isOnline = true
    h.scripted.script([ok])
    h.lifecycle.emit(.reachabilityChanged(online: true))
    await h.scheduler.settle()
    #expect(h.state().consecutiveFailures == 0) // the reconnect check succeeded
    h.scripted.script([.fail])
    await h.check()
    let requestsBeforeSleep = h.scripted.requests.count
    h.lifecycle.emit(.willSleep)
    await h.advance(8 * 3600)
    #expect(h.scripted.requests.count == requestsBeforeSleep)
    #expect(h.state().consecutiveFailures == 1)

    // Wake checks once; only that attempted check counts.
    h.lifecycle.emit(.didWake)
    await h.scheduler.settle()
    await h.alerts.settle()
    #expect(h.state().consecutiveFailures == 2)
    #expect(h.sent.isEmpty)
  }

  @Test func droppedNetworkSleepMidCheckAndKeychainTroubleNeverCount() async throws {
    let gate = GatedTransport()
    let h = HealthHarness(transport: gate)
    let connecting = Task { try await h.connect() }
    await yieldUntil { gate.pending == 1 }
    gate.answer(at: 0, with: .success(HTTPResponse(status: 200, body: Data(#"{"data":{"total_credits":20}}"#.utf8))))
    _ = try await connecting.value

    var check = Task { await h.scheduler.check(.manual) }
    await yieldUntil { gate.pending == 1 }
    h.reachability.isOnline = false
    gate.answer(at: 0, with: .failure(TransportFailure()))
    await check.value
    #expect(h.monitor.health["conn-1"] == .offline(lastSuccess: t0))
    #expect(h.state().consecutiveFailures == 0)

    h.reachability.isOnline = true
    check = Task { await h.scheduler.check(.manual) }
    await yieldUntil { gate.pending == 1 }
    h.scheduler.handle(.willSleep)
    gate.answer(at: 0, with: .failure(TransportFailure()))
    await check.value
    #expect(h.state().consecutiveFailures == 0)

    h.credentials.failing = true
    await h.check()
    #expect(h.monitor.health["conn-1"] == .failed(lastSuccess: t0, attempted: false))
    #expect(h.state().consecutiveFailures == 0)
    #expect(h.sent.isEmpty)
  }

  @Test func rejectedKeyNotifiesAtOnceAndOnlyOnceUntilRecovery() async throws {
    let h = HealthHarness([ok, http(401, #"{"error":{"message":"key \#(secret) is invalid"}}"#)])
    try await h.connect()
    await h.check()
    #expect(h.sent.count == 1)
    let alert = try #require(h.sent.first)
    #expect(alert.id == "quotacanary.monitor.conn-1.credentials")
    #expect(alert.body == Copy.monitorKeyRejectedBody("OpenRouter"))
    #expect(!alert.body.contains(secret) && !alert.title.contains(secret))
    #expect(h.monitor.errors["conn-1"]?.checkFailureMessage == Copy.checkKeyRejected("OpenRouter"))

    for _ in 2...4 { await h.check() } // no repeat, and no extra "keeps failing" alert
    #expect(h.sent.count == 1)
    #expect(h.state().consecutiveFailures == 4)

    h.scripted.script([ok])
    await h.check()
    h.scripted.script([http(401)])
    await h.check()
    #expect(h.sent.count == 2)
  }

  @Test func replacingTheKeyEndsTheIncidentAndRearms() async throws {
    let h = HealthHarness([ok, http(401)])
    try await h.connect()
    await h.check()
    await h.check()
    #expect(h.sent.count == 1)

    h.scripted.script([ok])
    try await h.service.replaceKey(id: "conn-1", key: "sk-or-NEW-SYNTHETIC")
    h.monitor.keyReplaced(id: "conn-1")
    #expect(h.state() == MonitoringState())
    #expect(try h.store.load()[0].monitoring == MonitoringState())

    h.scripted.script([http(401)])
    await h.check()
    #expect(h.sent.count == 2)
  }

  @Test func apolloScopeFailureCountsAsCredentialsButSaysPermission() async throws {
    let h = HealthHarness([http(200, apolloFixture), http(403)])
    try await h.connect(.apollo)
    await h.check()
    #expect(h.sent.map(\.id) == ["quotacanary.monitor.conn-1.credentials"])
    #expect(h.sent.first?.body == Copy.monitorScopeBody(.apollo))
    let message = try #require(h.monitor.errors["conn-1"]?.checkFailureMessage)
    #expect(message == Copy.checkKeyLacksScope(.apollo))
    #expect(!message.contains("rejected"))
  }

  @Test func rateLimitCountsButIsNotACredentialProblem() async throws {
    let h = HealthHarness([ok, http(429)])
    try await h.connect()
    await h.check()
    #expect(h.monitor.errors["conn-1"] == .provider(.openrouter, .rateLimited))
    #expect(h.monitor.errors["conn-1"]?.checkFailureMessage == Copy.checkRateLimited("OpenRouter"))
    #expect(h.sent.isEmpty)
    await h.check()
    await h.check()
    #expect(h.sent.map(\.id) == ["quotacanary.monitor.conn-1.failures"])
    #expect(h.sent.first?.body == Copy.monitorFailuresBody(3, Copy.reasonRateLimited("OpenRouter")))
  }

  @Test func everyProviderReads429AsRateLimited() {
    // No headers: People Data Labs reads a 429 as rate limited only when its limit header is absent.
    let response = HTTPResponse(status: 429, body: Data("{}".utf8))
    let parsers: [(HTTPResponse) throws -> [PoolBalance]] = [OpenRouter.parse, Tavily.parse, Apollo.parse, Lemlist.parse,
      PeopleDataLabs.parse, PhantomBuster.parse, { _ = try Deepgram.parseProjects($0); return [] },
      { _ = try Webshare.parseObject($0); return [] }, { _ = try Decodo.parseSubscriptions($0); return [] }, Brevo.parse,
      Twilio.parse, Plivo.parse, Vonage.parse, DataForSEO.parse, Tomba.parse, { _ = try Snov.parseToken($0); return [] },
      Snov.parseBalance, Verifalia.parse, PredictLeads.parse, { try Crawlbase.parse($0, product: "crawling-api") },
      Hyperbolic.parse, Orthogonal.parse, ZeroBounce.parse, RocketReach.parse, EnrichCRM.parse, Majestic.parse,
      { try Mangools.parseRequests($0); return [] }, Mangools.parseLimits, Semrush.parse,
      Ahrefs.parse, { try Diffbot.parse($0) }, NetNut.parse,
      ContactOut.parse, Meltly.parse, DeepSeek.parse, Firecrawl.parse,
      { _ = try Apify.parseMe($0); return [] }, { try Apify.parseLimits($0, included: 1) }, YouCom.parse]
    for parse in parsers {
      #expect(throws: ProviderReadError.rateLimited) { try parse(response) }
    }
    // Every catalog entry too, unless one overrides 429 explicitly (none does).
    for entry in ProviderRegistry.current.entries {
      #expect(throws: ProviderReadError.rateLimited, "\(entry.id)") { try CatalogProvider.parse(entry, response) }
    }
  }

  @Test func deniedOrFailedDeliveryKeepsTheStateAndShowsInThePanel() async throws {
    let h = HealthHarness([ok, http(500)], permission: .denied)
    try await h.connect()
    for _ in 1...3 { await h.check() }
    #expect(h.sent.isEmpty)
    #expect(!h.state().failureAlertSent)
    #expect(h.alerts.problem == .notSubmitted(.denied))

    h.center.permission = .allowed
    h.center.failDeliveries = true
    await h.check() // 4th: retried, macOS refuses
    #expect(h.alerts.problem == .failed)
    #expect(!h.state().failureAlertSent)

    h.center.failDeliveries = false
    await h.check() // 5th: goes out, once
    await h.check()
    #expect(h.sent.count == 1)
    #expect(h.sent.first?.body == Copy.monitorFailuresBody(5, Copy.reasonProviderError("OpenRouter")))
    #expect(h.alerts.problem == nil)
    #expect(h.alerts.monitoringAttempts.map(\.outcome) == [
      .notSubmitted(.denied), .failed, .handedToMacOS,
    ])
  }

  @Test func relaunchKeepsTheCountAndNeverDoubleNotifies() async throws {
    let h = HealthHarness([ok, http(500)])
    try await h.connect()
    await h.check()
    await h.check()
    try h.relaunch()
    #expect(h.state().consecutiveFailures == 2) // the incident is remembered
    await h.check()
    #expect(h.sent.count == 1)

    try h.relaunch()
    #expect(h.state() == MonitoringState(consecutiveFailures: 3, failureAlertSent: true))
    await h.check()
    #expect(h.sent.count == 1)
    #expect(h.state().consecutiveFailures == 4)
  }

  @Test func oneConnectionNeverAffectsAnother() async throws {
    let openRouter = ScriptedTransport([ok, .fail])
    let hunter = ScriptedTransport([http(200, hunterFixture)])
    let h = HealthHarness(transport: RoutedTransport([
      OpenRouter.creditsURL.host!: openRouter, "api.hunter.io": hunter,
    ]))
    try await h.connect(.openrouter)
    try await h.connect(.hunter)
    let hunterReading = h.service.connections[1].lastReading?.balances
    for _ in 1...3 { await h.check() }

    #expect(h.state("conn-1").consecutiveFailures == 3)
    #expect(h.state("conn-2") == MonitoringState())
    #expect(h.monitor.health["conn-2"] == .ok(lastSuccess: t0))
    #expect(h.service.connections[1].lastReading?.balances == hunterReading)
    #expect(h.service.connections[0].lastReading?.balances.first?.balance == 12.5)
    #expect(h.sent.map(\.id) == ["quotacanary.monitor.conn-1.failures"])
  }

  @Test func oldStateFilesLoadWithZeroFailures() throws {
    let old = #"{"version":1,"connections":[{"id":"a","provider":"openrouter","name":"OpenRouter","credentialRef":"a"}]}"#
    #expect(try StateCoding.decode(Data(old.utf8))[0].monitoring == MonitoringState())
    let partial = #"{"version":1,"connections":[{"id":"a","provider":"openrouter","name":"OpenRouter","credentialRef":"a","monitoring":{"consecutiveFailures":2}}]}"#
    #expect(try StateCoding.decode(Data(partial.utf8))[0].monitoring == MonitoringState(consecutiveFailures: 2))
  }

  @Test func decisionTable() {
    let fresh = MonitoringState(consecutiveFailures: 1)
    #expect(MonitoringDecider.due(fresh, reason: .keyRejected) == .credentials)
    #expect(MonitoringDecider.due(fresh, reason: .keyLacksScope) == .credentials)
    #expect(MonitoringDecider.due(fresh, reason: .rateLimited) == nil)
    #expect(MonitoringDecider.due(MonitoringState(consecutiveFailures: 2), reason: .unreachable) == nil)
    #expect(MonitoringDecider.due(MonitoringState(consecutiveFailures: 3), reason: .unreachable) == .failures)
    #expect(MonitoringDecider.due(
      MonitoringState(consecutiveFailures: 4, failureAlertSent: true), reason: .unreachable
    ) == nil)
    // A credential alert already told the user about this incident.
    #expect(MonitoringDecider.due(
      MonitoringState(consecutiveFailures: 3, credentialAlertSent: true), reason: .providerError
    ) == nil)
    // But a failures alert does not hide a newly rejected key.
    #expect(MonitoringDecider.due(
      MonitoringState(consecutiveFailures: 4, failureAlertSent: true), reason: .keyRejected
    ) == .credentials)
  }

  @Test func messagesNeverCarryKeysOrProviderTextAndOnlyBadKeysSayRejected() {
    let errors: [ProviderReadError] = [
      .unreachable, .keyRejected, .httpStatus(503), .notJSON, .missingField(secret), .keyLacksScope,
      .reportedError(nil), .rateLimited,
    ]
    let connection = Connection(id: "conn-1", provider: .hunter, name: "Client work", credentialRef: "conn-1", lastReading: nil)
    for error in errors {
      let message = MonitorError.provider(.hunter, error).checkFailureMessage
      #expect(!message.contains(secret))
      #expect(message.contains("rejected") == (error == .keyRejected))
      #expect(!message.contains("\u{2014}"))
      guard let reason = CheckFailureReason(.provider(.hunter, error)) else { continue }
      for kind in [MonitoringAlertKind.failures, .credentials] {
        let alert = MonitoringContent.make(connection: connection, kind: kind, reason: reason)
        #expect(alert.title == "Hunter · Client work")
        #expect(!alert.body.contains(secret) && !alert.body.contains("\u{2014}"))
      }
    }
    #expect(CheckFailureReason(.credentialReadFailed) == nil)
    #expect(CheckFailureReason(.saveFailed) == nil)
  }
}

private final class IDCounter {
  private var n = 0
  func next() -> String {
    n += 1
    return "conn-\(n)"
  }
}

private extension HealthHarness {
  func advance(_ seconds: TimeInterval) async {
    clock.advance(by: seconds)
    await scheduler.settle()
    await alerts.settle()
  }
}
