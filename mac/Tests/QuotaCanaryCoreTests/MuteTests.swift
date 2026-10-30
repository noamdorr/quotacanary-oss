import Foundation
@testable import QuotaCanaryCore
import Testing

// QUO-351: "Mute until it changes". A muted balance stays out of the bird, the
// at-risk count, the At risk filter and notifications while its reading
// equals the muted-at value; any change brings it back. Per balance, so a
// sibling on the same connection keeps alerting.

private let credits = PoolSettings(monitored: true, low: 10, critical: 3)
private let muteKey = "openrouter-SYNTHETIC-MUTE-MARKER"

private func openRouter(balance: Double, mutedAt: [String: Double] = [:]) -> Connection {
  Connection(
    id: "or-1", provider: .openrouter, name: "OpenRouter", credentialRef: "or-1",
    lastReading: Reading(balances: [PoolBalance(pool: OpenRouter.creditsPool, balance: balance)], checkedAt: t0),
    poolSettings: ["credits": credits], mutedAt: mutedAt
  )
}

private let verifications = Pool(creditType: "verifications", label: "Verifications", unit: .credits, cap: 1000)
private let searches = Pool(creditType: "searches", label: "Searches", unit: .credits, cap: 500)
private let limits = PoolSettings(monitored: true, low: 300, critical: 100)

private func hunter(verifications v: Double, searches s: Double, mutedAt: [String: Double] = [:]) -> Connection {
  Connection(
    id: "hu-1", provider: .hunter, name: "Hunter", credentialRef: "hu-1",
    lastReading: Reading(
      balances: [PoolBalance(pool: verifications, balance: v), PoolBalance(pool: searches, balance: s)],
      checkedAt: t0
    ),
    poolSettings: ["verifications": limits, "searches": limits], mutedAt: mutedAt
  )
}

private func row(_ connection: Connection, _ creditType: String) -> PoolRow {
  connection.poolRows.first { $0.key.creditType == creditType }!
}

@MainActor
private final class MuteHarness {
  let store = InMemoryConnectionStore()
  let center = FakeNotificationCenter(permission: .allowed)
  let credentials = InMemoryCredentialStore()
  let transport = ScriptedTransport([ok])
  private(set) var service: MonitoringService
  let alerts: AlertEvaluator

  init(_ connections: [Connection]) throws {
    try store.save(connections)
    for connection in connections { try credentials.save(muteKey, ref: connection.credentialRef) }
    service = MonitoringService(credentials: credentials, store: store, transport: transport)
    try service.restore()
    alerts = AlertEvaluator(service: service, center: center)
  }

  func refresh(_ balance: Double) async throws {
    transport.script([.respond(status: 200, body: #"{"data":{"total_credits":\#(balance),"total_usage":0}}"#)])
    try await service.refresh(id: "or-1")
  }

  var connection: Connection { service.connections[0] }
}

@Suite struct MutedBalanceTests {
  @Test func mutedBalanceLeavesTheBirdCountAndFilter() {
    let connection = hunter(verifications: 0, searches: 400, mutedAt: ["verifications": 0])
    #expect(row(connection, "verifications").muted)
    #expect(!row(connection, "verifications").alerts)
    #expect([connection].poolsAtRisk == 0)
    #expect([connection].worstAlert == .none)
    let shown = BalancesAsShown(local: [connection])
    #expect(shown.severity == .none)
    #expect(shown.poolsAtRisk == 0)
    #expect(shown.stackItems(filter: .atRisk).isEmpty)
    #expect(shown.panel.attention.isEmpty)
  }

  @Test func mutedRowStaysInTheList() {
    let connection = hunter(verifications: 0, searches: 400, mutedAt: ["verifications": 0])
    let items = BalancesAsShown(local: [connection]).stackItems()
    #expect(items.contains { $0.row.key.creditType == "verifications" && $0.row.muted })
  }

  @Test func siblingBalanceOnTheSameToolStillAlerts() {
    let connection = hunter(verifications: 0, searches: 50, mutedAt: ["verifications": 0])
    #expect(!row(connection, "searches").muted)
    #expect([connection].poolsAtRisk == 1)
    #expect([connection].worstAlert == .critical)
  }

  @Test func anyChangeInValueEndsTheMute() {
    #expect(!row(openRouter(balance: 1, mutedAt: ["credits": 0]), "credits").muted)
    #expect(!row(openRouter(balance: 0, mutedAt: ["credits": 2]), "credits").muted)
    #expect(row(openRouter(balance: 1, mutedAt: ["credits": 1]), "credits").muted)
  }

  @Test func oldStateFilesDecodeWithNoMutes() throws {
    let json = #"{"id":"or-1","provider":"openrouter","name":"OpenRouter","credentialRef":"or-1"}"#
    let decoded = try JSONDecoder().decode(Connection.self, from: Data(json.utf8))
    #expect(decoded.mutedAt.isEmpty)
  }
}

@MainActor @Suite struct MuteServiceTests {
  @Test func muteSavesTheCurrentValueAndUnmuteRestores() throws {
    let h = try MuteHarness([openRouter(balance: 0)])
    let key = PoolKey(connectionID: "or-1", creditType: "credits")
    try h.service.setMuted(key, true)
    #expect(h.connection.mutedAt == ["credits": 0])
    #expect(try h.store.load()[0].mutedAt == ["credits": 0])
    #expect(!row(h.connection, "credits").alerts)
    try h.service.setMuted(key, false)
    #expect(h.connection.mutedAt.isEmpty)
    #expect(row(h.connection, "credits").alerts)
  }

  @Test func mutingWithoutAReadingSavesNothing() throws {
    var connection = openRouter(balance: 0)
    connection.lastReading = nil
    let h = try MuteHarness([connection])
    try h.service.setMuted(PoolKey(connectionID: "or-1", creditType: "credits"), true)
    #expect(h.connection.mutedAt.isEmpty)
  }

  @Test func aChangedReadingClearsTheSavedMuteSoTheOldValueAlertsAgain() async throws {
    let h = try MuteHarness([openRouter(balance: 0, mutedAt: ["credits": 0])])
    try await h.refresh(50)
    #expect(h.connection.mutedAt.isEmpty)
    try await h.refresh(0)
    #expect(row(h.connection, "credits").alerts)
  }

  @Test func anUnchangedReadingKeepsTheMute() async throws {
    let h = try MuteHarness([openRouter(balance: 0, mutedAt: ["credits": 0])])
    try await h.refresh(0)
    #expect(h.connection.mutedAt == ["credits": 0])
  }
}

@MainActor @Suite struct MutedNotificationTests {
  @Test func mutedBalanceSendsNothing() async throws {
    let h = try MuteHarness([openRouter(balance: 0, mutedAt: ["credits": 0])])
    await h.alerts.evaluate()
    #expect(h.center.deliverCalls == 0)
  }

  @Test func aChangeAfterMutingIsANewIncidentAndNotifies() async throws {
    let h = try MuteHarness([openRouter(balance: 0)])
    await h.alerts.evaluate()
    #expect(h.center.deliverCalls == 1)
    try h.service.setMuted(PoolKey(connectionID: "or-1", creditType: "credits"), true)
    await h.alerts.evaluate()
    #expect(h.center.deliverCalls == 1)
    try await h.refresh(0.5)
    await h.alerts.evaluate()
    #expect(h.center.deliverCalls == 2)
  }
}
