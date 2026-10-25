import Foundation
@testable import QuotaCanaryCore
import Testing

/// Hunter through its catalog entry (catalog/tools.json), with the fixtures
/// the hand-written port used. Real (sanitized) /v2/account response, from
/// src/lib/adapters/hunter.test.ts. `available` is the monthly CAP, not the
/// remaining balance.
let hunterFixture = #"""
{"data":{"plan_name":"Data-platform","plan_level":5,"reset_date":"2027-03-15",
"requests":{"searches":{"used":0,"available":0},"verifications":{"used":480,"available":1000}},
"calls":{"used":842,"available":1362}}}
"""#

private let hunter = ProviderRegistry.current.entry(.hunter)!

private func read(_ body: String, status: Int = 200) async -> Result<[PoolBalance], ProviderReadError> {
  do {
    return .success(try await CatalogProvider.read(hunter, key: "key", transport: ScriptedTransport([.respond(status: status, body: body)])))
  } catch {
    return .failure(error as! ProviderReadError)
  }
}

@Suite struct HunterTests {
  @Test func returnsSearchesAndVerificationsAsSeparatePoolsWithCaps() async throws {
    let transport = ScriptedTransport([.respond(status: 200, body: hunterFixture)])
    let balances = try await CatalogProvider.read(hunter, key: "hunter-key", transport: transport)
    #expect(balances == [
      PoolBalance(pool: Pool(creditType: "searches", label: "Searches", unit: .credits, cap: 0), balance: 0),
      PoolBalance(pool: Pool(creditType: "verifications", label: "Verifications", unit: .credits, cap: 1000), balance: 520),
    ])
    // Key rides in the Authorization header, never the URL query string.
    #expect(transport.requests.first?.url.absoluteString == "https://api.hunter.io/v2/account")
    #expect(transport.requests.first?.method == "GET")
    #expect(transport.requests.first?.headers == ["Authorization": "Bearer hunter-key"])
  }

  @Test func remainingIsAllowanceMinusUsage() async {
    let body = #"{"data":{"requests":{"searches":{"used":20,"available":50},"verifications":{"used":"75","available":"100"}}}}"#
    #expect(await read(body).balances == ["searches": 30, "verifications": 25])
  }

  @Test func missingUsageCountsAsZero() async {
    let body = #"{"data":{"requests":{"searches":{"available":50}}}}"#
    #expect(await read(body).balances == ["searches": 50])
  }

  @Test func poolWithMissingAllowanceIsDroppedNotZeroed() async {
    // No `available` on searches: not reported, so not a false empty pool.
    for searches in [#"{"used":3}"#, #"{"used":3,"available":null}"#, #"{"used":3,"available":true}"#, "null"] {
      let body = #"{"data":{"requests":{"searches":"# + searches + #","verifications":{"used":1,"available":10}}}}"#
      #expect(await read(body).balances == ["verifications": 9])
    }
  }

  @Test func noReportedPoolIsAnUnexpectedResponse() async {
    for body in [#"{"data":{}}"#, #"{"data":{"requests":{}}}"#, #"{"data":{"requests":{"searches":{"used":1}}}}"#, "[]"] {
      #expect(await read(body).error == .missingField("data.requests.searches.available"))
    }
    #expect(MonitorError.provider(.hunter, .missingField("data.requests.searches.available")).message == "Hunter returned an unexpected response.")
  }

  @Test func rejects401AsKeyRejected() async {
    #expect(await read("{}", status: 401).error == .keyRejected)
    #expect(MonitorError.provider(.hunter, .keyRejected).message == "Hunter rejected this key.")
  }

  @Test func otherStatusAndNonJSONAreReported() async {
    #expect(await read("{}", status: 503).error == .httpStatus(503))
    #expect(await read("{}", status: 429).error == .rateLimited)
    #expect(await read("<html>").error == .notJSON)
    #expect(MonitorError.provider(.hunter, .httpStatus(503)).message == "Hunter returned 503.")
  }

  @Test func transportFailureIsUnreachable() async {
    do {
      _ = try await CatalogProvider.read(hunter, key: "key", transport: ScriptedTransport([.fail]))
      Issue.record("expected a failure")
    } catch {
      #expect(error as? ProviderReadError == .unreachable)
    }
    #expect(MonitorError.provider(.hunter, .unreachable).message == "Couldn't reach Hunter.")
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
