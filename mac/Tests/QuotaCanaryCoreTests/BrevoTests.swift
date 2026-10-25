import Foundation
@testable import QuotaCanaryCore
import Testing

/// From src/lib/adapters/brevo.test.ts: the Get account details docs example's plan[].
let brevoFixture = #"""
{"organization_id":"5fa2b8c123456789abcdef01","user_id":1234567,"enterprise":false,"plan":[{"credits":250,"creditsType":"sendLimit","type":"free"},{"credits":15,"creditsType":"sendLimit","type":"sms"}]}
"""#

/// Built from the documented plan[] item schema: a subscription and pay-as-you-go
/// credits on one account plus sms, in the docs' enum order.
private let paidEntries = [
  #"{"credits":1200,"creditsType":"sendLimit","type":"payAsYouGo"}"#,
  #"{"credits":4300,"creditsType":"sendLimit","type":"subscription","startDate":"1759276800","endDate":"1761955200"}"#,
  #"{"credits":80,"creditsType":"sendLimit","type":"sms"}"#,
]

private func plan(_ entries: [String]) -> String { #"{"plan":["# + entries.joined(separator: ",") + "]}" }

private func read(_ body: String, status: Int = 200) async -> Result<[PoolBalance], ProviderReadError> {
  do {
    return .success(try await Brevo.read(key: "brevo-key", transport: ScriptedTransport([.respond(status: status, body: body)])))
  } catch {
    return .failure(error as! ProviderReadError)
  }
}

@Suite struct BrevoTests {
  @Test func readsTheDocsExampleWithTheApiKeyHeader() async throws {
    let transport = ScriptedTransport([.respond(status: 200, body: brevoFixture)])
    let balances = try await Brevo.read(key: "brevo-key", transport: transport)
    #expect(balances == [
      PoolBalance(pool: Pool(creditType: "sms", label: "SMS credits", unit: .credits, cap: nil), balance: 15),
      PoolBalance(pool: Pool(creditType: "free_emails", label: "Free daily emails", unit: .credits, cap: nil), balance: 250),
    ])
    #expect(transport.requests.first?.url.absoluteString == "https://api.brevo.com/v3/account")
    #expect(transport.requests.first?.method == "GET")
    #expect(transport.requests.first?.headers == ["Accept": "application/json", "api-key": "brevo-key"])
  }

  @Test func sumsSubscriptionAndPayAsYouGoIntoOneEmailPool() async throws {
    let balances = try await read(plan(paidEntries)).get()
    #expect(balances.map(\.pool.creditType) == ["emails", "sms"])
    #expect(balances.map(\.pool.label) == ["Email credits", "SMS credits"])
    #expect(balances.map(\.balance) == [5500, 80])
  }

  @Test func selectsByTypeSoAReorderedPlanReadsTheSame() async throws {
    let expected = try await read(plan(paidEntries)).get()
    #expect(try await read(plan(paidEntries.reversed())).get() == expected)
    #expect(try await read(plan([paidEntries[2], paidEntries[0], paidEntries[1]])).get() == expected)
  }

  @Test func eachPoolIsOmittedWithoutAMatchingEntry() async {
    #expect(await read(plan([paidEntries[2]])).balances == ["sms": 80])
    #expect(await read(plan([paidEntries[1]])).balances == ["emails": 4300])
    #expect(await read(plan([#"{"credits":0,"creditsType":"sendLimit","type":"subscription"}"#])).balances == ["emails": 0])
  }

  @Test func userLimitEntriesAndResellerPlansAreIgnored() async {
    let noise = [
      #"{"credits":50,"creditsType":"userLimit","type":"subscription"}"#,
      #"{"credits":9000,"creditsType":"sendLimit","type":"reseller","userLimit":10}"#,
    ]
    #expect(await read(plan(noise + paidEntries)).balances == ["emails": 5500, "sms": 80])
  }

  @Test func noUsableEntryOrBadCreditsIsNotAFabricatedBalance() async {
    for body in [plan([]), plan([#"{"credits":50,"creditsType":"userLimit","type":"sms"}"#]),
                 plan([#"{"credits":9000,"creditsType":"sendLimit","type":"reseller"}"#]), "{}", #"{"plan":null}"#, "[]"] {
      #expect(await read(body).error == .missingField("plan"))
    }
    for credits in [#""lots""#, "null", "true", #""""#] {
      let entry = #"{"credits":"# + credits + #","creditsType":"sendLimit","type":"payAsYouGo"}"#
      #expect(await read(plan([paidEntries[1], entry])).error == .missingField("plan.credits"))
    }
    #expect(MonitorError.provider(.brevo, .missingField("plan")).message == "Brevo returned an unexpected response.")
  }

  @Test func authFailuresAreKeyRejected() async {
    // 401 body observed with a dummy key on 2026-10-17.
    #expect(await read(#"{"message":"Key not found","code":"unauthorized"}"#, status: 401).error == .keyRejected)
    #expect(await read(#"{"code":"permission_denied","message":"denied"}"#, status: 403).error == .keyRejected)
    #expect(MonitorError.provider(.brevo, .keyRejected).message == "Brevo rejected this key.")
  }

  @Test func rateLimitOtherStatusNonJSONAndTransportFailure() async {
    #expect(await read("{}", status: 429).error == .rateLimited)
    #expect(await read("{}", status: 500).error == .httpStatus(500))
    #expect(await read("not json").error == .notJSON)
    do {
      _ = try await Brevo.read(key: "k", transport: ScriptedTransport([.fail]))
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
