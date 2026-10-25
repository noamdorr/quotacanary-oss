import Foundation
@testable import QuotaCanaryCore
import Testing

/// ContactOut, Melt.ly, DeepSeek and Firecrawl (QUO-256): the Swift twins of
/// four web adapters that read a primary field and fall back to another when
/// it is absent. Fixtures are the web tests' examples.
private let contactOutFixture = #"""
{"status_code":200,"usage":{"count":100,"quota":200,"remaining":100,"phone_count":500,"phone_quota":1000,
"phone_remaining":500,"search_count":25,"search_quota":300,"search_remaining":275}}
"""#
private let meltlyFixture = #"""
{"success":true,"subscriptionCredits":12,"paygCredits":7,"totalCredits":19,"credits":{"total":19,
"subscription":{"remaining":12,"resets":true,"resetsAt":"2026-07-13T00:00:00.000Z","active":true,"status":"active","tier":100},
"payg":{"remaining":7,"expires":false,"expiresAt":null}}}
"""#
private let deepSeekFixture = #"""
{"is_available":true,"balance_infos":[{"currency":"USD","total_balance":"110.00","granted_balance":"0.00","topped_up_balance":"110.00"}]}
"""#
private let firecrawlFixture = #"""
{"success":true,"data":{"remainingCredits":1000,"planCredits":500000,"billingPeriodStart":"2025-01-01T00:00:00Z","billingPeriodEnd":"2025-01-31T23:59:59Z"}}
"""#

private let all: [ProviderID] = [.contactout, .meltly, .deepseek, .firecrawl]

private func read(
  _ provider: ProviderID, key: String = "the-key", _ steps: [ScriptedTransport.Step]
) async -> (Result<[PoolBalance], ProviderReadError>, ScriptedTransport) {
  let transport = ScriptedTransport(steps)
  do {
    let balances: [PoolBalance]
    switch provider {
    case .contactout: balances = try await ContactOut.read(key: key, transport: transport)
    case .meltly: balances = try await Meltly.read(key: key, transport: transport)
    case .deepseek: balances = try await DeepSeek.read(key: key, transport: transport)
    default: balances = try await Firecrawl.read(key: key, transport: transport)
    }
    return (.success(balances), transport)
  } catch {
    return (.failure(error as! ProviderReadError), transport)
  }
}

private func read(
  _ provider: ProviderID, key: String = "the-key", body: String, status: Int = 200
) async -> (Result<[PoolBalance], ProviderReadError>, ScriptedTransport) {
  await read(provider, key: key, [.respond(status: status, body: body)])
}

private func capped(_ pool: Pool, _ cap: Double?) -> Pool {
  var pool = pool
  pool.cap = cap
  return pool
}

/// A body that parses but has nothing usable, and the field it names.
private let missing: [ProviderID: (body: String, field: String)] = [
  .contactout: (#"{"status_code":200,"usage":{"count":1}}"#, "usage"),
  .meltly: (#"{"success":true}"#, "credits"),
  .deepseek: (#"{"balance_infos":[{"currency":"USD","total_balance":"n/a"}]}"#, "total_balance"),
  .firecrawl: (#"{"success":true,"data":{"planCredits":500}}"#, "data.remainingCredits"),
]

@Suite struct FallbackPathTwinsTests {
  // MARK: ContactOut

  @Test func contactOutReadsThreePoolsWithTheTokenHeaders() async throws {
    let (result, transport) = await read(.contactout, body: contactOutFixture)
    #expect(try result.get() == [
      PoolBalance(pool: capped(ContactOut.emailPool, 200), balance: 100),
      PoolBalance(pool: capped(ContactOut.phonePool, 1000), balance: 500),
      PoolBalance(pool: capped(ContactOut.searchPool, 300), balance: 275),
    ])
    #expect(ContactOut.pools.map(\.label) == ["Email Credits", "Phone Credits", "Search Credits"])
    let request = try #require(transport.requests.first)
    #expect(request.method == "GET")
    #expect(request.url.absoluteString == "https://api.contactout.com/v1/stats")
    #expect(request.headers == [
      "Content-Type": "application/json", "Accept": "application/json", "authorization": "basic", "token": "the-key",
    ])
    #expect(transport.timeouts == [nil])
  }

  @Test func contactOutTreatsAPrepaidQuotaAsTheBalanceWithNoCap() async throws {
    let body = #"{"status_code":200,"usage":{"quota":200,"phone_quota":1000,"search_quota":300}}"#
    #expect(try await read(.contactout, body: body).0.get() == [
      PoolBalance(pool: ContactOut.emailPool, balance: 200),
      PoolBalance(pool: ContactOut.phonePool, balance: 1000),
      PoolBalance(pool: ContactOut.searchPool, balance: 300),
    ])
  }

  @Test func contactOutOmitsAPoolWithNeitherValueAndNeverCapsAtZero() async throws {
    let body = #"{"usage":{"quota":0,"remaining":0,"search_quota":"300","search_remaining":"275"}}"#
    #expect(try await read(.contactout, body: body).0.get() == [
      PoolBalance(pool: ContactOut.emailPool, balance: 0),
      PoolBalance(pool: capped(ContactOut.searchPool, 300), balance: 275),
    ])
  }

  @Test func contactOutSurfacesTheVendorsOwnErrorFromAHealthyStatus() async {
    let failing = #"{"status_code":401,"message":"Invalid token","usage":{"quota":5}}"#
    #expect(await read(.contactout, body: failing).0.error == .reportedError("Invalid token"))
    #expect(await read(.contactout, body: #"{"status_code":"500"}"#).0.error == .reportedError("ContactOut returned an error."))
    #expect(await read(.contactout, body: #"{"status_code":200}"#).0.error == .missingField("usage"))
  }

  // MARK: Melt.ly

  @Test func meltlyReadsTheNestedCreditsWithTheTierAsTheSubscriptionCap() async throws {
    let (result, transport) = await read(.meltly, body: meltlyFixture)
    #expect(try result.get() == [
      PoolBalance(pool: capped(Meltly.subscriptionPool, 100), balance: 12),
      PoolBalance(pool: Meltly.paygPool, balance: 7),
    ])
    #expect(Meltly.pools.map(\.label) == ["Subscription Credits", "Pay-as-you-go Credits"])
    let request = try #require(transport.requests.first)
    #expect(request.method == "GET")
    #expect(request.url.absoluteString == "https://melt.ly/api/user/credits")
    #expect(request.headers == ["Accept": "application/json", "x-api-key": "the-key"])
  }

  @Test func meltlyFallsBackToTheTopLevelFieldsAndReadsNumericStrings() async throws {
    let body = #"{"success":true,"subscriptionCredits":"5","paygCredits":2}"#
    #expect(try await read(.meltly, body: body).0.get() == [
      PoolBalance(pool: Meltly.subscriptionPool, balance: 5),
      PoolBalance(pool: Meltly.paygPool, balance: 2),
    ])
    // One pool alone is enough; a tier of 0 is no cap.
    let one = #"{"credits":{"subscription":{"remaining":3,"tier":0}}}"#
    #expect(try await read(.meltly, body: one).0.get() == [PoolBalance(pool: Meltly.subscriptionPool, balance: 3)])
  }

  @Test func meltlySurfacesTheVendorsOwnError() async {
    #expect(await read(.meltly, body: #"{"success":false,"error":"Invalid API key"}"#).0.error == .reportedError("Invalid API key"))
    #expect(await read(.meltly, body: #"{"success":false,"message":"Slow down"}"#).0.error == .reportedError("Slow down"))
    #expect(await read(.meltly, body: #"{"success":false}"#).0.error == .reportedError("Melt.ly returned an error."))
  }

  // MARK: DeepSeek

  @Test func deepSeekReadsTheUSDTotalBalanceString() async throws {
    let (result, transport) = await read(.deepseek, body: deepSeekFixture)
    #expect(try result.get() == [PoolBalance(pool: DeepSeek.balancePool, balance: 110)])
    #expect(DeepSeek.balancePool.unit == .usd && DeepSeek.balancePool.cap == nil)
    let request = try #require(transport.requests.first)
    #expect(request.method == "GET")
    #expect(request.url.absoluteString == "https://api.deepseek.com/user/balance")
    #expect(request.headers == ["Authorization": "Bearer the-key"])
  }

  @Test func deepSeekPicksTheUSDEntryElseTheFirst() async throws {
    let both = #"""
    {"balance_infos":[{"currency":"CNY","total_balance":"800.00"},{"currency":"USD","total_balance":"110.00"}]}
    """#
    #expect(try await read(.deepseek, body: both).0.get() == [PoolBalance(pool: DeepSeek.balancePool, balance: 110)])
    let cny = #"{"balance_infos":[{"currency":"CNY","total_balance":"800.50"}]}"#
    #expect(try await read(.deepseek, body: cny).0.get() == [PoolBalance(pool: DeepSeek.balancePool, balance: 800.5)])
  }

  @Test func deepSeekReadsAnEmptyOrMissingBalanceListAsZero() async throws {
    for body in [#"{"is_available":false,"balance_infos":[]}"#, #"{"is_available":false}"#] {
      #expect(try await read(.deepseek, body: body).0.get() == [PoolBalance(pool: DeepSeek.balancePool, balance: 0)], "\(body)")
    }
  }

  // MARK: Firecrawl

  @Test func firecrawlReadsRemainingCreditsCappedAtThePlanWith20SecondsToAnswer() async throws {
    let (result, transport) = await read(.firecrawl, body: firecrawlFixture)
    #expect(try result.get() == [PoolBalance(pool: capped(Firecrawl.creditsPool, 500000), balance: 1000)])
    let request = try #require(transport.requests.first)
    #expect(request.method == "GET")
    #expect(request.url.absoluteString == "https://api.firecrawl.dev/v2/team/credit-usage")
    #expect(request.headers == ["Authorization": "Bearer the-key"])
    #expect(transport.timeouts == [20])
    #expect(Firecrawl.requestTimeout == 20)
  }

  @Test func firecrawlHasNoCapWithoutAPlan() async throws {
    let body = #"{"success":true,"data":{"remainingCredits":40,"planCredits":0}}"#
    #expect(try await read(.firecrawl, body: body).0.get() == [PoolBalance(pool: Firecrawl.creditsPool, balance: 40)])
  }

  @Test func firecrawlReportsARefusedRequest() async {
    #expect(await read(.firecrawl, body: #"{"success":false}"#).0.error
      == .reportedError("Firecrawl rejected the credit usage request."))
  }

  // MARK: All four

  @Test func authFailuresAreKeyRejected() async {
    for provider in all {
      for status in [401, 403] {
        #expect(await read(provider, body: "{}", status: status).0.error == .keyRejected, "\(provider.rawValue) \(status)")
      }
    }
    #expect(MonitorError.provider(.contactout, .keyRejected).message == "ContactOut rejected this key.")
  }

  @Test func rateLimitAndOtherStatusesAreTold() async {
    for provider in all {
      #expect(await read(provider, body: "{}", status: 429).0.error == .rateLimited, "\(provider.rawValue)")
      #expect(await read(provider, body: "{}", status: 500).0.error == .httpStatus(500), "\(provider.rawValue)")
    }
  }

  @Test func aBodyThatIsNotJSONOrLacksTheFieldIsAnUnexpectedResponse() async {
    for provider in all {
      #expect(await read(provider, body: "<html>nope</html>").0.error == .notJSON, "\(provider.rawValue)")
      let (body, field) = missing[provider]!
      #expect(await read(provider, body: body).0.error == .missingField(field), "\(provider.rawValue)")
    }
    #expect(MonitorError.provider(.firecrawl, .missingField("data.remainingCredits")).message
      == "Firecrawl returned an unexpected response.")
  }

  @Test func aTransportFailureIsUnreachable() async {
    for provider in all {
      #expect(await read(provider, [.fail]).0.error == .unreachable, "\(provider.rawValue)")
    }
  }

  @Test func theTopUpLinksAreTheSeedRowsVerbatim() {
    #expect(ProviderID.contactout.topupURL?.absoluteString == "https://contactout.com/pricing")
    #expect(ProviderID.meltly.topupURL?.absoluteString == "https://melt.ly")
    #expect(ProviderID.deepseek.topupURL?.absoluteString == "https://platform.deepseek.com/top_up")
    #expect(ProviderID.firecrawl.topupURL?.absoluteString == "https://www.firecrawl.dev/pricing")
  }
}

private extension Result where Success == [PoolBalance], Failure == ProviderReadError {
  var error: ProviderReadError? {
    if case let .failure(e) = self { return e }
    return nil
  }
}
