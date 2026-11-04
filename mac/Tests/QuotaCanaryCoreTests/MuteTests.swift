import Foundation
@testable import QuotaCanaryCore
import Testing

// QUO-351, reworked by QUO-393 and QUO-419: a muted balance stays out of the
// panel's at-risk count, the At risk filter and notifications, but the menu
// bar bird still shows it. A mute holds for a day,
// a week, or until the balance goes up; a worse status breaks it at once.
// Per balance, so a sibling on the same connection keeps alerting.

private let credits = PoolSettings(monitored: true, low: 10, critical: 3)
private let muteKey = "openrouter-SYNTHETIC-MUTE-MARKER"
private let day: TimeInterval = 86_400

private func openRouter(balance: Double, mutes: [String: Mute] = [:]) -> Connection {
  Connection(
    id: "or-1", provider: .openrouter, name: "OpenRouter", credentialRef: "or-1",
    lastReading: Reading(balances: [PoolBalance(pool: OpenRouter.creditsPool, balance: balance)], checkedAt: t0),
    poolSettings: ["credits": credits], mutes: mutes
  )
}

private let verifications = Pool(creditType: "verifications", label: "Verifications", unit: .credits, cap: 1000)
private let searches = Pool(creditType: "searches", label: "Searches", unit: .credits, cap: 500)
private let limits = PoolSettings(monitored: true, low: 300, critical: 100)

private func hunter(verifications v: Double, searches s: Double, mutes: [String: Mute] = [:]) -> Connection {
  Connection(
    id: "hu-1", provider: .hunter, name: "Hunter", credentialRef: "hu-1",
    lastReading: Reading(
      balances: [PoolBalance(pool: verifications, balance: v), PoolBalance(pool: searches, balance: s)],
      checkedAt: t0
    ),
    poolSettings: ["verifications": limits, "searches": limits], mutes: mutes
  )
}

private func topUp(_ balance: Double, _ severity: AlertSeverity) -> Mute {
  Mute(until: nil, balance: balance, severity: severity)
}

private func timed(_ until: Date, _ balance: Double, _ severity: AlertSeverity) -> Mute {
  Mute(until: until, balance: balance, severity: severity)
}

private func row(_ connection: Connection, _ creditType: String, at now: Date = t0) -> PoolRow {
  connection.poolRows(at: now).first { $0.key.creditType == creditType }!
}

@MainActor
private final class MuteHarness {
  let store = InMemoryConnectionStore()
  let center = FakeNotificationCenter(permission: .allowed)
  let credentials = InMemoryCredentialStore()
  let transport = ScriptedTransport([ok])
  var clock = t0
  private(set) var service: MonitoringService!
  private(set) var alerts: AlertEvaluator!

  init(_ connections: [Connection]) throws {
    try store.save(connections)
    for connection in connections { try credentials.save(muteKey, ref: connection.credentialRef) }
    service = MonitoringService(credentials: credentials, store: store, transport: transport, now: { [unowned self] in clock })
    try service.restore()
    alerts = AlertEvaluator(service: service, center: center)
  }

