import Foundation
@testable import QuotaCanaryCore
import Testing

/// Twilio, Plivo and Vonage (QUO-251): the Swift twins of the web's two-value
/// Basic auth adapters. Fixtures are the web tests' docs examples.
private let twilioFixture = #"{"account_sid":"ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","balance":"0.05","currency":"USD"}"#
private let plivoFixture =
  #"{"account_type":"standard","auth_id":"MA2025RK4E639VJFZAGV","billing_mode":"prepaid","cash_credits":"1.80900","resource_uri":"/v1/Account/MA2025RK4E639VJFZAGV/"}"#
private let vonageFixture = #"{"value":29.18202293,"autoReload":false}"#

private let twilioSecret = #"{"account_sid":"ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","auth_token":"twilio-auth-token"}"#

private func basic(_ user: String, _ password: String) -> String {
  "Basic " + Data("\(user):\(password)".utf8).base64EncodedString()
}

private func read(
  _ provider: ProviderID, key: String, body: String, status: Int = 200
) async -> (Result<[PoolBalance], ProviderReadError>, ScriptedTransport) {
  let transport = ScriptedTransport([.respond(status: status, body: body)])
  do {
    switch provider {
    case .twilio: return (.success(try await Twilio.read(key: key, transport: transport)), transport)
    case .plivo: return (.success(try await Plivo.read(key: key, transport: transport)), transport)
    default: return (.success(try await Vonage.read(key: key, transport: transport)), transport)
    }
  } catch {
    return (.failure(error as! ProviderReadError), transport)
  }
}

