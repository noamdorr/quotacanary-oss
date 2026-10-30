import Foundation
@testable import QuotaCanaryCore
import Testing

/// QUO-282: the twin of src/lib/adapters/apify.ts. The limit is the plan's
/// included credit from GET /v2/users/me, the usage this cycle comes from
/// GET /v2/users/me/limits, and the spending cap on that second body
/// (`limits.maxMonthlyUsageUsd`, 500 by default) is never read.
private func me(_ credit: String) -> String {
  #"{"data":{"id":"u1","plan":{"id":"STARTER","monthlyUsageCreditsUsd":\#(credit)}}}"#
}

private func limits(_ used: String) -> String {
  #"{"data":{"limits":{"maxMonthlyUsageUsd":500},"current":{"monthlyUsageUsd":\#(used)}}}"#
}

private func read(_ steps: [ScriptedTransport.Step]) async -> (Result<[PoolBalance], ProviderReadError>, ScriptedTransport) {
  let transport = ScriptedTransport(steps)
  do {
    return (.success(try await Apify.read(key: "apify-key", transport: transport)), transport)
  } catch {
    return (.failure(error as! ProviderReadError), transport)
  }
}

private func usage(_ balance: Double, cap: Double) -> PoolBalance {
  var pool = Apify.usagePool
  pool.cap = cap
  return PoolBalance(pool: pool, balance: balance)
}

@Suite struct ApifyTests {
  @Test func readsThePlansIncludedCreditNotTheSpendingCap() async throws {
    let (result, transport) = await read([.respond(status: 200, body: me("49")), .respond(status: 200, body: limits("12.5"))])
    let balances = try result.get()
    #expect(balances == [usage(36.5, cap: 49)])
    #expect(Format.amount(balances[0].balance, pool: balances[0].pool, locale: Locale(identifier: "en_US")) == "$36.50 of $49.00")
    #expect(transport.requests.map(\.url.absoluteString)
      == ["https://api.apify.com/v2/users/me", "https://api.apify.com/v2/users/me/limits"])
    #expect(transport.requests.allSatisfy { $0.headers == ["Authorization": "Bearer apify-key"] && $0.method == "GET" })
  }

  @Test func aTinyUsageDoesNotReadAsAConfusingZero() async throws {
    let balances = try await read([.respond(status: 200, body: me("5")), .respond(status: 200, body: limits("0.0003"))]).0.get()
    #expect(balances == [usage(5 - 0.0003, cap: 5)])
    #expect(Format.amount(balances[0].balance, pool: balances[0].pool, locale: Locale(identifier: "en_US")) == "$5.00 of $5.00")
  }

  @Test func usagePastTheIncludedCreditShowsZeroLeftNeverNegative() async throws {
    let balances = try await read([.respond(status: 200, body: me("49")), .respond(status: 200, body: limits("60"))]).0.get()
    #expect(balances == [usage(0, cap: 49)])
    #expect(PoolStatus.of(balances[0], settings: ProviderID.apify.defaultSettings) == .empty)
  }

  @Test func missingUsageIsNothingUsedYet() async throws {
    let body = #"{"data":{"current":{}}}"#
    #expect(try await read([.respond(status: 200, body: me("49")), .respond(status: 200, body: body)]).0.get()
      == [usage(49, cap: 49)])
  }

  @Test func aPlanWithoutAnIncludedCreditIsAnUnexpectedResponse() async {
    #expect(await read([.respond(status: 200, body: me("null")), .respond(status: 200, body: limits("1"))]).0.error
      == .missingField("data.plan.monthlyUsageCreditsUsd"))
  }

  @Test func aRejectedKeyStopsBeforeTheUsageRequest() async {
    let (result, transport) = await read([.respond(status: 401, body: "{}")])
    #expect(result.error == .keyRejected)
    #expect(transport.requests.count == 1)
  }

  @Test func statusesBodiesAndTransportFailuresAreTold() async {
    #expect(await read([.respond(status: 429, body: "{}")]).0.error == .rateLimited)
    #expect(await read([.respond(status: 200, body: me("49")), .respond(status: 500, body: "{}")]).0.error == .httpStatus(500))
    #expect(await read([.respond(status: 200, body: "<html>")]).0.error == .notJSON)
    #expect(await read([.respond(status: 200, body: me("49")), .respond(status: 200, body: "<html>")]).0.error == .notJSON)
    #expect(await read([.fail]).0.error == .unreachable)
    #expect(await read([.respond(status: 200, body: me("49")), .fail]).0.error == .unreachable)
  }

  @Test func isHandWrittenWithTheCatalogNameTopUpAndPool() {
    #expect(ProviderRegistry.handWritten.contains(.apify))
    #expect(ProviderRegistry.current.entry(.apify) == nil)
    #expect(ProviderID.apify.displayName == "Apify")
    #expect(ProviderID.apify.pools == [Apify.usagePool])
    #expect(Apify.usagePool == Pool(creditType: "usage", label: "Monthly Usage Left", unit: .usd, cap: nil))
    #expect(ProviderID.apify.topupURL?.absoluteString == "https://console.apify.com/billing/subscription")
    // Unchanged from the catalog's dollar default, so saved Apify connections keep their thresholds.
    #expect(ProviderID.apify.defaultSettings == PoolSettings(monitored: true, low: 15, critical: 5))
  }
}

private extension Result where Success == [PoolBalance], Failure == ProviderReadError {
  var error: ProviderReadError? {
    if case let .failure(e) = self { return e }
    return nil
  }
}
