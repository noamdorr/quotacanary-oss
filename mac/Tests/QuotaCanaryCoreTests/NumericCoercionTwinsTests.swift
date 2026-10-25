import Foundation
@testable import QuotaCanaryCore
import Testing

/// Hyperbolic, Orthogonal and ZeroBounce (QUO-257): the Swift twins of the
/// three web adapters that stay hand-written for one numeric rule each (a
/// cents scale, a formatted dollar string, a sign check). Fixtures are the
/// web tests' examples.
private func read(
  _ provider: ProviderID, key: String = "the-key", _ steps: [ScriptedTransport.Step]
) async -> (Result<[PoolBalance], ProviderReadError>, ScriptedTransport) {
  let transport = ScriptedTransport(steps)
  do {
    let balances: [PoolBalance]
    switch provider {
    case .hyperbolic: balances = try await Hyperbolic.read(key: key, transport: transport)
    case .orthogonal: balances = try await Orthogonal.read(key: key, transport: transport)
    default: balances = try await ZeroBounce.read(key: key, transport: transport)
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

private func bodies(_ provider: ProviderID) -> (ok: String, missing: String) {
  switch provider {
  case .hyperbolic: return (#"{"credits":1000}"#, #"{"other":1}"#)
  case .orthogonal: return (#"{"balance":"$5.00"}"#, #"{"balance":"nope"}"#)
  default: return (#"{"Credits":1500}"#, #"{"other":1}"#)
  }
}

private let missingFields: [ProviderID: String] = [
  .hyperbolic: "credits", .orthogonal: "balance", .zerobounce: "Credits",
]

@Suite struct NumericCoercionTwinsTests {
  @Test func hyperbolicConvertsCentsToDollarsWithBearerAuth() async throws {
    let (result, transport) = await read(.hyperbolic, body: #"{"credits":1000}"#)
    #expect(try result.get() == [PoolBalance(pool: Hyperbolic.balancePool, balance: 10)])
    #expect(Hyperbolic.balancePool == Pool(creditType: "balance", label: "Balance", unit: .usd, cap: nil))
    let request = try #require(transport.requests.first)
    #expect(request.method == "GET")
    #expect(request.url.absoluteString == "https://api.hyperbolic.xyz/billing/get_current_balance")
    #expect(request.headers == ["Authorization": "Bearer the-key"])
    // Fractions of a dollar, zero and a numeric string all go through the same divide.
    #expect(try await read(.hyperbolic, body: #"{"credits":1234}"#).0.get().first?.balance == 12.34)
    #expect(try await read(.hyperbolic, body: #"{"credits":0}"#).0.get().first?.balance == 0)
    #expect(try await read(.hyperbolic, body: #"{"credits":"250"}"#).0.get().first?.balance == 2.5)
  }

  @Test func orthogonalReadsAFormattedDollarString() async throws {
    let (result, transport) = await read(.orthogonal, body: #"{"balance":"$5.00"}"#)
    #expect(try result.get() == [PoolBalance(pool: Orthogonal.balancePool, balance: 5)])
    #expect(Orthogonal.balancePool == Pool(creditType: "balance", label: "Credit Balance", unit: .usd, cap: nil))
    let request = try #require(transport.requests.first)
    #expect(request.method == "GET")
    #expect(request.url.absoluteString == "https://api.orthogonal.com/v1/credits/balance")
    #expect(request.headers == ["Authorization": "Bearer the-key"])
    #expect(try await read(.orthogonal, body: #"{"balance":"$1,234.56"}"#).0.get().first?.balance == 1234.56)
    #expect(try await read(.orthogonal, body: #"{"balance":"12.5"}"#).0.get().first?.balance == 12.5)
  }

  @Test func orthogonalReadsAPlainNumberToo() async throws {
    #expect(try await read(.orthogonal, body: #"{"balance":42.5}"#).0.get().first?.balance == 42.5)
    #expect(try await read(.orthogonal, body: #"{"balance":0}"#).0.get().first?.balance == 0)
    for body in [#"{"balance":""}"#, #"{"balance":"$"}"#, #"{"balance":true}"#, #"{"balance":null}"#, #"{}"#] {
      #expect(await read(.orthogonal, body: body).0.error == .missingField("balance"), "\(body)")
    }
  }

  @Test func zeroBounceReadsCreditsFromTheQueryString() async throws {
    let (result, transport) = await read(.zerobounce, body: #"{"Credits":1500}"#)
    #expect(try result.get() == [PoolBalance(pool: ZeroBounce.creditsPool, balance: 1500)])
    #expect(ZeroBounce.creditsPool == Pool(creditType: "credits", label: "Credits", unit: .credits, cap: nil))
    let request = try #require(transport.requests.first)
    #expect(request.method == "GET")
    #expect(request.url.absoluteString == "https://api.zerobounce.net/v2/getcredits?api_key=the-key")
    #expect(request.headers.isEmpty)
    // Escaped like the web's encodeURIComponent.
    let (_, odd) = await read(.zerobounce, key: "a+b&c d", body: #"{"Credits":1}"#)
    #expect(odd.requests.first?.url.absoluteString == "https://api.zerobounce.net/v2/getcredits?api_key=a%2Bb%26c%20d")
    #expect(try await read(.zerobounce, body: #"{"Credits":0}"#).0.get().first?.balance == 0)
  }

  @Test func zeroBounceTreatsNegativeCreditsAsARejectedKey() async {
    #expect(await read(.zerobounce, body: #"{"Credits":-1}"#).0.error == .keyRejected)
    #expect(await read(.zerobounce, body: #"{"Credits":"-1"}"#).0.error == .keyRejected)
  }

  @Test func authFailuresAreKeyRejected() async {
    for provider in [ProviderID.hyperbolic, .orthogonal, .zerobounce] {
      for status in [401, 403] {
        #expect(await read(provider, body: "{}", status: status).0.error == .keyRejected, "\(provider.rawValue) \(status)")
      }
    }
    #expect(MonitorError.provider(.hyperbolic, .keyRejected).message == "Hyperbolic rejected this key.")
  }

  @Test func rateLimitAndOtherStatusesAreTold() async {
    for provider in [ProviderID.hyperbolic, .orthogonal, .zerobounce] {
      #expect(await read(provider, body: "{}", status: 429).0.error == .rateLimited, "\(provider.rawValue)")
      #expect(await read(provider, body: "{}", status: 500).0.error == .httpStatus(500), "\(provider.rawValue)")
      #expect(await read(provider, body: "{}", status: 404).0.error == .httpStatus(404), "\(provider.rawValue)")
    }
  }

  @Test func aBodyThatIsNotJSONOrLacksTheFieldIsAnUnexpectedResponse() async {
    for provider in [ProviderID.hyperbolic, .orthogonal, .zerobounce] {
      #expect(await read(provider, body: "<html>nope</html>").0.error == .notJSON, "\(provider.rawValue)")
      #expect(await read(provider, body: "[]").0.error == .missingField(missingFields[provider]!), "\(provider.rawValue)")
      #expect(await read(provider, body: bodies(provider).missing).0.error == .missingField(missingFields[provider]!),
        "\(provider.rawValue)")
    }
    #expect(MonitorError.provider(.zerobounce, .missingField("Credits")).message == "ZeroBounce returned an unexpected response.")
  }

  @Test func aTransportFailureIsUnreachable() async {
    for provider in [ProviderID.hyperbolic, .orthogonal, .zerobounce] {
      #expect(await read(provider, [.fail]).0.error == .unreachable, "\(provider.rawValue)")
    }
  }

  @Test func theTopUpLinkIsTheSeedRowVerbatim() {
    #expect(ProviderID.hyperbolic.topupURL?.absoluteString == "https://app.hyperbolic.ai/settings/billing")
  }
}

private extension Result where Success == [PoolBalance], Failure == ProviderReadError {
  var error: ProviderReadError? {
    if case let .failure(e) = self { return e }
    return nil
  }
}
