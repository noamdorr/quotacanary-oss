import Foundation
@testable import QuotaCanaryCore
import Testing

// QUO-283: which of a connection's balances the Mac watches. Apollo's four
// catalog pools are watched at connect; an extra it reports (website visitor
// credits here) starts hidden, and showing it makes it a normal, alertable row.

private let core = ["lead_credit", "export_credit", "direct_dial_credit", "ai_credit"]
private let extra = "website_visitor_credit"

/// The four core pools, healthy, plus a website-visitor pool at 100 of 10,000
/// (critical on Apollo's defaults, so it would alert if it were watched).
private let apolloWithExtra = apolloBody(
  #"{"lead_credit":{"limit":10000,"consumed":2500,"left_over":7500},"direct_dial_credit":{"limit":10000,"consumed":1200,"left_over":8800},"export_credit":{"limit":5000,"consumed":250,"left_over":4750},"ai_credit":{"limit":2000,"consumed":75,"left_over":1925},"website_visitor_credit":{"limit":10000,"consumed":9900,"left_over":100}}"#
)

@MainActor
private func connected(_ provider: ProviderID = .apollo, body: String = apolloWithExtra)
  async throws -> (MonitoringService, AlertEvaluator, FakeNotificationCenter, Connection) {
  let service = MonitoringService(
    credentials: InMemoryCredentialStore(), store: InMemoryConnectionStore(),
    transport: ScriptedTransport([.respond(status: 200, body: body)]), makeID: { "c-1" }
  )
  let connection = try await service.connect(provider: provider, key: "the-key")
  let center = FakeNotificationCenter(permission: .allowed)
  return (service, AlertEvaluator(service: service, center: center), center, connection)
}

@Suite struct WatchedBalancesTests {
  @Test @MainActor func connectWatchesTheCatalogPoolsAndHidesTheExtras() async throws {
    let (service, alerts, center, connection) = try await connected()
    #expect(connection.watchedCreditTypes == core)
    #expect(WatchedBalances.offersChoice(connection))
    #expect(connection.poolRows.map(\.key.creditType) == core)
    #expect(connection.hiddenPoolRows.map(\.key.creditType) == [extra])
    #expect(connection.allPoolRows.map(\.key.creditType) == core + [extra])
    // Saved, so the choice survives a relaunch.
    #expect(service.connections.first?.watchedCreditTypes == core)
    // Hidden means no alert either, though it is critical.
    #expect(connection.allPoolRows.last?.alerts == true)
    await alerts.evaluate()
    #expect(center.delivered.isEmpty)
  }

  @Test @MainActor func showingAHiddenBalanceMakesItAppearAndAlert() async throws {
    let (service, alerts, center, _) = try await connected()
    let updated = try service.updateWatched(id: "c-1", creditTypes: core + [extra])
    // Every balance watched is stored as "all", so one a later read adds shows too.
    #expect(updated.watchedCreditTypes == nil)
    #expect(updated.poolRows.map(\.key.creditType) == core + [extra])
    #expect(updated.hiddenPoolRows.isEmpty)
    await alerts.evaluate()
    #expect(center.delivered.map(\.target) == [NotificationTarget(connectionID: "c-1", creditType: extra)])
  }

  @Test @MainActor func hidingACoreBalanceKeepsTheRest() async throws {
    let (service, _, _, _) = try await connected()
    let updated = try service.updateWatched(id: "c-1", creditTypes: ["lead_credit", extra, "ai_credit"])
    // Stored in row order, whatever order the checklist sent.
    #expect(updated.watchedCreditTypes == ["lead_credit", "ai_credit", extra])
    #expect(updated.hiddenPoolRows.map(\.key.creditType) == ["export_credit", "direct_dial_credit"])
  }

  @Test @MainActor func watchingNothingIsRefused() async throws {
    let (service, _, _, _) = try await connected()
    #expect(throws: MonitorError.notConnected) { try service.updateWatched(id: "nope", creditTypes: core) }
    let unchanged = try service.updateWatched(id: "c-1", creditTypes: [])
    #expect(unchanged.watchedCreditTypes == core)
  }

  @Test @MainActor func singleBalanceToolsSkipTheChecklist() async throws {
    let (_, _, _, connection) = try await connected(.openrouter, body: #"{"data":{"total_credits":20,"total_usage":7.5}}"#)
    #expect(connection.watchedCreditTypes == nil)
    #expect(!WatchedBalances.offersChoice(connection))
    #expect(connection.poolRows.count == 1)
  }

  @Test @MainActor func aToolWithNoExtrasWatchesEverythingButStillOffersTheChoice() async throws {
    let (_, _, _, connection) = try await connected(body: apolloFixture)
    #expect(connection.watchedCreditTypes == nil)
    #expect(WatchedBalances.offersChoice(connection))
    #expect(connection.poolRows.map(\.key.creditType) == core)
  }

  @Test func aStateFileFromBeforeWatchingWatchesEverything() throws {
    let json = #"{"id":"a","provider":"apollo","name":"Apollo","credentialRef":"a"}"#
    let connection = try JSONDecoder().decode(Connection.self, from: Data(json.utf8))
    #expect(connection.watchedCreditTypes == nil)
    #expect(connection.isWatched(extra))
    // And nil is not written back as a key.
    let encoded = String(decoding: try JSONEncoder().encode(connection), as: UTF8.self)
    #expect(!encoded.contains("watchedCreditTypes"))
  }

}
