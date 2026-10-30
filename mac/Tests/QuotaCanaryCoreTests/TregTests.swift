import Foundation
@testable import QuotaCanaryCore
import Testing

/// treg (QUO-349): the Swift twin of src/lib/adapters/treg.ts. The fixture is
/// the web test's recorded 200, trimmed of its ledger page.
private let tregFixture = #"""
{"org_id":26314,"balance_micro":5147475,"balance_usd":5.147475,"promo_grant_micro":5000000,"blocks":[{"kind":"promotional","remaining_micro":5147475,"expires_at":"2027-01-27T00:00:00Z"}],"holds":[],"entries":{"limit":50,"offset":0,"items":[]}}
"""#
private let tregSecret = #"{"api_token":"treg-token","org_id":"26314"}"#

private func read(key: String = tregSecret, body: String = tregFixture, status: Int = 200) async
  -> (Result<[PoolBalance], ProviderReadError>, ScriptedTransport)
{
  let transport = ScriptedTransport([.respond(status: status, body: body)])
  do {
    return (.success(try await Treg.read(key: key, transport: transport)), transport)
  } catch {
    return (.failure(error as! ProviderReadError), transport)
  }
}

@Suite struct TregTests {
  @Test func readsTheOrgsUSDBalanceWithTheTokenInXTregToken() async throws {
    let (result, transport) = await read()
    #expect(try result.get() == [PoolBalance(pool: Treg.balancePool, balance: 5.147475)])
    #expect(Treg.balancePool == Pool(creditType: "balance", label: "Balance", unit: .usd, cap: nil))
    let request = try #require(transport.requests.first)
    #expect(request.method == "GET")
    #expect(request.url.absoluteString == "https://treg.to/orgs/26314/balance")
    #expect(request.headers == ["Accept": "application/json", "X-Treg-Token": "treg-token"])
    #expect(request.body == nil)
    let (_, colon) = await read(key: "treg-token:26314")
    #expect(colon.requests.first?.url.absoluteString == "https://treg.to/orgs/26314/balance")
    let (_, encoded) = await read(key: #"{"api_token":"t","org_id":"1/../me"}"#)
    #expect(encoded.requests.first?.url.absoluteString == "https://treg.to/orgs/1%2F..%2Fme/balance")
  }

  @Test func readsAZeroAndRefusesAMissingBalance() async throws {
    #expect(try await read(body: #"{"balance_usd":0}"#).0.get().first?.balance == 0)
    for body in [#"{"balance_usd":null}"#, #"{"balance_usd":"lots"}"#, #"{"balance_micro":5147475}"#] {
      #expect(await read(body: body).0.error == .missingField("balance_usd"), "\(body)")
    }
  }

  @Test func statusesMapLikeTheWeb() async {
    #expect(await read(body: "{}", status: 401).0.error == .keyRejected)
    for status in [400, 403, 404, 422] {
      #expect(await read(body: "{}", status: status).0.error
        == .reportedError("This treg token can't read the balance of this org ID."), "\(status)")
    }
    #expect(await read(body: "{}", status: 429).0.error == .rateLimited)
    #expect(await read(body: "{}", status: 500).0.error == .httpStatus(500))
    #expect(await read(body: "not json").0.error == .notJSON)
    do {
      _ = try await Treg.read(key: tregSecret, transport: ScriptedTransport([.fail]))
      Issue.record("expected a failure")
    } catch {
      #expect(error as? ProviderReadError == .unreachable)
    }
  }

  @Test func aSecretMissingEitherValueIsNeverSent() async {
    for key in [#"{"api_token":"t"}"#, #"{"api_token":" ","org_id":"26314"}"#, ":26314", ""] {
      let (result, transport) = await read(key: key)
      #expect(result.error == .keyRejected, "\(key)")
      #expect(transport.requests.isEmpty)
    }
  }

  @Test func theFormMirrorsTheWebCredentialFields() {
    #expect(ProviderID.treg.credentialFields.map(\.name) == ["api_token", "org_id"])
    #expect(ProviderID.treg.credentialFields.map(\.label) == ["API token", "Org ID"])
    #expect(ProviderID.treg.credentialFields.map(\.isSecret) == [true, false])
    #expect(ProviderID.treg.topupURL == URL(string: "https://treg.to/app"))
  }
}

private extension Result where Success == [PoolBalance], Failure == ProviderReadError {
  var error: ProviderReadError? {
    if case let .failure(e) = self { return e }
    return nil
  }
}
