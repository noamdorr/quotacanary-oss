import Foundation
@testable import QuotaCanaryCore
import Testing

// QUO-131: which readings notify, how marks move, and what happens when
// macOS says no. Verifications has a 1,000 cap, low 300, critical 100.

private let verifications = Pool(creditType: "verifications", label: "Verifications", unit: .credits, cap: 1000)
private let searches = Pool(creditType: "searches", label: "Searches", unit: .credits, cap: 500)
private let limits = PoolSettings(monitored: true, low: 300, critical: 100)
private let alertKey = "hunter-SYNTHETIC-ALERT-MARKER"

private func hunter(
  id: String = "hu-1", name: String = "Hunter", verifications v: Double? = 900, searches s: Double? = 400,
  settings: [String: PoolSettings] = ["verifications": limits, "searches": limits],
  marks: [String: AlertSeverity] = [:]
) -> Connection {
  var balances: [PoolBalance] = []
  if let v { balances.append(PoolBalance(pool: verifications, balance: v)) }
  if let s { balances.append(PoolBalance(pool: searches, balance: s)) }
  return Connection(
    id: id, provider: .hunter, name: name, credentialRef: id,
    lastReading: Reading(balances: balances, checkedAt: t0), poolSettings: settings, alertMarks: marks
  )
}

private func row(_ connection: Connection, _ creditType: String = "verifications") -> PoolRow {
  connection.poolRows.first { $0.key.creditType == creditType }!
}

private func decide(_ balance: Double, mark: AlertSeverity = .none, settings: PoolSettings = limits) -> AlertDecision {
  AlertDecider.decide(mark: mark, row: row(hunter(verifications: balance, settings: ["verifications": settings])))
}

/// One store, one fake notification center, a coordinator over a restored
/// service. `set` simulates a new reading without a network.
@MainActor
private final class AlertHarness {
  let store = InMemoryConnectionStore()
  let center: FakeNotificationCenter
  let credentials = InMemoryCredentialStore()
  let transport = ScriptedTransport([ok])
  private(set) var service: MonitoringService
  private(set) var alerts: AlertEvaluator

  init(_ connections: [Connection], permission: NotificationPermission = .allowed) throws {
    center = FakeNotificationCenter(permission: permission)
    try store.save(connections)
    for connection in connections { try credentials.save(alertKey, ref: connection.credentialRef) }
    service = MonitoringService(credentials: credentials, store: store, transport: transport)
    try service.restore()
    alerts = AlertEvaluator(service: service, center: center)
  }

  func set(_ creditType: String, _ balance: Double, id: String = "hu-1") throws {
    var all = service.connections
    let index = all.firstIndex { $0.id == id }!
    var reading = all[index].lastReading!
    let pool = creditType == "searches" ? searches : verifications
    reading.balances.removeAll { $0.pool.creditType == creditType }
    reading.balances.append(PoolBalance(pool: pool, balance: balance))
    reading.checkedAt = reading.checkedAt.addingTimeInterval(900)
    all[index].lastReading = reading
    try store.save(all)
    try service.restore()
  }

  func relaunch() throws {
    service = MonitoringService(credentials: credentials, store: store, transport: transport)
    try service.restore()
    alerts = AlertEvaluator(service: service, center: center)
  }

  func mark(_ creditType: String = "verifications", id: String = "hu-1") -> AlertSeverity {
    service.connections.first { $0.id == id }!.alertMark(for: creditType)
  }

  var bodies: [String] { center.delivered.map(\.body) }

