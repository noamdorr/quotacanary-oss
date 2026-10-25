import Foundation
@testable import QuotaCanaryCore
import Testing

/// From src/lib/adapters/phantombuster.test.ts: a response built from the
/// fetch-resources 200 schema (no live sanitized response exists), trimmed to
/// the fields the adapter reads. Counters are read as usage (QUO-229 hypothesis).
private func fixture(
  counters: String = #""monthlyExecutionTime":300,"monthlyAiCredit":2500,"monthlyMail":100"#,
  plan: String = #"{"name":"Starter","monthlyExecutionTime":1200,"monthlyAiCredits":10000,"monthlyMails":500}"#,
  topUps: String = #"""
  {"emailCredits":[{"id":"tu_1","amount":1000,"remaining":400,"expiresAt":1800000000000},{"id":"tu_2","amount":500,"remaining":500,"expiresAt":1810000000000}],"aiCredits":[{"id":"tu_3","amount":5000,"remaining":0,"expiresAt":1800000000000},{"id":"tu_4","amount":2000,"remaining":"lots","expiresAt":1}]}
  """#
) -> String {
  #"{"#
    + counters
    + #","monthlyCaptcha":0,"dailyExecutionTime":12,"planName":"Starter","plan":"# + plan
    + #","dailyResourceNextResetAt":1792368000000,"monthlyResourceNextResetAt":1793491200000,"topUps":"# + topUps
    + "}"
}

private func pool(_ creditType: String, _ label: String, _ unit: CreditUnit, cap: Double?) -> Pool {
  Pool(creditType: creditType, label: label, unit: unit, cap: cap)
}

private func read(_ body: String, status: Int = 200) async -> Result<[PoolBalance], ProviderReadError> {
  do {
    let transport = ScriptedTransport([.respond(status: status, body: body)])
    return .success(try await PhantomBuster.read(key: "pb-key", transport: transport))
  } catch {
    return .failure(error as! ProviderReadError)
  }
}

@Suite struct PhantomBusterTests {
  @Test func readsThreePoolsSummingTopUpsIntoBalanceAndCap() async throws {
    let transport = ScriptedTransport([.respond(status: 200, body: fixture())])
    let balances = try await PhantomBuster.read(key: "pb-key", transport: transport)
    #expect(balances == [
      PoolBalance(pool: pool("execution_time", "Execution time", .minutes, cap: 1200), balance: 900),
      PoolBalance(pool: pool("ai_credits", "AI credits", .credits, cap: 15000), balance: 7500),
      PoolBalance(pool: pool("emails", "Emails", .credits, cap: 2000), balance: 1300),
    ])
    #expect(transport.requests.first?.url.absoluteString == "https://api.phantombuster.com/api/v2/orgs/fetch-resources")
    #expect(transport.requests.first?.method == "GET")
    #expect(transport.requests.first?.headers == ["X-Phantombuster-Key": "pb-key", "Accept": "application/json"])
  }

  @Test func withoutTopUpsTheCapIsThePlanLimit() async {
    let balances = try? await read(fixture(topUps: "null")).get()
    #expect(balances?.map(\.balance) == [900, 7500, 400])
    #expect(balances?.map(\.pool.cap) == [1200, 10000, 500])
  }

  @Test func aPoolOffThePlanIsDropped() async {
    let plan = #"{"monthlyExecutionTime":1200,"monthlyAiCredits":0}"#
    #expect(await read(fixture(plan: plan, topUps: "{}")).balances == ["execution_time": 900])
  }

  @Test func aFullySpentPoolIsARealZero() async {
    let counters = #""monthlyExecutionTime":1200,"monthlyAiCredit":2500,"monthlyMail":100"#
    #expect(await read(fixture(counters: counters)).balances?["execution_time"] == 0)
  }

  @Test func aCounterAboveItsPlanLimitIsUnexpected() async {
    let counters = #""monthlyExecutionTime":300,"monthlyAiCredit":10001,"monthlyMail":100"#
    #expect(await read(fixture(counters: counters)).error == .missingField("monthlyAiCredit"))
    #expect(MonitorError.provider(.phantombuster, .missingField("monthlyAiCredit")).message
      == "PhantomBuster returned an unexpected response.")
  }

  @Test func aMissingOrNegativeCounterIsNotAFabricatedBalance() async {
    for mail in [#""monthlyMail":null"#, #""monthlyMail":"lots""#, #""monthlyMail":-1"#, #""other":1"#] {
      let counters = #""monthlyExecutionTime":300,"monthlyAiCredit":2500,"# + mail
      #expect(await read(fixture(counters: counters)).error == .missingField("monthlyMail"))
    }
  }

  @Test func noPlanLimitsIsUnexpected() async {
    #expect(await read(fixture(plan: #"{"name":"Starter"}"#)).error == .missingField("plan"))
    #expect(await read(fixture(plan: "null")).error == .missingField("plan"))
    #expect(await read("[]").error == .missingField("plan"))
  }

  @Test func statusesMapToTheSharedErrors() async {
    // 401 body observed with a dummy key on 2026-10-17.
    #expect(await read(#"{"status":"error","error":"API key not found"}"#, status: 401).error == .keyRejected)
    #expect(await read("{}", status: 403).error == .keyRejected)
    #expect(await read("{}", status: 429).error == .rateLimited)
    #expect(await read("{}", status: 500).error == .httpStatus(500))
    #expect(await read("not json{").error == .notJSON)
    #expect(MonitorError.provider(.phantombuster, .keyRejected).message == "PhantomBuster rejected this key.")
  }

  @Test func aTransportFailureIsUnreachable() async {
    do {
      _ = try await PhantomBuster.read(key: "k", transport: ScriptedTransport([.fail]))
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
