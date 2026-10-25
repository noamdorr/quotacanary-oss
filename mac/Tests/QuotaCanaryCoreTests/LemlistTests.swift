import Foundation
@testable import QuotaCanaryCore
import Testing

/// From src/lib/adapters/lemlist.test.ts: the Get Team Credits docs example.
let lemlistFixture = #"""
{"credits":100,"details":{"remaining":{"total":100,"freemium":0,"subscription":80,"gifted":10,"paid":10}}}
"""#

private func read(_ body: String, status: Int = 200) async -> Result<[PoolBalance], ProviderReadError> {
  do {
    return .success(try await Lemlist.read(key: "lemlist-key", transport: ScriptedTransport([.respond(status: status, body: body)])))
  } catch {
    return .failure(error as! ProviderReadError)
  }
}

@Suite struct LemlistTests {
  @Test func readsTheTeamCreditsWithEmptyUsernameBasicAuth() async throws {
    let transport = ScriptedTransport([.respond(status: 200, body: lemlistFixture)])
    let balances = try await Lemlist.read(key: "lemlist-key", transport: transport)
    #expect(balances == [
      PoolBalance(pool: Pool(creditType: "credits", label: "Credits", unit: .credits, cap: nil), balance: 100),
    ])
    let expected = "Basic " + Data(":lemlist-key".utf8).base64EncodedString()
    #expect(expected == "Basic OmxlbWxpc3Qta2V5") // colon before the key, not after
    #expect(transport.requests.first?.url.absoluteString == "https://api.lemlist.com/api/team/credits")
    #expect(transport.requests.first?.method == "GET")
    #expect(transport.requests.first?.headers == ["Accept": "application/json", "Authorization": expected])
  }

  @Test func aSpentBalanceIsARealZero() async {
    #expect(await read(#"{"credits":0}"#).balances == ["credits": 0])
  }

  @Test func missingOrNonNumericCreditsIsNotAFabricatedBalance() async {
    for body in [#"{"details":{"remaining":{"total":100}}}"#, #"{"credits":"lots"}"#, #"{"credits":null}"#, #"{"credits":true}"#, "{}", "[]"] {
      #expect(await read(body).error == .missingField("credits"))
    }
    #expect(MonitorError.provider(.lemlist, .missingField("credits")).message == "lemlist returned an unexpected response.")
  }

  @Test func authFailuresAreKeyRejected() async {
    #expect(await read("The authentication you supplied is incorrect", status: 401).error == .keyRejected)
    #expect(await read("User linked to this API key is blocked", status: 403).error == .keyRejected)
    #expect(MonitorError.provider(.lemlist, .keyRejected).message == "lemlist rejected this key.")
  }

  @Test func rateLimitOtherStatusNonJSONAndTransportFailure() async {
    #expect(await read("{}", status: 429).error == .rateLimited)
    #expect(await read("{}", status: 500).error == .httpStatus(500))
    #expect(await read("not json").error == .notJSON)
    do {
      _ = try await Lemlist.read(key: "k", transport: ScriptedTransport([.fail]))
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
