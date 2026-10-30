import Foundation
@testable import QuotaCanaryCore
import Testing

/// HLR Lookup, Icypeas and The Companies API (QUO-342): the Swift twins of the
/// QUO-248 web adapters, each needing a second value beside the key. Fixtures
/// are the web tests' docs examples.
private let hlrFixture = #"{"body":{"Status":"OK","Credits":15000}}"#
private let icypeasFixture = #"""
{"userId":"ax782432ezeze89087","customerId":"cus_NUigN0lSe4hOh9","currency":"eur","lastInvoiceUrl":"","plan":"Basic Plan","status":"paid","credits":24,"quotas":{"daily":1000}}
"""#
private let companiesFixture = #"""
{"country":"us","createdAt":"2020-06-29 08:21:01","credits":500000,"id":1,"isSubscriber":true,"name":"Jay Gatsby Enterprises","websiteUrl":"https://www.jaygatsbyenterprises.com"}
"""#

private let hlrSecret = #"{"api_key":"hlr-key","api_secret":"hlr-secret"}"#
private let icypeasSecret = #"{"api_key":"icy-key","email":"me@example.com"}"#
private let companiesSecret = #"{"api_token":"tca-token","team_id":"42"}"#

private func read(
  _ provider: ProviderID, key: String, body: String, status: Int = 200
) async -> (Result<[PoolBalance], ProviderReadError>, ScriptedTransport) {
  let transport = ScriptedTransport([.respond(status: status, body: body)])
  do {
    switch provider {
    case .hlrlookup: return (.success(try await HLRLookup.read(key: key, transport: transport)), transport)
    case .icypeas: return (.success(try await Icypeas.read(key: key, transport: transport)), transport)
    default: return (.success(try await TheCompaniesAPI.read(key: key, transport: transport)), transport)
    }
  } catch {
    return (.failure(error as! ProviderReadError), transport)
  }
}

private func jsonBody(_ body: Data?) throws -> [String: String]? {
  try JSONSerialization.jsonObject(with: try #require(body)) as? [String: String]
}

@Suite struct SecondValueProvidersTests {
  @Test func hlrLookupPostsTheKeyAndSecretInTheJSONBody() async throws {
    let (result, transport) = await read(.hlrlookup, key: hlrSecret, body: hlrFixture)
    #expect(try result.get() == [PoolBalance(pool: HLRLookup.creditsPool, balance: 15000)])
    #expect(HLRLookup.creditsPool == Pool(creditType: "credits", label: "Credits", unit: .credits, cap: nil))
    let request = try #require(transport.requests.first)
    #expect(request.method == "POST")
    #expect(request.url.absoluteString == "https://api.hlrlookup.com/apiv2/balance")
    #expect(request.headers == ["Accept": "application/json", "Content-Type": "application/json"])
    #expect(try jsonBody(request.body) == ["api_key": "hlr-key", "api_secret": "hlr-secret"])
    // The web's first:second compatibility form.
    let (_, colon) = await read(.hlrlookup, key: "hlr-key:hlr-secret", body: hlrFixture)
    #expect(try jsonBody(colon.requests.first?.body) == ["api_key": "hlr-key", "api_secret": "hlr-secret"])
  }

  @Test func hlrLookupTrustsCreditsOnlyUnderAnOKStatus() async throws {
    #expect(try await read(.hlrlookup, key: hlrSecret, body: #"{"body":{"Status":"OK","Credits":0}}"#).0.get().first?.balance == 0)
    #expect(try await read(.hlrlookup, key: hlrSecret, body: #"{"body":{"Status":"OK","Credits":"1234.5"}}"#).0.get().first?.balance == 1234.5)
    for body in [
      #"{"body":{"Status":"ERROR","Credits":15000}}"#, #"{"body":{"Status":"OK"}}"#,
      #"{"body":{"Status":"OK","Credits":null}}"#, #"{"body":{"Status":"OK","Credits":"lots"}}"#,
      #"{"Status":"OK","Credits":15000}"#,
    ] {
      let error = await read(.hlrlookup, key: hlrSecret, body: body).0.error
      #expect(error == .missingField("body.Status") || error == .missingField("body.Credits"), "\(body)")
    }
  }

  @Test func icypeasSendsTheBareKeyAndTheAccountEmail() async throws {
    let (result, transport) = await read(.icypeas, key: icypeasSecret, body: icypeasFixture)
    #expect(try result.get() == [PoolBalance(pool: Icypeas.creditsPool, balance: 24)])
    let request = try #require(transport.requests.first)
    #expect(request.method == "POST")
    #expect(request.url.absoluteString == "https://app.icypeas.com/api/a/actions/subscription-information")
    #expect(request.headers == [
      "Accept": "application/json", "Content-Type": "application/json", "Authorization": "icy-key",
    ])
    #expect(try jsonBody(request.body) == ["email": "me@example.com"])
  }

  @Test func icypeasReadsSuccessFalseAsARejectedEmailNeverAZero() async throws {
    let rejected = await read(.icypeas, key: icypeasSecret, body: #"{"success":false,"validationErrors":[]}"#).0.error
    #expect(rejected == .reportedError("Icypeas did not accept this account email."))
    #expect(try await read(.icypeas, key: icypeasSecret, body: #"{"credits":0}"#).0.get().first?.balance == 0)
    #expect(await read(.icypeas, key: icypeasSecret, body: #"{"credits":"lots"}"#).0.error == .missingField("credits"))
    #expect(await read(.icypeas, key: icypeasSecret, body: #"{"status":"paid"}"#).0.error == .missingField("credits"))
  }

  @Test func theCompaniesAPIReadsTheTeamWithTheRawTokenAfterBasic() async throws {
    let (result, transport) = await read(.thecompaniesapi, key: companiesSecret, body: companiesFixture)
    #expect(try result.get() == [PoolBalance(pool: TheCompaniesAPI.creditsPool, balance: 500_000)])
    let request = try #require(transport.requests.first)
    #expect(request.method == "GET")
    #expect(request.url.absoluteString == "https://api.thecompaniesapi.com/v2/teams/42")
    #expect(request.headers == ["Accept": "application/json", "Authorization": "Basic tca-token"])
    #expect(request.body == nil)
    let (_, encoded) = await read(.thecompaniesapi, key: #"{"api_token":"t","team_id":"a/../b"}"#, body: companiesFixture)
    #expect(encoded.requests.first?.url.absoluteString == "https://api.thecompaniesapi.com/v2/teams/a%2F..%2Fb")
  }

  @Test func theCompaniesAPIPointsAtTheTeamIDOn403And404() async throws {
    for status in [403, 404] {
      let error = await read(.thecompaniesapi, key: companiesSecret, body: #"{"messages":"teamNotFound"}"#, status: status).0.error
      #expect(error == .reportedError("The Companies API has no team with this ID for this token."))
    }
    #expect(try await read(.thecompaniesapi, key: companiesSecret, body: #"{"credits":0}"#).0.get().first?.balance == 0)
    #expect(await read(.thecompaniesapi, key: companiesSecret, body: #"{"credits":null}"#).0.error == .missingField("credits"))
  }

  @Test func statusesMapLikeTheWeb() async {
    let secrets: [ProviderID: String] = [.hlrlookup: hlrSecret, .icypeas: icypeasSecret, .thecompaniesapi: companiesSecret]
    for (provider, key) in secrets {
      #expect(await read(provider, key: key, body: "{}", status: 401).0.error == .keyRejected)
      #expect(await read(provider, key: key, body: "{}", status: 429).0.error == .rateLimited)
      #expect(await read(provider, key: key, body: "{}", status: 500).0.error == .httpStatus(500))
      #expect(await read(provider, key: key, body: "not json").0.error == .notJSON)
    }
    #expect(await read(.hlrlookup, key: hlrSecret, body: "{}", status: 403).0.error == .keyRejected)
    #expect(await read(.icypeas, key: icypeasSecret, body: "{}", status: 403).0.error == .keyRejected)
    do {
      _ = try await Icypeas.read(key: icypeasSecret, transport: ScriptedTransport([.fail]))
      Issue.record("expected a failure")
    } catch {
      #expect(error as? ProviderReadError == .unreachable)
    }
  }

  @Test func aSecretMissingEitherValueIsNeverSent() async {
    let cases: [(ProviderID, String)] = [
      (.hlrlookup, #"{"api_key":"k"}"#), (.hlrlookup, #"{"api_key":"k","api_secret":"  "}"#),
      (.icypeas, #"{"api_key":"k"}"#), (.icypeas, "k"),
      (.thecompaniesapi, #"{"team_id":"42"}"#), (.thecompaniesapi, ":42"), (.thecompaniesapi, ""),
    ]
    for (provider, key) in cases {
      let (result, transport) = await read(provider, key: key, body: "{}")
      #expect(result.error == .keyRejected, "\(provider.rawValue) \(key)")
      #expect(transport.requests.isEmpty)
    }
  }

  @Test func theFormsMirrorTheWebCredentialFields() {
    #expect(ProviderID.hlrlookup.credentialFields.map(\.name) == ["api_key", "api_secret"])
    #expect(ProviderID.hlrlookup.credentialFields.map(\.label) == ["API key", "API secret"])
    #expect(ProviderID.hlrlookup.credentialFields.map(\.isSecret) == [false, true])
    #expect(ProviderID.icypeas.credentialFields.map(\.name) == ["api_key", "email"])
    #expect(ProviderID.icypeas.credentialFields.map(\.label) == ["API key", "Account email"])
    #expect(ProviderID.icypeas.credentialFields.map(\.isSecret) == [true, false])
    #expect(ProviderID.thecompaniesapi.credentialFields.map(\.name) == ["api_token", "team_id"])
    #expect(ProviderID.thecompaniesapi.credentialFields.map(\.label) == ["API token", "Team ID"])
    #expect(ProviderID.thecompaniesapi.credentialFields.map(\.isSecret) == [true, false])
    #expect(ProviderID.icypeas.credential(key: "", inputs: ["api_key": " k ", "email": "me@example.com"])
      == #"{"api_key":"k","email":"me@example.com"}"#)
  }
}

private extension Result where Success == [PoolBalance], Failure == ProviderReadError {
  var error: ProviderReadError? {
    if case let .failure(e) = self { return e }
    return nil
  }
}
