import Foundation
@testable import QuotaCanaryCore
import Testing

/// You.com (QUO-319): the Swift twin of src/lib/adapters/youcom.ts. The
/// fixture is the documented example the web test uses: 718924.5 cents is
/// $7,189.245.
private let youComFixture = #"""
{"data":{"type":"account","id":"e48a0acc172f1bd716527b65dcae373cf6d7a532dfb9fa6a1f962799eeaca84f","attributes":{"balance":718924.5}}}
"""#

private func read(
  _ steps: [ScriptedTransport.Step]
) async -> (Result<[PoolBalance], ProviderReadError>, ScriptedTransport) {
  let transport = ScriptedTransport(steps)
  do {
    return (.success(try await YouCom.read(key: "ydc-api-key", transport: transport)), transport)
  } catch {
    return (.failure(error as! ProviderReadError), transport)
  }
}

private func read(_ body: String, status: Int = 200) async -> Result<[PoolBalance], ProviderReadError> {
  await read([.respond(status: status, body: body)]).0
}

@Suite struct YouComTests {
  @Test func readsTheDocumentedResponseAsDollarsFromCents() async throws {
    let (result, transport) = await read([.respond(status: 200, body: youComFixture)])
    #expect(try result.get() == [PoolBalance(pool: YouCom.balancePool, balance: 7189.245)])
    #expect(YouCom.balancePool == Pool(creditType: "balance", label: "Balance", unit: .usd, cap: nil))
    let request = try #require(transport.requests.first)
    #expect(request.method == "GET")
    #expect(request.url.absoluteString == "https://api.you.com/v1/billing/account_balance")
    #expect(request.headers == ["Accept": "application/json", "X-API-Key": "ydc-api-key"])
  }

  @Test func keepsASpentBalanceAsARealZero() async throws {
    #expect(try await read(#"{"data":{"attributes":{"balance":0}}}"#).get() == [PoolBalance(pool: YouCom.balancePool, balance: 0)])
  }

  @Test func readsABalanceSentAsANumericString() async throws {
    #expect(try await read(#"{"data":{"attributes":{"balance":"1250"}}}"#).get() == [PoolBalance(pool: YouCom.balancePool, balance: 12.5)])
  }

  @Test func authScopeAndStatusFailuresAreDistinct() async {
    #expect(await read(#"{"detail":"Invalid or expired API key"}"#, status: 401).error == .keyRejected)
    #expect(await read(#"{"detail":"Forbidden"}"#, status: 403).error == .keyLacksScope)
    #expect(await read("{}", status: 429).error == .rateLimited)
    #expect(await read("{}", status: 500).error == .httpStatus(500))
  }

  @Test func aScopeFailureGetsTheGenericHintNotApollos() {
    let youcom = MonitorError.provider(.youcom, .keyLacksScope)
    #expect(youcom.message == "This You.com key can't read its balance. Check its permissions.")
    #expect(youcom.checkFailureMessage
      == "This You.com key can't read its balance. Check its permissions or replace it in Manage...")
    #expect(!Copy.monitorScopeBody(.youcom).contains("credit usage"))
    #expect(Copy.monitorScopeBody(.apollo).contains("credit usage"))
  }

  @Test func aNetworkFailureIsUnreachable() async {
    #expect(await read([.fail]).0.error == .unreachable)
  }

  @Test func aBodyWithoutABalanceOrNotJSONIsUnexpected() async {
    for body in [#"{"data":{"type":"account","attributes":{}}}"#, "{}", "[]", #"{"data":{"attributes":{"balance":true}}}"#] {
      #expect(await read(body).error == .missingField("data.attributes.balance"), "\(body)")
    }
    #expect(await read("<html>").error == .notJSON)
  }

  @Test func topUpGoesToThePlatform() {
    #expect(ProviderID.youcom.topupURL?.absoluteString == "https://you.com/platform")
  }
}

private extension Result where Success == [PoolBalance], Failure == ProviderReadError {
  var error: ProviderReadError? {
    if case let .failure(e) = self { return e }
    return nil
  }
}
