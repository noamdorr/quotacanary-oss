import Foundation
@testable import QuotaCanaryCore
import Testing

/// Shaped after Apollo's documented POST /api/v1/usage_stats/credit_usage_stats
/// response, as in src/lib/adapters/apollo.test.ts.
func apolloBody(_ stats: String) -> String {
  #"{"credit_usage_stats":"# + stats
    + #","current_credit_cycle":{"start_date":"2026-08-01T00:00:00.000Z","end_date":"2026-09-01T00:00:00.000Z"}}"#
}

let apolloFixture = apolloBody(
  #"{"lead_credit":{"limit":10000,"consumed":2500,"left_over":7500},"direct_dial_credit":{"limit":1000,"consumed":120,"left_over":880},"export_credit":{"limit":5000,"consumed":250,"left_over":4750},"ai_credit":{"limit":2000,"consumed":75,"left_over":1925}}"#
)

private func read(_ body: String, status: Int = 200) async -> Result<[PoolBalance], ProviderReadError> {
  do {
    return .success(try await Apollo.read(key: "api-key", transport: ScriptedTransport([.respond(status: status, body: body)])))
  } catch {
    return .failure(error as! ProviderReadError)
  }
}

@Suite struct ApolloTests {
  @Test func mapsEveryCreditTypeWithRemainingAndLimitViaTheDocumentedPOST() async throws {
    let transport = ScriptedTransport([.respond(status: 200, body: apolloFixture)])
    let balances = try await Apollo.read(key: "api-key", transport: transport)
    #expect(balances == [
      PoolBalance(pool: Pool(creditType: "lead_credit", label: "Lead Credits", unit: .credits, cap: 10000), balance: 7500),
      PoolBalance(pool: Pool(creditType: "export_credit", label: "Export Credits", unit: .credits, cap: 5000), balance: 4750),
      PoolBalance(pool: Pool(creditType: "direct_dial_credit", label: "Direct Dial Credits", unit: .credits, cap: 1000), balance: 880),
      PoolBalance(pool: Pool(creditType: "ai_credit", label: "AI Credits", unit: .credits, cap: 2000), balance: 1925),
    ])
    let request = try #require(transport.requests.first)
    #expect(request.url.absoluteString == "https://api.apollo.io/api/v1/usage_stats/credit_usage_stats")
    #expect(request.method == "POST")
    #expect(request.headers == ["Accept": "application/json", "x-api-key": "api-key"])
  }

  @Test func planExcludedPoolsNeverAlert() async throws {
    let body = apolloBody(
      #"{"export_credit":{"limit":5000,"consumed":250,"left_over":4750},"ai_credit":{"limit":0,"consumed":0,"left_over":0},"conversation_credit":{"limit":0,"consumed":0,"left_over":0},"power_up_credit":{"limit":0,"consumed":0,"left_over":0}}"#
    )
    let balances = try await read(body).get()
    // A catalog pool with limit 0 stays visible as not in plan; others drop.
    #expect(balances.map(\.pool.creditType) == ["export_credit", "ai_credit"])
    #expect(PoolStatus.of(balances[1], settings: ProviderID.apollo.defaultSettings) == .unavailable)
  }

  @Test func dialerIsMinutesNotCredits() async throws {
    let balances = try await read(apolloBody(#"{"dialer":{"limit":500,"consumed":12,"left_over":488}}"#)).get()
    #expect(balances == [
      PoolBalance(pool: Pool(creditType: "dialer", label: "Dialer Minutes", unit: .minutes, cap: 500), balance: 488),
    ])
    #expect(Format.amount(488, pool: balances[0].pool) == "488 of 500 min")
    #expect(Format.unitName(.minutes) == "minutes")
  }

  @Test func fallsBackToLimitMinusConsumedOnlyWhenBothExist() async {
    #expect(await read(apolloBody(#"{"web_search_record_credit":{"limit":1000,"consumed":150}}"#)).balances
      == ["web_search_record_credit": 850])
    // Reported remaining wins over the arithmetic.
    #expect(await read(apolloBody(#"{"lead_credit":{"limit":1000,"consumed":150,"left_over":700}}"#)).balances
      == ["lead_credit": 700])
    // Neither left_over nor a usable limit and consumed: dropped, not zeroed.
    #expect(await read(apolloBody(#"{"lead_credit":{"limit":1000},"export_credit":{"limit":10,"consumed":1}}"#)).balances
      == ["export_credit": 9])
  }

  @Test func dynamicPoolsGetStableIdsAndHumanLabels() async throws {
    let body = apolloBody(#"{"zeta_credit":{"left_over":5},"ai_power_credit":{"limit":10,"left_over":4},"lead_credit":{"limit":10,"left_over":1}}"#)
    let balances = try await read(body).get()
    #expect(balances.map(\.pool.creditType) == ["lead_credit", "ai_power_credit", "zeta_credit"])
    #expect(balances.map(\.pool.label) == ["Lead Credits", "AI Power Credits", "Zeta Credits"])
    #expect(balances[2].pool.cap == nil) // no limit reported: no invented cap
  }

  @Test func overlappingPoolsAreNotSummed() async throws {
    // A unified plan reports the same allowance under several types.
    let body = apolloBody(#"{"lead_credit":{"limit":1000,"left_over":400},"export_credit":{"limit":1000,"left_over":400}}"#)
    #expect(try await read(body).get().map(\.balance) == [400, 400])
  }

  @Test func emptyOrMalformedStatsAreUnexpected() async {
    for body in [apolloBody("{}"), apolloBody(#"{"ai_credit":{"limit":0,"left_over":0}}"#), apolloBody("[]"),
                 apolloBody(#"{"lead_credit":"lots"}"#), "{}", "[]"] {
      #expect(await read(body).error == .missingField("credit_usage_stats"))
    }
    #expect(await read("<html>").error == .notJSON)
  }

  @Test func authAndScopeFailuresAreDistinct() async {
    #expect(await read("{}", status: 401).error == .keyRejected)
    #expect(await read("{}", status: 403).error == .keyLacksScope)
    #expect(MonitorError.provider(.apollo, .keyRejected).message == "Apollo rejected this key.")
    #expect(MonitorError.provider(.apollo, .keyLacksScope).message
      == "This Apollo key can't read credit usage. Enable the credit usage stats endpoint on the key.")
    #expect(await read("{}", status: 422).error == .httpStatus(422))
  }

  @Test func keyRequirementNamesTheEndpointNotAMasterKey() {
    #expect(Copy.keyRequirement("apollo")?.contains("api/v1/usage_stats/credit_usage_stats") == true)
    #expect(Copy.keyRequirement("apollo")?.contains("No master key needed") == true)
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
