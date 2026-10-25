import Foundation
@testable import QuotaCanaryCore
import Testing

/// Tavily, Apollo and Prospeo through the monitoring service: connect, pool
/// rows, settings, refresh, relaunch, and error states, over a fake network.
@MainActor
private final class ProviderHarness {
  let credentials = InMemoryCredentialStore()
  let store = InMemoryConnectionStore()
  let tavily: ScriptedTransport
  let apollo: ScriptedTransport
  let prospeo: ScriptedTransport
  var issued = 0
  lazy var service = makeService()

  init(
    tavily: [ScriptedTransport.Step] = [.respond(status: 200, body: tavilyFixture)],
    apollo: [ScriptedTransport.Step] = [.respond(status: 200, body: apolloFixture)],
    prospeo: [ScriptedTransport.Step] = [.respond(status: 200, body: prospeoFixture)]
  ) {
    self.tavily = ScriptedTransport(tavily)
    self.apollo = ScriptedTransport(apollo)
    self.prospeo = ScriptedTransport(prospeo)
  }

  func makeService() -> MonitoringService {
    MonitoringService(
      credentials: credentials, store: store,
      transport: RoutedTransport(["api.tavily.com": tavily, "api.apollo.io": apollo, "api.prospeo.io": prospeo]),
      now: { t0 },
      makeID: { [unowned self] in
        self.issued += 1
        return "conn-\(self.issued)"
      }
    )
  }

  var persisted: String { store.bytes.map { String(decoding: $0, as: UTF8.self) } ?? "" }
}

private func key(_ id: String, _ creditType: String) -> PoolKey { PoolKey(connectionID: id, creditType: creditType) }

@MainActor @Suite struct ProviderServiceTests {
  @Test func tavilyConnectShowsAccountAndKeyPoolsSeparately() async throws {
    let h = ProviderHarness()
    let connection = try await h.service.connect(provider: .tavily, key: " tvly-SYNTHETIC-MARKER ")
    #expect(h.tavily.requests.first?.headers["Authorization"] == "Bearer tvly-SYNTHETIC-MARKER")
    let rows = connection.poolRows
    #expect(rows.map(\.pool.creditType) == ["plan", "paygo", "key"])
    #expect(rows.map(\.pool.label) == ["Plan Credits", "Pay-as-you-go Credits", "API Key Credits"])
    #expect(rows.map(\.balance) == [13800, 80, 410])
    #expect(rows.map(\.status) == [.healthy, .critical, .healthy]) // defaults low 300 / critical 100
    #expect(!h.persisted.contains("tvly-SYNTHETIC-MARKER"))
  }

  @Test func tavilyInactivePaygoNeverAlertsAndUnlimitedKeyHasNoRow() async throws {
    let body = #"{"key":{"usage":25,"limit":null},"account":{"plan_usage":950,"plan_limit":1000,"paygo_usage":0,"paygo_limit":0}}"#
    let h = ProviderHarness(tavily: [.respond(status: 200, body: body)])
    let rows = try await h.service.connect(provider: .tavily, key: "k").poolRows
    #expect(rows.map(\.pool.creditType) == ["plan", "paygo"])
    #expect(rows.map(\.status) == [.critical, .unavailable])
    #expect(rows.map(\.alerts) == [true, false])
  }

  @Test func tavilyRefreshFailureKeepsTheLastReadingAndSettings() async throws {
    let h = ProviderHarness(tavily: [.respond(status: 200, body: tavilyFixture), .respond(status: 200, body: "{}")])
    let connection = try await h.service.connect(provider: .tavily, key: "k")
    let off = PoolSettings(monitored: false, low: 50, critical: 10)
    try h.service.updatePoolSettings([key(connection.id, "key"): off])
    let error = await monitorError { try await h.service.refresh(id: connection.id) }
    #expect(error == .provider(.tavily, .missingField("account.plan_limit")))
    #expect(h.service.connections.first?.lastReading == connection.lastReading)
    #expect(h.service.connections.first?.poolSettings == ["key": off])
  }

