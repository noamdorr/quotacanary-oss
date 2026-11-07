import Foundation
@testable import QuotaCanaryCore
import Testing

/// treg (QUO-349): the Swift twin of src/lib/adapters/treg.ts. The fixture is
/// synthetic, including every account and billing value. Since QUO-423 the
/// key alone is enough: `/auth/me` names its org, then the balance is read.
private let tregFixture = #"""
{"org_id":123456,"balance_micro":1250000,"balance_usd":1.25,"promo_grant_micro":2000000,"blocks":[{"kind":"promotional","remaining_micro":1250000,"expires_at":"2030-01-01T00:00:00Z"}],"holds":[],"entries":{"limit":50,"offset":0,"items":[]}}
"""#
/// Invented `/auth/me` response; no customer account data.
private let tregMe = #"{"email":"someone@example.com","org_id":123456,"org":"synthetic-team","role":"owner"}"#
private let tregKey = "treg-token"

private func read(
  key: String = tregKey, me: String = tregMe, meStatus: Int = 200, body: String = tregFixture, status: Int = 200
) async -> (Result<[PoolBalance], ProviderReadError>, ScriptedTransport) {
  let transport = ScriptedTransport([.respond(status: meStatus, body: me), .respond(status: status, body: body)])
  do {
    return (.success(try await Treg.read(key: key, transport: transport)), transport)
  } catch {
    return (.failure(error as! ProviderReadError), transport)
  }
}

@Suite struct TregTests {
  @Test func findsTheOrgFromTheKeyThenReadsItsUSDBalance() async throws {
    let (result, transport) = await read()
    #expect(try result.get() == [PoolBalance(pool: Treg.balancePool, balance: 1.25)])
    #expect(Treg.balancePool == Pool(creditType: "balance", label: "Balance", unit: .usd, cap: nil))
    #expect(transport.requests.map(\.url.absoluteString)
      == ["https://treg.to/auth/me", "https://treg.to/orgs/123456/balance"])
    for request in transport.requests {
      #expect(request.method == "GET")
      #expect(request.headers == ["Accept": "application/json", "X-Treg-Token": "treg-token"])
      #expect(request.body == nil)
    }
  }

  @Test func aSavedTwoFieldSecretStillReadsAndItsOrgIDIsIgnored() async throws {
    for key in [#"{"api_token":"treg-token","org_id":"123456"}"#, #"{"api_token":"treg-token","org_id":"Synthetic Team"}"#] {
      let (result, transport) = await read(key: key)
      #expect(try result.get().first?.balance == 1.25, "\(key)")
      #expect(transport.requests.map(\.url.absoluteString)
        == ["https://treg.to/auth/me", "https://treg.to/orgs/123456/balance"], "\(key)")
      #expect(transport.requests.first?.headers["X-Treg-Token"] == "treg-token", "\(key)")
    }
  }

  @Test func aKeyWithNoTeamIsNotReadFurther() async {
    for me in [#"{"email":"a@b.c"}"#, #"{"org_id":null}"#, #"{"org_id":"123456"}"#, #"{"org_id":0}"#, #"{"org_id":-3}"#,
                    #"{"org_id":true}"#, #"{"org_id":1.5}"#] {
      let (result, transport) = await read(me: me)
      #expect(result.error == .guidance(.tregNotTiedToATeam), "\(me)")
      #expect(transport.requests.count == 1, "\(me)")
    }
  }

  @Test func theFirstTeamIdIsAnId() async {
    let (_, transport) = await read(me: #"{"org_id":1}"#)
    #expect(transport.requests.last?.url.absoluteString == "https://treg.to/orgs/1/balance")
  }

  @Test func readsAZeroAndRefusesAMissingBalance() async throws {
    #expect(try await read(body: #"{"balance_usd":0}"#).0.get().first?.balance == 0)
    for body in [#"{"balance_usd":null}"#, #"{"balance_usd":"lots"}"#, #"{"balance_micro":1250000}"#] {
      #expect(await read(body: body).0.error == .missingField("balance_usd"), "\(body)")
    }
  }

  @Test func statusesMapLikeTheWeb() async {
    // Either call: a dead key is a 401 on /auth/me, a revoked one mid-read on the balance.
    #expect(await read(meStatus: 401).0.error == .keyRejected)
    #expect(await read(body: "{}", status: 401).0.error == .keyRejected)
    for status in [400, 403, 404] {
      #expect(await read(meStatus: status).0.error == .guidance(.tregNotTiedToATeam), "\(status)")
      #expect(await read(body: "{}", status: status).0.error == .guidance(.tregNotTiedToATeam), "\(status)")
    }
    #expect(await read(meStatus: 429).0.error == .rateLimited)
    #expect(await read(body: "{}", status: 429).0.error == .rateLimited)
    #expect(await read(meStatus: 500).0.error == .httpStatus(500))
    #expect(await read(body: "{}", status: 500).0.error == .httpStatus(500))
    #expect(await read(me: "not json").0.error == .notJSON)
    #expect(await read(body: "not json").0.error == .notJSON)
    for steps: [ScriptedTransport.Step] in [[.fail], [.respond(status: 200, body: tregMe), .fail]] {
      do {
        _ = try await Treg.read(key: tregKey, transport: ScriptedTransport(steps))
        Issue.record("expected a failure")
      } catch {
        #expect(error as? ProviderReadError == .unreachable)
      }
    }
  }

  @Test func aBlankKeyIsNeverSent() async {
    for key in ["", "  ", #"{"api_token":" ","org_id":"123456"}"#, #"{"org_id":"123456"}"#] {
      let (result, transport) = await read(key: key)
      #expect(result.error == .keyRejected, "\(key)")
      #expect(transport.requests.isEmpty)
    }
  }

  @Test func theFormAsksForTheKeyOnly() {
    #expect(ProviderID.treg.credentialFields.isEmpty)
    #expect(ProviderID.treg.topupURL == URL(string: "https://treg.to/app"))
  }
}

private extension Result where Success == [PoolBalance], Failure == ProviderReadError {
  var error: ProviderReadError? {
    if case let .failure(e) = self { return e }
    return nil
  }
}