@Suite struct TwoValueBasicAuthTests {
  @Test func twilioReadsTheBalanceWithTheAccountSIDInThePathAndBasicAuth() async throws {
    let (result, transport) = await read(.twilio, key: twilioSecret, body: twilioFixture)
    #expect(try result.get() == [PoolBalance(pool: Twilio.balancePool, balance: 0.05)])
    #expect(Twilio.balancePool == Pool(creditType: "balance", label: "Balance (USD)", unit: .usd, cap: nil))
    let request = try #require(transport.requests.first)
    #expect(request.method == "GET")
    #expect(request.url.absoluteString
      == "https://api.twilio.com/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Balance.json")
    #expect(request.headers == [
      "Accept": "application/json",
      "Authorization": basic("ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "twilio-auth-token"),
    ])
  }

  @Test func twilioPercentEncodesTheSIDAndChecksTheCurrency() async throws {
    let (_, transport) = await read(.twilio, key: #"{"account_sid":"AC/../x","auth_token":"t"}"#, body: twilioFixture)
    #expect(transport.requests.first?.url.absoluteString
      == "https://api.twilio.com/2010-04-01/Accounts/AC%2F..%2Fx/Balance.json")
    // A non-USD balance would be mislabeled, so it reads as unexpected.
    #expect(await read(.twilio, key: twilioSecret, body: #"{"balance":"3.10","currency":"EUR"}"#).0.error
      == .missingField("currency"))
    #expect(try await read(.twilio, key: twilioSecret, body: #"{"balance":"3.10"}"#).0.get().first?.balance == 3.1)
    // A subaccount carries no balance: unexpected, never a false zero.
    #expect(await read(.twilio, key: twilioSecret, body: #"{"currency":"USD"}"#).0.error == .missingField("balance"))
  }

  @Test func plivoReadsCashCreditsWithTheAuthIDInThePath() async throws {
    let secret = #"{"auth_id":"MA2025RK4E639VJFZAGV","auth_token":"plivo-auth-token"}"#
    let (result, transport) = await read(.plivo, key: secret, body: plivoFixture)
    #expect(try result.get() == [PoolBalance(pool: Plivo.balancePool, balance: 1.809)])
    #expect(transport.requests.first?.url.absoluteString == "https://api.plivo.com/v1/Account/MA2025RK4E639VJFZAGV/")
    #expect(transport.requests.first?.headers["Authorization"] == basic("MA2025RK4E639VJFZAGV", "plivo-auth-token"))
    #expect(await read(.plivo, key: secret, body: #"{"cash_credits":"n/a"}"#).0.error == .missingField("cash_credits"))
  }

  @Test func vonageReadsTheEuroBalance() async throws {
    let secret = #"{"api_key":"abcd1234","api_secret":"vonage-api-secret"}"#
    let (result, transport) = await read(.vonage, key: secret, body: vonageFixture)
    #expect(try result.get() == [PoolBalance(pool: Vonage.balancePool, balance: 29.18202293)])
    #expect(Vonage.balancePool == Pool(creditType: "balance", label: "Balance (EUR)", unit: .eur, cap: nil))
    #expect(transport.requests.first?.url.absoluteString == "https://rest.nexmo.com/account/get-balance")
    #expect(transport.requests.first?.headers["Authorization"] == basic("abcd1234", "vonage-api-secret"))
    #expect(try await read(.vonage, key: secret, body: #"{"value":0}"#).0.get().first?.balance == 0)
    #expect(await read(.vonage, key: secret, body: #"{"value":"lots"}"#).0.error == .missingField("value"))
  }

  @Test func statusesMapLikeEveryOtherProvider() async {
    for provider in [ProviderID.twilio, .plivo, .vonage] {
      let key = #"{"account_sid":"a","auth_token":"b","auth_id":"a","api_key":"a","api_secret":"b"}"#
      #expect(await read(provider, key: key, body: "{}", status: 401).0.error == .keyRejected)
      #expect(await read(provider, key: key, body: "{}", status: 403).0.error == .keyRejected)
      #expect(await read(provider, key: key, body: "{}", status: 429).0.error == .rateLimited)
      #expect(await read(provider, key: key, body: "{}", status: 500).0.error == .httpStatus(500))
      #expect(await read(provider, key: key, body: "not json").0.error == .notJSON)
    }
    do {
      _ = try await Twilio.read(key: twilioSecret, transport: ScriptedTransport([.fail]))
      Issue.record("expected a failure")
    } catch {
      #expect(error as? ProviderReadError == .unreachable)
    }
  }

  @Test func aSecretMissingEitherValueIsNeverSent() async {
    for key in [#"{"account_sid":"AC1"}"#, #"{"account_sid":"AC1","auth_token":"  "}"#, "AC1", ":token", ""] {
      let (result, transport) = await read(.twilio, key: key, body: twilioFixture)
      #expect(result.error == .keyRejected)
      #expect(transport.requests.isEmpty)
    }
  }

  @Test func credentialPairReadsJSONOrTheColonFormLikeTheWeb() {
    #expect(CredentialFields.pair(twilioSecret, "account_sid", "auth_token")! == ("ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "twilio-auth-token"))
    #expect(CredentialFields.pair(" AC1 : tok ", "account_sid", "auth_token")! == ("AC1", "tok"))
    #expect(CredentialFields.pair(#"{"auth_id":"x"}"#, "auth_id", "auth_token") == nil)
    #expect(CredentialFields.pair("[1,2]", "auth_id", "auth_token") == nil)
  }

  @Test func theFormSerializesTheSameJSONShapeTheWebStores() throws {
    #expect(ProviderID.twilio.credentialFields.map(\.name) == ["account_sid", "auth_token"])
    #expect(ProviderID.twilio.credentialFields.map(\.isSecret) == [false, true])
    #expect(ProviderID.plivo.credentialFields.map(\.label) == ["Auth ID", "Auth token"])
    #expect(ProviderID.vonage.credentialFields.map(\.label) == ["API key", "API secret"])
    #expect(ProviderID.hunter.credentialFields.isEmpty && ProviderID.brevo.credentialFields.isEmpty)

    let secret = ProviderID.twilio.credential(key: "", inputs: ["account_sid": " AC1 ", "auth_token": "tok/1"])
    let object = try JSONSerialization.jsonObject(with: Data(secret.utf8)) as? [String: String]
    #expect(object == ["account_sid": "AC1", "auth_token": "tok/1"])
    #expect(secret == #"{"account_sid":"AC1","auth_token":"tok/1"}"#)
    // A blank field sends nothing: the service reports a missing key.
    #expect(ProviderID.twilio.credential(key: "", inputs: ["account_sid": "AC1"]) == "")
    // Single-key providers keep the bare key.
    #expect(ProviderID.hunter.credential(key: "hunter-key", inputs: ["account_sid": "x"]) == "hunter-key")
  }

  @MainActor @Test func connectingTwilioStoresOneKeychainSecretAndShowsTheReading() async throws {
    let credentials = InMemoryCredentialStore()
    let store = InMemoryConnectionStore()
    let twilio = ScriptedTransport([.respond(status: 200, body: twilioFixture)])
    let service = MonitoringService(
      credentials: credentials, store: store,
      transport: RoutedTransport(["api.twilio.com": twilio]),
      now: { t0 }, makeID: { "conn-1" }
    )
    let key = ProviderID.twilio.credential(
      key: "", inputs: ["account_sid": "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "auth_token": "twilio-auth-token"]
    )
    let connection = try await service.connect(provider: .twilio, key: key)
    #expect(connection.name == "Twilio")
    #expect(connection.poolRows.map(\.pool.label) == ["Balance (USD)"])
    #expect(connection.poolRows.map(\.balance) == [0.05])
    #expect(connection.poolRows.map(\.status) == [.critical]) // defaults low 15 / critical 5
    #expect(twilio.requests.first?.headers["Authorization"] == basic("ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "twilio-auth-token"))
    #expect(credentials.items.values.first == key)
    let persisted = store.bytes.map { String(decoding: $0, as: UTF8.self) } ?? ""
    #expect(!persisted.contains("twilio-auth-token"))

    await #expect(throws: MonitorError.missingKey) {
      try await service.connect(provider: .twilio, key: ProviderID.twilio.credential(key: "", inputs: [:]))
    }
  }
}

private extension Result where Success == [PoolBalance], Failure == ProviderReadError {
  var error: ProviderReadError? {
    if case let .failure(e) = self { return e }
    return nil
  }
}