  @Test func apolloConnectShowsDynamicPoolsAndMinutesWithSettings() async throws {
    let body = apolloBody(
      #"{"lead_credit":{"limit":10000,"left_over":7500},"ai_credit":{"limit":0,"left_over":0},"dialer":{"limit":500,"consumed":12,"left_over":488},"conversation_credit":{"limit":0,"left_over":0}}"#
    )
    let h = ProviderHarness(apollo: [.respond(status: 200, body: body)])
    let connection = try await h.service.connect(provider: .apollo, key: "apollo-SYNTHETIC-MARKER")
    #expect(h.apollo.requests.first?.method == "POST")
    #expect(h.apollo.requests.first?.headers["x-api-key"] == "apollo-SYNTHETIC-MARKER")

    // The extra dialer starts hidden (QUO-283); showing it lists it after the catalog pools.
    #expect(connection.hiddenPoolRows.map(\.pool.creditType) == ["dialer"])
    let rows = try h.service.updateWatched(id: connection.id, creditTypes: connection.allPoolRows.map(\.key.creditType)).poolRows
    // Catalog pools in order (export and direct dial unreported: unknown), then the extra dialer.
    #expect(rows.map(\.pool.creditType) == ["lead_credit", "export_credit", "direct_dial_credit", "ai_credit", "dialer"])
    #expect(rows.map(\.status) == [.healthy, .unknown, .unknown, .unavailable, .critical])
    #expect(rows.last?.pool.unit == .minutes)

    let minutes = PoolSettings(monitored: true, low: 120, critical: 30)
    try h.service.updatePoolSettings([key(connection.id, "dialer"): minutes])
    let restored = try h.makeService().restore()
    #expect(restored.first?.poolRows.last?.settings == minutes)
    #expect(restored.first?.poolRows.last?.status == .healthy)
    #expect(restored.first?.poolRows.last?.pool.unit == .minutes)
    #expect(!h.persisted.contains("apollo-SYNTHETIC-MARKER"))
  }

  @Test func apolloScopeFailureIsActionableAndStoresNothing() async {
    let h = ProviderHarness(apollo: [.respond(status: 403, body: #"{"error":"not authorized"}"#)])
    let error = await monitorError { _ = try await h.service.connect(provider: .apollo, key: "k") }
    #expect(error == .provider(.apollo, .keyLacksScope))
    #expect(h.credentials.items.isEmpty)
    #expect(h.service.connections.isEmpty)
  }

  @Test func prospeoConnectRefreshAndRelaunch() async throws {
    let h = ProviderHarness(prospeo: [
      .respond(status: 200, body: prospeoFixture),
      .respond(status: 200, body: #"{"error":false,"response":{"remaining_credits":400,"used_credits":600}}"#),
    ])
    let connection = try await h.service.connect(provider: .prospeo, key: "prospeo-SYNTHETIC-MARKER")
    #expect(h.prospeo.requests.first?.headers == ["X-KEY": "prospeo-SYNTHETIC-MARKER"])
    #expect(connection.poolRows.map(\.status) == [.low]) // 900, default low 1500
    let refreshed = try await h.service.refresh(id: connection.id)
    #expect(refreshed.poolRows.first?.balance == 400)
    #expect(refreshed.poolRows.first?.status == .critical)
    #expect(refreshed.poolRows.first?.pool.cap == 1000)
    #expect(try h.makeService().restore() == [refreshed])
    #expect(!h.persisted.contains("prospeo-SYNTHETIC-MARKER"))
  }

  @Test func prospeoErrorEnvelopeOnRefreshIsNotAHealthyOrZeroBalance() async throws {
    let h = ProviderHarness(prospeo: [.respond(status: 200, body: prospeoFixture), .respond(status: 200, body: #"{"error":true}"#)])
    let connection = try await h.service.connect(provider: .prospeo, key: "k")
    let error = await monitorError { try await h.service.refresh(id: connection.id) }
    #expect(error?.message == "Prospeo rejected this key.")
    #expect(h.service.connections.first?.poolRows.first?.balance == 900)
  }

  @Test func allThreeConnectSideBySide() async throws {
    let h = ProviderHarness()
    for provider in [ProviderID.tavily, .apollo, .prospeo] {
      _ = try await h.service.connect(provider: provider, key: "k-\(provider.rawValue)")
    }
    #expect(h.service.connections.map(\.provider) == [.tavily, .apollo, .prospeo])
    #expect(h.service.connections.map(\.name) == ["Tavily", "Apollo", "Prospeo"])
    #expect(h.credentials.items == ["conn-1": "k-tavily", "conn-2": "k-apollo", "conn-3": "k-prospeo"])
  }
}