  func refreshOpenRouter(_ balance: Double, id: String = "or-1") async throws {
    transport.script([.respond(status: 200, body: #"{"data":{"total_credits":\#(balance),"total_usage":0}}"#)])
    try await service.refresh(id: id)
  }
}

private func openRouterConnection(id: String = "or-1", balance: Double = 0) -> Connection {
  Connection(
    id: id, provider: .openrouter, name: "OpenRouter", credentialRef: id,
    lastReading: Reading(balances: [PoolBalance(pool: OpenRouter.creditsPool, balance: balance)], checkedAt: t0),
    poolSettings: ["credits": PoolSettings(monitored: true, low: 10, critical: 3)]
  )
}

@Suite struct AlertDeciderTests {
  @Test func thresholdBoundariesAreInclusive() {
    #expect(decide(300.01).notify == nil)
    #expect(decide(300).notify == .low)
    #expect(decide(100.01).notify == .low)
    #expect(decide(100).notify == .critical)
    #expect(decide(0.01).notify == .critical)
    #expect(decide(0).notify == .empty)
    #expect(decide(-2).notify == .empty)
  }

  @Test func healthyToEmptyIsOneEmptyAlert() {
    #expect(decide(0) == AlertDecision(notify: .empty, mark: .none))
  }

  @Test func unchangedSeverityIsSilentAndKeepsTheMark() {
    #expect(decide(250, mark: .low) == AlertDecision(notify: nil, mark: .low))
    #expect(decide(0, mark: .empty) == AlertDecision(notify: nil, mark: .empty))
  }

  @Test func worseningNotifiesAtTheNewSeverity() {
    #expect(decide(50, mark: .low).notify == .critical)
    #expect(decide(0, mark: .critical).notify == .empty)
    #expect(decide(0, mark: .low).notify == .empty)
  }

  @Test func improvingButStillWarningKeepsTheHigherMark() {
    #expect(decide(250, mark: .critical) == AlertDecision(notify: nil, mark: .critical))
    #expect(decide(50, mark: .empty) == AlertDecision(notify: nil, mark: .empty))
  }

  @Test func recoveryAboveLowRearms() {
    #expect(decide(301, mark: .empty) == AlertDecision(notify: nil, mark: .none))
    // Exactly on low is still low: not recovered.
    #expect(decide(300, mark: .critical) == AlertDecision(notify: nil, mark: .critical))
  }

  @Test func mutedUnavailableAndUnknownPoolsNeverAlertAndKeepTheirMark() {
    let muted = PoolSettings(monitored: false, low: 300, critical: 100)
    #expect(decide(0, mark: .low, settings: muted) == AlertDecision(notify: nil, mark: .low))
    #expect(decide(0, settings: muted).notify == nil)

    let notInPlan = Pool(creditType: "searches", label: "Searches", unit: .credits, cap: 0)
    var connection = hunter(marks: ["searches": .low])
    connection.lastReading?.balances = [PoolBalance(pool: notInPlan, balance: 0)]
    #expect(AlertDecider.decide(mark: .low, row: row(connection, "searches")) == AlertDecision(notify: nil, mark: .low))
    // Verifications was not reported: unknown.
    #expect(AlertDecider.decide(mark: .critical, row: row(connection)) == AlertDecision(notify: nil, mark: .critical))
  }

  @Test func worstAlertIgnoresMutedPools() {
    let muted = PoolSettings(monitored: false, low: 300, critical: 100)
    #expect([hunter(verifications: 0, settings: ["verifications": muted, "searches": limits])].worstAlert == .none)
    #expect([hunter(verifications: 250), hunter(id: "hu-2", verifications: 50)].worstAlert == .critical)
    #expect([hunter(verifications: 900, searches: 0)].worstAlert == .empty)
  }

  @Test func contentNamesConnectionPoolAmountAndSeverityOnly() {
    let named = hunter(name: "Client work", verifications: 280)
    let low = AlertContent.make(connection: named, row: row(named), severity: .low)
    #expect(low.title == "Hunter · Client work")
    #expect(low.body == "Verifications low: 280 of 1,000 left")

    let plain = hunter(verifications: 900, searches: 0)
    let empty = AlertContent.make(connection: plain, row: row(plain, "searches"), severity: .empty)
    #expect(empty.title == "Hunter")
    #expect(empty.body == "Searches empty")

    let openRouter = Connection(
      id: "or-1", provider: .openrouter, name: "OpenRouter", credentialRef: "or-1",
      lastReading: Reading(balances: [PoolBalance(pool: OpenRouter.creditsPool, balance: 4.2)], checkedAt: t0)
    )
    let critical = AlertContent.make(connection: openRouter, row: openRouter.poolRows[0], severity: .critical)
    #expect(critical.body == "Credits critical: \(Format.balance(4.2, unit: .usd)) left")

    for text in [low.title, low.body, empty.body, critical.body] {
      #expect(!text.contains("\u{2014}"))
      #expect(!text.lowercased().contains("down"))
      #expect(!text.contains(alertKey))
    }
    #expect(low.id != AlertContent.make(connection: named, row: row(named), severity: .critical).id)
  }

  @Test func oldStateFilesDecodeWithNoMarks() throws {
    let json = #"{"id":"a","provider":"hunter","name":"Hunter","credentialRef":"a"}"#
    let decoded = try JSONDecoder().decode(Connection.self, from: Data(json.utf8))
    #expect(decoded.alertMarks.isEmpty)
  }
}

@MainActor @Suite struct AlertEvaluatorTests {
  @Test func healthyToEmptySendsOneNotificationAndMarksEmpty() async throws {
    let h = try AlertHarness([hunter()])
    await h.alerts.evaluate()
    #expect(h.center.delivered.isEmpty)
    try h.set("verifications", 0)
    await h.alerts.evaluate()
    #expect(h.bodies == ["Verifications empty"])
    #expect(h.mark() == .empty)
  }

  @Test func deliveredAlertCarriesItsConnectionAndPool() async throws {
    let h = try AlertHarness([hunter()])
    try h.set("searches", 50)
    await h.alerts.evaluate()
    #expect(h.center.delivered.map(\.target) == [NotificationTarget(connectionID: "hu-1", creditType: "searches")])
  }

  @Test func sameSeverityOnLaterReadingsStaysSilent() async throws {
    let h = try AlertHarness([hunter(verifications: 250)])
    await h.alerts.evaluate()
    try h.set("verifications", 200)
    await h.alerts.evaluate()
    await h.alerts.evaluate()
    #expect(h.bodies == ["Verifications low: 250 of 1,000 left"])
    #expect(h.mark() == .low)
  }

  @Test func worseningNotifiesAgainThenRecoveryRearmsTheNextCycle() async throws {
    let h = try AlertHarness([hunter(verifications: 250)])
    await h.alerts.evaluate()
    try h.set("verifications", 80)
    await h.alerts.evaluate()
    try h.set("verifications", 250) // better, still low: silent, mark stays critical
    await h.alerts.evaluate()
    #expect(h.mark() == .critical)
    try h.set("verifications", 900) // recovered
    await h.alerts.evaluate()
    #expect(h.mark() == .none)
    try h.set("verifications", 280)
    await h.alerts.evaluate()
    #expect(h.bodies == [
      "Verifications low: 250 of 1,000 left",
      "Verifications critical: 80 of 1,000 left",
      "Verifications low: 280 of 1,000 left",
    ])
  }

  @Test func restartKeepsMarks() async throws {
    let h = try AlertHarness([hunter(verifications: 80)])
    await h.alerts.evaluate()
    #expect(h.center.delivered.count == 1)
    try h.relaunch()
    #expect(h.mark() == .critical)
    await h.alerts.evaluate()
    #expect(h.center.delivered.count == 1)
  }

  @Test func mutedAndUnavailablePoolsSendNothing() async throws {
    let muted = PoolSettings(monitored: false, low: 300, critical: 100)
    var connection = hunter(verifications: 0, settings: ["verifications": muted, "searches": limits])
    connection.lastReading?.balances.append(
      PoolBalance(pool: Pool(creditType: "extra", label: "Extra", unit: .credits, cap: 0), balance: 0)
    )
    connection.lastReading?.balances.removeAll { $0.pool.creditType == "searches" }
    connection.lastReading?.balances.append(
      PoolBalance(pool: Pool(creditType: "searches", label: "Searches", unit: .credits, cap: 0), balance: 0)
    )
    let h = try AlertHarness([connection])
    await h.alerts.evaluate()
    #expect(h.center.deliverCalls == 0)
    #expect(h.alerts.attempts.isEmpty)
  }

  @Test func onePoolChangingNeverRearmsOrSuppressesAnother() async throws {
    let h = try AlertHarness([hunter(verifications: 250, searches: 50)])
    await h.alerts.evaluate()
    #expect(Set(h.bodies) == ["Verifications low: 250 of 1,000 left", "Searches critical: 50 of 500 left"])
    try h.set("verifications", 900) // only verifications recovers
    await h.alerts.evaluate()
    #expect(h.mark("verifications") == .none)
    #expect(h.mark("searches") == .critical)
    try h.set("searches", 0) // searches worsens on its own
    await h.alerts.evaluate()
    #expect(h.bodies.last == "Searches empty")
    #expect(h.mark("verifications") == .none)
    #expect(h.center.delivered.count == 3)
  }

  @Test func otherConnectionsAreUntouched() async throws {
    let h = try AlertHarness([hunter(verifications: 250), hunter(id: "hu-2", name: "Agency", verifications: 250)])
    await h.alerts.evaluate(["hu-1"])
    #expect(h.mark(id: "hu-1") == .low)
    #expect(h.mark(id: "hu-2") == .none)
    await h.alerts.evaluate(["hu-2"])
    #expect(h.center.delivered.map(\.title) == ["Hunter", "Hunter · Agency"])
  }

  @Test func permissionDenialSubmitsNothingKeepsMarksAndWarnings() async throws {
    let h = try AlertHarness([hunter(verifications: 80)], permission: .denied)
    await h.alerts.evaluate()
    #expect(h.center.deliverCalls == 0)
    #expect(h.mark() == .none)
    #expect(h.alerts.problem == .notSubmitted(.denied))
    #expect(h.alerts.attempts.map(\.outcome) == [.notSubmitted(.denied)])
    #expect(h.service.connections.worstAlert == .critical) // the panel and the bird still warn
    #expect(h.service.connections.count == 1)

    h.center.permission = .allowed // turned on in System Settings
    await h.alerts.evaluate()
    #expect(h.bodies == ["Verifications critical: 80 of 1,000 left"])
    #expect(h.mark() == .critical)
    #expect(h.alerts.problem == nil)
  }

  @Test func deliveryFailureIsNotRecordedAsDeliveredAndRetries() async throws {
    let h = try AlertHarness([hunter(verifications: 80)])
    h.center.failDeliveries = true
    await h.alerts.evaluate()
    #expect(h.center.deliverCalls == 1)
    #expect(h.center.delivered.isEmpty)
    #expect(h.mark() == .none)
    #expect(h.alerts.problem == .failed)
    #expect(h.alerts.attempts.map(\.outcome) == [.failed])
    #expect(h.service.connections.worstAlert == .critical)

    h.center.failDeliveries = false
    await h.alerts.evaluate()
    #expect(h.center.delivered.count == 1)
    #expect(h.mark() == .critical)
    #expect(h.alerts.problem == nil)
  }

  @Test func overlappingEvaluationsSubmitOnce() async throws {
    let h = try AlertHarness([hunter(verifications: 80)])
    h.center.holdDeliveries = true
    let first = Task { await h.alerts.evaluate(["hu-1"]) }
    await yieldUntil { h.center.heldCount == 1 }
    let second = Task { await h.alerts.evaluate(["hu-1"]) }
    await second.value // the same alert is already in flight: skipped
    h.center.releaseHeld()
    await first.value
    #expect(h.center.deliverCalls == 1)
    #expect(h.center.delivered.count == 1)
    #expect(h.mark() == .critical)
    await h.alerts.evaluate(["hu-1"])
    #expect(h.center.deliverCalls == 1)
  }

  @Test func lateEmptyCompletionCannotMuteNextCycle() async throws {
    let h = try AlertHarness([openRouterConnection()])
    h.center.holdDeliveries = true
    let old = Task { await h.alerts.evaluate() }
    await yieldUntil { h.center.heldCount == 1 }
    try await h.refreshOpenRouter(100)
    await h.alerts.evaluate()
    h.center.holdDeliveries = false
    h.center.releaseHeld()
    await old.value
    #expect(h.mark("credits", id: "or-1") == .none)
    try await h.refreshOpenRouter(0)
    await h.alerts.evaluate()
    #expect(h.center.delivered.count == 2)
    #expect(h.mark("credits", id: "or-1") == .empty)
    try h.relaunch()
    await h.alerts.evaluate()
    #expect(h.center.delivered.count == 2)
  }

  @Test func newCycleCanNotifyBeforeOldCompletion() async throws {
    let h = try AlertHarness([openRouterConnection()])
    h.center.holdDeliveries = true
    let old = Task { await h.alerts.evaluate() }
    await yieldUntil { h.center.heldCount == 1 }
    try await h.refreshOpenRouter(100)
    await h.alerts.evaluate()
    try await h.refreshOpenRouter(0)
    let fresh = Task { await h.alerts.evaluate() }
    await yieldUntil { h.center.heldCount == 2 }
    h.center.holdDeliveries = false
    h.center.releaseHeld()
    await old.value
    await fresh.value
    #expect(h.center.delivered.count == 2)
    #expect(h.mark("credits", id: "or-1") == .empty)
  }

  @Test func lateLowerSeverityDoesNotDemoteEscalation() async throws {
    let h = try AlertHarness([openRouterConnection(balance: 8)])
    h.center.holdDeliveries = true
    let low = Task { await h.alerts.evaluate() }
    await yieldUntil { h.center.heldCount == 1 }
    try await h.refreshOpenRouter(0)
    let empty = Task { await h.alerts.evaluate() }
    await yieldUntil { h.center.heldCount == 2 }
    h.center.releaseHeld()
    await low.value
    await empty.value
    #expect(h.center.delivered.count == 2)
    #expect(h.mark("credits", id: "or-1") == .empty)
  }

  @Test func lateCompletionCannotMarkRemovedOrUnmonitoredPool() async throws {
    let removed = try AlertHarness([openRouterConnection()])
    removed.center.holdDeliveries = true
    let oldRemoved = Task { await removed.alerts.evaluate() }
    await yieldUntil { removed.center.heldCount == 1 }
    try removed.service.remove(id: "or-1")
    removed.center.releaseHeld()
    await oldRemoved.value
    #expect(removed.service.connections.isEmpty)

    let muted = try AlertHarness([openRouterConnection()])
    muted.center.holdDeliveries = true
    let oldMuted = Task { await muted.alerts.evaluate() }
    await yieldUntil { muted.center.heldCount == 1 }
    try muted.service.updatePoolSettings([PoolKey(connectionID: "or-1", creditType: "credits"):
      PoolSettings(monitored: false, low: 10, critical: 3)])
    muted.center.releaseHeld()
    await oldMuted.value
    #expect(muted.mark("credits", id: "or-1") == .none)
  }

  @Test func reenabledPoolDoesNotAcceptOldCompletion() async throws {
    let h = try AlertHarness([openRouterConnection()])
    let key = PoolKey(connectionID: "or-1", creditType: "credits")
    h.center.holdDeliveries = true
    let old = Task { await h.alerts.evaluate() }
    await yieldUntil { h.center.heldCount == 1 }
    try h.service.updatePoolSettings([key: PoolSettings(monitored: false, low: 10, critical: 3)])
    try h.service.updatePoolSettings([key: PoolSettings(monitored: true, low: 10, critical: 3)])
    h.center.holdDeliveries = false
    h.center.releaseHeld()
    await old.value
    #expect(h.mark("credits", id: "or-1") == .none)
    await h.alerts.evaluate()
    #expect(h.center.delivered.count == 2)
  }

  @Test func staleFailureCannotRestoreRecoveredProblem() async throws {
    let h = try AlertHarness([openRouterConnection()])
    h.center.holdDeliveries = true
    h.center.failDeliveries = true
    let old = Task { await h.alerts.evaluate() }
    await yieldUntil { h.center.heldCount == 1 }
    try await h.refreshOpenRouter(100)
    await h.alerts.evaluate()
    h.center.releaseHeld()
    await old.value
    #expect(h.alerts.problem == nil)
    #expect(h.mark("credits", id: "or-1") == .none)
  }

  @Test func scheduledEvaluationsSettle() async throws {
    let h = try AlertHarness([hunter(verifications: 0)])
    h.alerts.schedule(["hu-1"])
    h.alerts.schedule(["hu-1"])
    await h.alerts.settle()
    #expect(h.center.delivered.count == 1)
  }

  @Test func removedConnectionDropsItsProblemsAndIsSkipped() async throws {
    let h = try AlertHarness([hunter(verifications: 80)], permission: .denied)
    await h.alerts.evaluate()
    #expect(h.alerts.problem != nil)
    try h.service.remove(id: "hu-1")
    await h.alerts.evaluate()
    #expect(h.alerts.problem == nil)
    try h.service.updateAlertMarks([PoolKey(connectionID: "hu-1", creditType: "x"): .low]) // skipped, no throw
  }
}

@MainActor @Suite struct NotificationSettingsTests {
  @Test func promptShowsOnceAfterAConnectionAndDenialIsRemembered() async {
    let prefs = InMemoryPreferencesStore()
    let center = FakeNotificationCenter(answer: .denied)
    let settings = NotificationSettings(center: center, preferences: prefs)
    await settings.reload()
    #expect(!settings.showsPrompt(hasConnections: false))
    #expect(settings.showsPrompt(hasConnections: true))
    #expect(await settings.answerPrompt(enable: true) == false)
    #expect(settings.permission == .denied)
    #expect(!settings.showsPrompt(hasConnections: true))
    #expect(prefs.saved.alertsPromptAnswered)
    #expect(settings.statusLine == Copy.alertsDenied)
    let relaunched = NotificationSettings(center: FakeNotificationCenter(), preferences: prefs)
    #expect(!relaunched.showsPrompt(hasConnections: true))
  }