  func refresh(_ balance: Double) async throws {
    transport.script([.respond(status: 200, body: #"{"data":{"total_credits":\#(balance),"total_usage":0}}"#)])
    try await service.refresh(id: "or-1")
  }

  var connection: Connection { service.connections[0] }
  var key: PoolKey { PoolKey(connectionID: "or-1", creditType: "credits") }
}

@Suite struct MutedBalanceTests {
  @Test func mutedBalanceLeavesTheCountAndFilterButNotTheBird() {
    let connection = hunter(verifications: 0, searches: 400, mutes: ["verifications": topUp(0, .empty)])
    #expect(row(connection, "verifications").muted)
    #expect(!row(connection, "verifications").alerts)
    #expect(row(connection, "verifications").warns)
    #expect([connection].poolsAtRisk == 0)
    #expect([connection].worstAlert == .empty)
    let shown = BalancesAsShown(local: [connection])
    #expect(shown.severity == .empty)
    #expect(shown.poolsAtRisk == 1)
    #expect(shown.stackItems(filter: .atRisk).isEmpty)
    #expect(shown.panel.attention.isEmpty)
  }

  /// QUO-419: a muted Low balance kept the bird gray once the red one was muted too.
  @Test func birdTakesTheWorstBalanceMutedOrNot() {
    let connection = hunter(
      verifications: 250, searches: 400,
      mutes: ["verifications": topUp(250, .low), "searches": topUp(400, .none)]
    )
    let shown = BalancesAsShown(local: [connection])
    #expect(shown.severity == .low)
    #expect(shown.poolsAtRisk == 1)
    let critical = hunter(verifications: 250, searches: 50, mutes: ["verifications": topUp(250, .low), "searches": topUp(50, .critical)])
    #expect(BalancesAsShown(local: [critical]).severity == .critical)
  }

  @Test func mutedRowStaysInTheList() {
    let connection = hunter(verifications: 0, searches: 400, mutes: ["verifications": topUp(0, .empty)])
    let items = BalancesAsShown(local: [connection]).stackItems()
    #expect(items.contains { $0.row.key.creditType == "verifications" && $0.row.muted })
  }

  @Test func siblingBalanceOnTheSameToolStillAlerts() {
    let connection = hunter(verifications: 0, searches: 50, mutes: ["verifications": topUp(0, .empty)])
    #expect(!row(connection, "searches").muted)
    #expect([connection].poolsAtRisk == 1)
    #expect([connection].worstAlert == .empty) // the muted empty one still tints the bird
  }

  @Test func aTopUpMuteHoldsWhileTheBalanceDrains() {
    // The QUO-351 rule un-muted a draining balance on the next poll.
    #expect(row(openRouter(balance: 8, mutes: ["credits": topUp(9, .low)]), "credits").muted)
    #expect(row(openRouter(balance: 9, mutes: ["credits": topUp(9, .low)]), "credits").muted)
  }

  @Test func aTopUpMuteEndsWhenTheBalanceGoesUp() {
    let state = row(openRouter(balance: 9.5, mutes: ["credits": topUp(9, .low)]), "credits")
    #expect(!state.muted)
    #expect(!state.backFromMute)
    #expect(state.alerts)
  }

  @Test func aTimedMuteHoldsUntilItsDate() {
    let connection = openRouter(balance: 5, mutes: ["credits": timed(t0 + day, 6, .low)])
    #expect(row(connection, "credits", at: t0).muted)
    #expect(row(connection, "credits", at: t0 + day - 1).muted)
    // A timed mute ignores a top-up; only the date (or a worse status) ends it.
    #expect(row(openRouter(balance: 9, mutes: ["credits": timed(t0 + day, 6, .low)]), "credits").muted)
  }

  @Test func anExpiredTimedMuteStillLowComesBackFromMute() {
    let state = row(openRouter(balance: 5, mutes: ["credits": timed(t0 + day, 6, .low)]), "credits", at: t0 + day)
    #expect(!state.muted)
    #expect(state.backFromMute)
    #expect(state.alerts)
  }

  @Test func aWorseStatusBreaksAnyMute() {
    // Low to Critical, and anything to Empty.
    #expect(!row(openRouter(balance: 2, mutes: ["credits": topUp(6, .low)]), "credits").muted)
    #expect(!row(openRouter(balance: 2, mutes: ["credits": timed(t0 + day, 6, .low)]), "credits").muted)
    #expect(!row(openRouter(balance: 0, mutes: ["credits": topUp(2, .critical)]), "credits").muted)
    #expect(!row(openRouter(balance: 2, mutes: ["credits": topUp(6, .low)]), "credits").backFromMute)
    // The same or a better warning keeps it.
    #expect(row(openRouter(balance: 1, mutes: ["credits": topUp(2, .critical)]), "credits").muted)
  }

  @Test func aHealthyOrUnreadBalanceIsNotMuted() {
    #expect(!row(openRouter(balance: 50, mutes: ["credits": timed(t0 + day, 6, .low)]), "credits").muted)
    var connection = openRouter(balance: 5, mutes: ["credits": topUp(6, .low)])
    connection.lastReading = nil
    #expect(!row(connection, "credits").muted)
  }

  @Test func endedMutesAreDroppedButABackFromMuteMarkerStays() {
    var connection = hunter(verifications: 50, searches: 50, mutes: [
      "verifications": timed(t0 + day, 50, .critical), // expired, still critical: kept as the marker
      "searches": topUp(40, .critical), // topped up: dropped
    ])
    connection.dropEndedMutes(now: t0 + day)
    #expect(connection.mutes.keys.sorted() == ["verifications"])
    #expect(row(connection, "verifications", at: t0 + day).backFromMute)
    // The marker goes once the balance is healthy again.
    connection.lastReading = Reading(balances: [PoolBalance(pool: verifications, balance: 900)], checkedAt: t0)
    connection.dropEndedMutes(now: t0 + day)
    #expect(connection.mutes.isEmpty)
  }

  @Test func choicesSetTheirEnd() {
    let calendar = Calendar(identifier: .gregorian)
    let dayMute = MuteChoice.oneDay.mute(balance: 5, severity: .low, now: t0, calendar: calendar)
    #expect(dayMute == timed(calendar.date(byAdding: .day, value: 1, to: t0)!, 5, .low))
    let weekMute = MuteChoice.oneWeek.mute(balance: 5, severity: .low, now: t0, calendar: calendar)
    #expect(weekMute.until == calendar.date(byAdding: .day, value: 7, to: t0))
    #expect(MuteChoice.untilTopUp.mute(balance: 5, severity: .low, now: t0, calendar: calendar) == topUp(5, .low))
  }
}

@Suite struct MuteMarkerTests {
  private let calendar: Calendar = {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(identifier: "UTC")!
    return calendar
  }()

  // t0 is Tue 2023-11-14 22:13 UTC.
  @Test func withinAWeekNamesTheWeekday() {
    #expect(MuteMarker.text(timed(t0 + 3 * day, 1, .low), now: t0, calendar: calendar) == "Muted until Fri")
    #expect(MuteMarker.text(timed(t0 + 7 * day, 1, .low), now: t0, calendar: calendar) == "Muted until Tue")
  }

  @Test func furtherOutNamesTheDate() {
    #expect(MuteMarker.text(timed(t0 + 8 * day, 1, .low), now: t0, calendar: calendar) == "Muted until Nov 22")
  }

  @Test func topUpMutesSaySo() {
    #expect(MuteMarker.text(topUp(1, .low), now: t0, calendar: calendar) == "Muted until top-up")
  }
}

@Suite struct MuteStateFileTests {
  @Test func oldStateFilesDecodeWithNoMutes() throws {
    let json = #"{"id":"or-1","provider":"openrouter","name":"OpenRouter","credentialRef":"or-1"}"#
    let decoded = try JSONDecoder().decode(Connection.self, from: Data(json.utf8))
    #expect(decoded.mutes.isEmpty)
  }

  @Test func aQUO351MuteDecodesAsUntilTopUpAtItsStatus() throws {
    let encoded = try JSONEncoder().encode(openRouter(balance: 2))
    var object = try JSONSerialization.jsonObject(with: encoded) as! [String: Any]
    object["mutedAt"] = ["credits": 2.0]
    let decoded = try JSONDecoder().decode(Connection.self, from: JSONSerialization.data(withJSONObject: object))
    #expect(decoded.mutes == ["credits": topUp(2, .critical)])
    // Re-encoded in the new shape, never the old key.
    let reencoded = try JSONSerialization.jsonObject(with: JSONEncoder().encode(decoded)) as! [String: Any]
    #expect(reencoded["mutedAt"] == nil)
    #expect(reencoded["mutes"] != nil)
  }

  @Test func nothingMutedEncodesNoMuteKeys() throws {
    let object = try JSONSerialization.jsonObject(with: JSONEncoder().encode(openRouter(balance: 2))) as! [String: Any]
    #expect(object["mutes"] == nil)
    #expect(object["mutedAt"] == nil)
  }

  @Test func mutesRoundTrip() throws {
    let connection = openRouter(balance: 5, mutes: ["credits": timed(t0 + day, 5, .low)])
    let decoded = try JSONDecoder().decode(Connection.self, from: JSONEncoder().encode(connection))
    #expect(decoded == connection)
  }
}

@MainActor @Suite struct MuteServiceTests {
  @Test func muteSavesTheChoiceAndUnmuteRestores() throws {
    let h = try MuteHarness([openRouter(balance: 5)])
    try h.service.setMute(h.key, .oneWeek)
    #expect(h.connection.mutes["credits"]?.until == Calendar.current.date(byAdding: .day, value: 7, to: t0))
    #expect(h.connection.mutes["credits"]?.severity == .low)
    #expect(try h.store.load()[0].mutes == h.connection.mutes)
    #expect(!row(h.connection, "credits").alerts)
    try h.service.setMute(h.key, nil)
    #expect(h.connection.mutes.isEmpty)
    #expect(row(h.connection, "credits").alerts)
  }

  @Test func mutingWithoutAReadingSavesNothing() throws {
    var connection = openRouter(balance: 0)
    connection.lastReading = nil
    let h = try MuteHarness([connection])
    try h.service.setMute(h.key, .untilTopUp)
    #expect(h.connection.mutes.isEmpty)
  }

  @Test func aTopUpClearsTheSavedMuteSoTheOldValueAlertsAgain() async throws {
    let h = try MuteHarness([openRouter(balance: 5)])
    try h.service.setMute(h.key, .untilTopUp)
    try await h.refresh(4) // still draining: kept
    #expect(h.connection.mutes["credits"] != nil)
    try await h.refresh(50)
    #expect(h.connection.mutes.isEmpty)
    try await h.refresh(5)
    #expect(row(h.connection, "credits").alerts)
  }
}

@MainActor @Suite struct MutedNotificationTests {
  @Test func mutedBalanceSendsNothing() async throws {
    let h = try MuteHarness([openRouter(balance: 0, mutes: ["credits": topUp(0, .empty)])])
    await h.alerts.evaluate()
    #expect(h.center.deliverCalls == 0)
  }

  @Test func aTopUpAfterMutingIsANewIncidentAndNotifies() async throws {
    let h = try MuteHarness([openRouter(balance: 5)])
    await h.alerts.evaluate()
    #expect(h.center.deliverCalls == 1)
    try h.service.setMute(h.key, .untilTopUp)
    await h.alerts.evaluate()
    #expect(h.center.deliverCalls == 1)
    try await h.refresh(6)
    await h.alerts.evaluate()
    #expect(h.center.deliverCalls == 2)
  }

  @Test func escalationWhileMutedNotifies() async throws {
    let h = try MuteHarness([openRouter(balance: 5)])
    try h.service.setMute(h.key, .oneWeek)
    await h.alerts.evaluate()
    #expect(h.center.deliverCalls == 0)
    try await h.refresh(2) // Low to Critical
    await h.alerts.evaluate()
    #expect(h.center.deliverCalls == 1)
  }

  @Test func anExpiredTimedMuteNotifiesOnceNotEveryPoll() async throws {
    let h = try MuteHarness([openRouter(balance: 5)])
    try h.service.setMute(h.key, .oneDay)
    await h.alerts.evaluate()
    #expect(h.center.deliverCalls == 0)
    h.clock = t0 + 2 * day
    try await h.refresh(5)
    #expect(row(h.connection, "credits", at: h.clock).backFromMute)
    await h.alerts.evaluate()
    #expect(h.center.deliverCalls == 1)
    try await h.refresh(5)
    await h.alerts.evaluate()
    #expect(h.center.deliverCalls == 1)
  }
}
