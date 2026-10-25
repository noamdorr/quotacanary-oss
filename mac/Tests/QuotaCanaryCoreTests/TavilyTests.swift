import Foundation
@testable import QuotaCanaryCore
import Testing

/// From src/lib/adapters/tavily.test.ts: all three allowances active.
let tavilyFixture = #"""
{"key":{"usage":90,"limit":500,"search_usage":50,"extract_usage":20},
"account":{"current_plan":"Bootstrap","plan_usage":1200,"plan_limit":15000,"paygo_usage":20,"paygo_limit":100}}
"""#

private func read(_ body: String, status: Int = 200) async -> Result<[PoolBalance], ProviderReadError> {
  do {
    return .success(try await Tavily.read(key: "tvly-key", transport: ScriptedTransport([.respond(status: status, body: body)])))
  } catch {
    return .failure(error as! ProviderReadError)
  }
}

@Suite struct TavilyTests {
  @Test func derivesPlanPaygoAndKeyAsSeparatePools() async throws {
    let transport = ScriptedTransport([.respond(status: 200, body: tavilyFixture)])
    let balances = try await Tavily.read(key: "tvly-key", transport: transport)
    #expect(balances == [
      PoolBalance(pool: Pool(creditType: "plan", label: "Plan Credits", unit: .credits, cap: 15000), balance: 13800),
      PoolBalance(pool: Pool(creditType: "paygo", label: "Pay-as-you-go Credits", unit: .credits, cap: 100), balance: 80),
      PoolBalance(pool: Pool(creditType: "key", label: "API Key Credits", unit: .credits, cap: 500), balance: 410),
    ])
    #expect(transport.requests.first?.url.absoluteString == "https://api.tavily.com/usage")
    #expect(transport.requests.first?.method == "GET")
    #expect(transport.requests.first?.headers == ["Accept": "application/json", "Authorization": "Bearer tvly-key"])
  }

  @Test func inactivePaygoIsUnavailableAndUnlimitedKeyIsOmitted() async throws {
    // From the web fixture: key limit null (unlimited), paygo 0/0 (off).
    let body = #"{"key":{"usage":25,"limit":null},"account":{"current_plan":"Researcher","plan_usage":250,"plan_limit":1000,"paygo_usage":0,"paygo_limit":0}}"#
    let balances = try await read(body).get()
    #expect(balances.map(\.pool.creditType) == ["plan", "paygo"])
    #expect(balances[0].balance == 750)
    #expect(balances[1].pool.cap == 0) // known, not in use: never alerts
    #expect(PoolStatus.of(balances[1], settings: ProviderID.tavily.defaultSettings) == .unavailable)
  }

  @Test func emptyPlanIsAnEmptyPoolWhileOtherAllowancesStillCount() async throws {
    let body = #"{"key":{"usage":50,"limit":400},"account":{"plan_usage":1000,"plan_limit":1000,"paygo_usage":10,"paygo_limit":200}}"#
    let balances = try await read(body).get()
    let settings = ProviderID.tavily.defaultSettings
    #expect(balances.map { PoolStatus.of($0, settings: settings) } == [.empty, .low, .healthy])
    #expect(balances.map(\.balance) == [0, 190, 350]) // never summed into one number
  }

  @Test func overspentAllowanceFloorsAtZero() async {
    #expect(await read(#"{"account":{"plan_usage":1200,"plan_limit":1000}}"#).balances == ["plan": 0])
  }

  @Test func missingPlanLimitIsNotAFabricatedBalance() async {
    // Plan missing but a finite key cap remains: plan stays unreported (unknown row).
    #expect(await read(#"{"key":{"usage":1,"limit":50},"account":{"plan_usage":3}}"#).balances == ["key": 49])
    // Nothing spendable at all: an unexpected response, not a zero.
    for body in [
      #"{"key":{"usage":1,"limit":null},"account":{"plan_usage":3,"plan_limit":null,"paygo_limit":0}}"#,
      #"{"account":{"plan_limit":"lots"}}"#, #"{"account":{"plan_limit":true}}"#, "{}", "[]",
    ] {
      #expect(await read(body).error == .missingField("account.plan_limit"))
    }
    #expect(MonitorError.provider(.tavily, .missingField("x")).message == "Tavily returned an unexpected response.")
  }

  @Test func vendorDetailErrorIsReportedWithoutItsText() async {
    let body = #"{"detail":{"error":"Your request has been blocked due to excessive requests."}}"#
    #expect(await read(body).error == .reportedError(nil))
    let message = MonitorError.provider(.tavily, .reportedError(nil)).message
    #expect(message == "Tavily returned an error instead of a balance. Try again later.")
    #expect(!message.contains("blocked"))
  }

  @Test func authFailuresAreKeyRejected() async {
    #expect(await read("{}", status: 401).error == .keyRejected)
    #expect(await read("{}", status: 403).error == .keyRejected)
    #expect(MonitorError.provider(.tavily, .keyRejected).message == "Tavily rejected this key.")
  }

  @Test func otherStatusNonJSONAndTransportFailure() async {
    #expect(await read("{}", status: 503).error == .httpStatus(503))
    #expect(await read("not json").error == .notJSON)
    do {
      _ = try await Tavily.read(key: "k", transport: ScriptedTransport([.fail]))
      Issue.record("expected a failure")
    } catch {
      #expect(error as? ProviderReadError == .unreachable)
    }
  }
}

private extension Result where Success == [PoolBalance], Failure == ProviderReadError {
  var balances: [String: Double]? {
    (try? get()).map { Dictionary(uniqueKeysWithValues: $0.map { ($0.pool.creditType, $0.balance) }) }
  }

  var error: ProviderReadError? {
    if case let .failure(e) = self { return e }
    return nil
  }
}