  @Test func notNowAsksNothingAndSettingsCanAskLater() async {
    let prefs = InMemoryPreferencesStore()
    let center = FakeNotificationCenter()
    let settings = NotificationSettings(center: center, preferences: prefs)
    await settings.answerPrompt(enable: false)
    #expect(center.requestCalls == 0)
    #expect(settings.permission == .notAsked)
    #expect(settings.statusLine == Copy.alertsNotAsked)
    #expect(await settings.answerPrompt(enable: true))
    #expect(settings.permission == .allowed)
  }

  @Test func unavailableCenterKeepsTheRowWithAReason() async {
    let prefs = InMemoryPreferencesStore()
    let settings = NotificationSettings(center: FakeNotificationCenter(permission: .unavailable), preferences: prefs)
    await settings.reload()
    #expect(await settings.answerPrompt(enable: true) == false)
    #expect(settings.promptError == Copy.alertsUnavailable)
    #expect(!prefs.saved.alertsPromptAnswered)
  }

  @Test func testNotificationReportsWhatMacOSDidNeverThatItWasSeen() async {
    let center = FakeNotificationCenter(permission: .allowed)
    let settings = NotificationSettings(center: center, preferences: InMemoryPreferencesStore())
    await settings.sendTest()
    #expect(settings.testResult == NotificationTestResult(message: Copy.testHandedToMacOS, isError: false))
    #expect(center.delivered.map(\.title) == [Copy.testNotificationTitle])

    center.failDeliveries = true
    await settings.sendTest()
    #expect(settings.testResult == NotificationTestResult(message: Copy.testFailed, isError: true))

    center.permission = .denied
    await settings.sendTest()
    #expect(settings.testResult == NotificationTestResult(message: Copy.testDenied, isError: true))
    #expect(center.delivered.count == 1)

    for message in [Copy.testHandedToMacOS, Copy.testFailed, Copy.testDenied] {
      #expect(!message.lowercased().contains("you will see"))
      #expect(!message.contains("\u{2014}"))
    }
  }

  @Test func testNotificationAsksFirstWhenNeverAsked() async {
    let center = FakeNotificationCenter()
    let settings = NotificationSettings(center: center, preferences: InMemoryPreferencesStore())
    await settings.sendTest()
    #expect(center.requestCalls == 1)
    #expect(center.delivered.count == 1)
  }

  @Test func preferencesKeepBothAnswers() throws {
    let json = #"{"loginPromptAnswered":true}"#
    let decoded = try JSONDecoder().decode(Preferences.self, from: Data(json.utf8))
    #expect(decoded == Preferences(loginPromptAnswered: true, alertsPromptAnswered: false))
  }
}
