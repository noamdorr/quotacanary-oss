import Foundation
@testable import QuotaCanaryCore
import Testing

/// DataForSEO, Tomba, Snov.io, Verifalia, PredictLeads and Crawlbase
/// (QUO-253): the Swift twins of the remaining two-value web adapters.
/// Fixtures are the web tests' docs examples.
private let dataForSEOFixture = #"{"status_code":20000,"tasks":[{"status_code":20000,"result":[{"money":{"total":100,"balance":42.5}}]}]}"#
private let tombaFixture = #"""
{"data":{"requests":{"domains":{"available":420,"used":80},"verifications":{"available":900,"used":100},"phones":{"available":45,"used":5},"b2b":{"available":250,"used":50}}}}
"""#
private let snovTokenFixture = #"{"access_token":"access-token","token_type":"Bearer","expires_in":3600}"#
private let snovBalanceFixture = #"{"success":true,"data":{"balance":"25000.00"}}"#
private let verifaliaFixture = #"{"creditPacks":9633.516,"freeCredits":28.962,"freeCreditsResetIn":"14:29:15"}"#
private let predictLeadsFixture = #"""
{"data":[{"id":"ea20b0c1-3427-4004-91e6-59a27be0c9ed","type":"api_subscription","attributes":{"status":"active","monthly_credits_quota":100,"monthly_credits_used":42}}],"included":[],"meta":{"schema_version":"3.0"}}
"""#
private let crawlbaseFixture = #"{"totalSuccess":1200,"totalFailed":50,"totalDue":12,"remainingCredits":"8800"}"#

private let secrets: [ProviderID: String] = [
  .dataforseo: #"{"login":"api-login","password":"api-password"}"#,
  .tomba: #"{"key":"ta_key","secret":"ts_secret"}"#,
  .snov: #"{"clientId":"client-id","clientSecret":"client-secret"}"#,
  .verifalia: #"{"username":"api-user","password":"api-password"}"#,
  .predictleads: #"{"apiKey":"pl_key","apiToken":"pl_token"}"#,
  .crawlbase: #"{"token":"crawlbase-token","product":"crawling-api"}"#,
]

private func basic(_ user: String, _ password: String) -> String {
  "Basic " + Data("\(user):\(password)".utf8).base64EncodedString()
}

private func read(
  _ provider: ProviderID, key: String? = nil, _ steps: [ScriptedTransport.Step]
) async -> (Result<[PoolBalance], ProviderReadError>, ScriptedTransport) {
  let transport = ScriptedTransport(steps)
  let key = key ?? secrets[provider]!
  do {
    let balances: [PoolBalance]
    switch provider {
    case .dataforseo: balances = try await DataForSEO.read(key: key, transport: transport)
    case .tomba: balances = try await Tomba.read(key: key, transport: transport)
    case .snov: balances = try await Snov.read(key: key, transport: transport)
    case .verifalia: balances = try await Verifalia.read(key: key, transport: transport)
    case .predictleads: balances = try await PredictLeads.read(key: key, transport: transport)
    default: balances = try await Crawlbase.read(key: key, transport: transport)
    }
    return (.success(balances), transport)
  } catch {
    return (.failure(error as! ProviderReadError), transport)
  }
}

private func read(
  _ provider: ProviderID, key: String? = nil, body: String, status: Int = 200
) async -> (Result<[PoolBalance], ProviderReadError>, ScriptedTransport) {
  await read(provider, key: key, [.respond(status: status, body: body)])
}

@Suite struct TwoValueTwinsTests {
  @Test func dataForSEOReadsTheUSDBalanceWithBasicAuth() async throws {
    let (result, transport) = await read(.dataforseo, body: dataForSEOFixture)
    #expect(try result.get() == [PoolBalance(pool: DataForSEO.balancePool, balance: 42.5)])
    #expect(DataForSEO.balancePool == Pool(creditType: "balance", label: "Account Balance", unit: .usd, cap: nil))
    let request = try #require(transport.requests.first)
    #expect(request.method == "GET")
    #expect(request.url.absoluteString == "https://api.dataforseo.com/v3/appendix/user_data")
    #expect(request.headers == ["Authorization": basic("api-login", "api-password")])
    // The web also accepts the older login:password form.
    let (_, colon) = await read(.dataforseo, key: "api-login:api-password", body: dataForSEOFixture)
    #expect(colon.requests.first?.headers["Authorization"] == basic("api-login", "api-password"))
  }

  @Test func dataForSEOSurfacesItsOwnErrorCodes() async {
    let topLevel = #"{"status_code":40100,"status_message":"You are not authorized."}"#
    #expect(await read(.dataforseo, body: topLevel).0.error == .reportedError("You are not authorized."))
    let task = #"{"status_code":20000,"tasks":[{"status_code":40200,"status_message":"Payment required."}]}"#
    #expect(await read(.dataforseo, body: task).0.error == .reportedError("Payment required."))
    #expect(await read(.dataforseo, body: #"{"status_code":20000,"tasks":[]}"#).0.error
      == .missingField("tasks.result.money.balance"))
  }

  @Test func tombaReadsFourCappedPoolsWithKeyAndSecretHeaders() async throws {
    let (result, transport) = await read(.tomba, body: tombaFixture)
    func capped(_ pool: Pool, _ cap: Double) -> Pool {
      var pool = pool
      pool.cap = cap
      return pool
    }
    #expect(try result.get() == [
      PoolBalance(pool: capped(Tomba.searchesPool, 500), balance: 420),
      PoolBalance(pool: capped(Tomba.verificationsPool, 1000), balance: 900),
      PoolBalance(pool: capped(Tomba.phonesPool, 50), balance: 45),
      PoolBalance(pool: capped(Tomba.b2bPool, 300), balance: 250),
    ])
    #expect(Tomba.pools.map(\.label) == ["Searches", "Verifications", "Phones", "B2B"])
    #expect(transport.requests.first?.url.absoluteString == "https://api.tomba.io/v1/me")
    #expect(transport.requests.first?.headers == ["X-Tomba-Key": "ta_key", "X-Tomba-Secret": "ts_secret"])
  }

  @Test func tombaOmitsUnreportedPoolsAndKeepsAZeroTotalCapless() async throws {
    let partial = #"{"data":{"requests":{"domains":{"available":0,"used":0},"phones":{"available":"12"}}}}"#
    let balances = try await read(.tomba, body: partial).0.get()
    #expect(balances == [PoolBalance(pool: Tomba.searchesPool, balance: 0), PoolBalance(pool: Tomba.phonesPool, balance: 12)])
    #expect(await read(.tomba, body: #"{"data":{"requests":{}}}"#).0.error == .missingField("data.requests"))
  }

  @Test func snovExchangesClientCredentialsThenReadsTheBalance() async throws {
    let (result, transport) = await read(
      .snov, [.respond(status: 200, body: snovTokenFixture), .respond(status: 200, body: snovBalanceFixture)]
    )
    #expect(try result.get() == [PoolBalance(pool: Snov.creditsPool, balance: 25000)])
    #expect(transport.requests.count == 2)
    let token = transport.requests[0]
    #expect(token.method == "POST")
    #expect(token.url.absoluteString == "https://api.snov.io/v1/oauth/access_token")
    #expect(token.headers == ["Content-Type": "application/x-www-form-urlencoded"])
    #expect(token.body.map { String(decoding: $0, as: UTF8.self) }
      == "grant_type=client_credentials&client_id=client-id&client_secret=client-secret")
    let balance = transport.requests[1]
    #expect(balance.method == "GET")
    #expect(balance.url.absoluteString == "https://api.snov.io/v1/get-balance")
    #expect(balance.headers == ["Authorization": "Bearer access-token"])
  }

  @Test func snovFormEncodesLikeURLSearchParamsAndStopsOnABadToken() async {
    let body = Snov.tokenBody(clientID: "a b&c", clientSecret: "x+y=z/~")
    #expect(String(decoding: body, as: UTF8.self)
      == "grant_type=client_credentials&client_id=a+b%26c&client_secret=x%2By%3Dz%2F%7E")
    // A rejected exchange never reaches the balance call.
    let (rejected, transport) = await read(.snov, [.respond(status: 401, body: "{}")])
    #expect(rejected.error == .keyRejected)
    #expect(transport.requests.count == 1)
    #expect(await read(.snov, [.respond(status: 200, body: #"{"token_type":"Bearer"}"#)]).0.error
      == .missingField("access_token"))
    let refused = #"{"success":false,"message":"Not enough credits"}"#
    #expect(await read(.snov, [.respond(status: 200, body: snovTokenFixture), .respond(status: 200, body: refused)]).0.error
      == .reportedError("Not enough credits"))
    #expect(await read(.snov, [.respond(status: 200, body: snovTokenFixture), .fail]).0.error == .unreachable)
  }

  @Test func verifaliaReadsCreditPacksAndFreeDailyCredits() async throws {
    let (result, transport) = await read(.verifalia, body: verifaliaFixture)
    #expect(try result.get() == [
      PoolBalance(pool: Verifalia.creditPacksPool, balance: 9633.516),
      PoolBalance(pool: Verifalia.freeDailyPool, balance: 28.962),
    ])
    #expect(transport.requests.first?.url.absoluteString == "https://api.verifalia.com/v2.7/credits/balance")
    #expect(transport.requests.first?.headers == [
      "Accept": "application/json", "Authorization": basic("api-user", "api-password"),
    ])
    // Plans without free daily credits report credit packs alone.
    #expect(try await read(.verifalia, body: #"{"creditPacks":1500}"#).0.get()
      == [PoolBalance(pool: Verifalia.creditPacksPool, balance: 1500)])
    #expect(await read(.verifalia, body: #"{"message":"Quota exceeded"}"#).0.error == .reportedError("Quota exceeded"))
    #expect(await read(.verifalia, body: #"{"freeCredits":3}"#).0.error == .missingField("creditPacks"))
  }

  @Test func predictLeadsReadsQuotaMinusUsedWithBothHeaders() async throws {
    let (result, transport) = await read(.predictleads, body: predictLeadsFixture)
    var capped = PredictLeads.creditsPool
    capped.cap = 100
    #expect(try result.get() == [PoolBalance(pool: capped, balance: 58)])
    #expect(PredictLeads.creditsPool.label == "Monthly credits")
    #expect(transport.requests.first?.url.absoluteString == "https://predictleads.com/api/v3/api_subscription")
    #expect(transport.requests.first?.headers == ["X-Api-Key": "pl_key", "X-Api-Token": "pl_token"])
    // A missing `used` reads as nothing used; a missing quota is unexpected.
    let unused = #"{"data":[{"attributes":{"monthly_credits_quota":"250"}}]}"#
    #expect(try await read(.predictleads, body: unused).0.get().first?.balance == 250)
    #expect(await read(.predictleads, body: #"{"data":[]}"#).0.error
      == .missingField("data.attributes.monthly_credits_quota"))
  }

  @Test func crawlbaseReadsRemainingCreditsForTheChosenProduct() async throws {
    let (result, transport) = await read(.crawlbase, body: crawlbaseFixture)
    var labeled = Crawlbase.creditsPool
    labeled.label = "Crawling API Credits"
    #expect(try result.get() == [PoolBalance(pool: labeled, balance: 8800)])
    #expect(transport.requests.first?.method == "GET")
    #expect(transport.requests.first?.url.absoluteString
      == "https://api.crawlbase.com/account?token=crawlbase-token&product=crawling-api")
    #expect(transport.requests.first?.headers == [:])
    #expect(await read(.crawlbase, body: #"{"totalSuccess":1}"#).0.error == .missingField("remainingCredits"))
  }

  @Test func crawlbaseEscapesTheTokenAndNeverSendsAnUnknownProduct() async {
    let (_, escaped) = await read(.crawlbase, key: #"{"token":"a&b=c","product":"leads-api"}"#, body: crawlbaseFixture)
    #expect(escaped.requests.first?.url.absoluteString == "https://api.crawlbase.com/account?token=a%26b%3Dc&product=leads-api")
    let (result, transport) = await read(.crawlbase, key: #"{"token":"t","product":"proxycurl"}"#, body: crawlbaseFixture)
    #expect(result.error == .keyRejected)
    #expect(transport.requests.isEmpty)
  }

  @Test func statusesMapLikeEveryOtherProvider() async {
    for provider in [ProviderID.dataforseo, .tomba, .snov, .verifalia, .predictleads, .crawlbase] {
      #expect(await read(provider, body: "{}", status: 401).0.error == .keyRejected)
      #expect(await read(provider, body: "{}", status: 403).0.error == .keyRejected)
      #expect(await read(provider, body: "{}", status: 429).0.error == .rateLimited)
      #expect(await read(provider, body: "{}", status: 500).0.error == .httpStatus(500))
      #expect(await read(provider, body: "not json").0.error == .notJSON)
      #expect(await read(provider, [.fail]).0.error == .unreachable)
    }
  }

  @Test func aSecretMissingEitherValueIsNeverSent() async {
    for provider in [ProviderID.dataforseo, .tomba, .snov, .verifalia, .predictleads, .crawlbase] {
      let first = provider.credentialFields[0].name
      for key in [#"{"\#(first)":"only-one"}"#, #"{"\#(first)":"a","x":"  "}"#, "", "{}"] {
        let (result, transport) = await read(provider, key: key, body: "{}")
        #expect(result.error == .keyRejected)
        #expect(transport.requests.isEmpty)
      }
    }
  }

  @Test func credentialFieldsMirrorTheSeedRows() {
    func shape(_ id: ProviderID) -> [String] {
      id.credentialFields.map { "\($0.name)|\($0.label)|\($0.isSecret ? "password" : "text")" }
    }
    #expect(shape(.dataforseo) == ["login|API login|text", "password|API password|password"])
    #expect(shape(.tomba) == ["key|API key|text", "secret|API secret|password"])
    #expect(shape(.snov) == ["clientId|API User ID|text", "clientSecret|API Secret|password"])
    #expect(shape(.verifalia) == ["username|API username|text", "password|API password|password"])
    #expect(shape(.predictleads) == ["apiKey|API key|password", "apiToken|API token|password"])
    #expect(shape(.crawlbase) == ["token|Token|password", "product|Product slug|text"])
    // The connect form stores the same JSON shape the web encrypts.
    #expect(ProviderID.snov.credential(key: "", inputs: ["clientId": " id ", "clientSecret": "s"])
      == #"{"clientId":"id","clientSecret":"s"}"#)
  }

  @Test func everyTwinHasAnHTTPSTopUp() {
    for provider in [ProviderID.dataforseo, .tomba, .snov, .verifalia, .predictleads, .crawlbase] {
      #expect(provider.topupURL?.scheme == "https")
    }
  }

  @MainActor @Test func connectingSnovStoresOneKeychainSecretAndShowsTheReading() async throws {
    let credentials = InMemoryCredentialStore()
    let store = InMemoryConnectionStore()
    let snov = ScriptedTransport([.respond(status: 200, body: snovTokenFixture), .respond(status: 200, body: snovBalanceFixture)])
    let service = MonitoringService(
      credentials: credentials, store: store,
      transport: RoutedTransport(["api.snov.io": snov]),
      now: { t0 }, makeID: { "conn-1" }
    )
    let key = ProviderID.snov.credential(key: "", inputs: ["clientId": "client-id", "clientSecret": "client-secret"])
    let connection = try await service.connect(provider: .snov, key: key)
    #expect(connection.name == "Snov.io")
    #expect(connection.poolRows.map(\.pool.label) == ["Credits"])
    #expect(connection.poolRows.map(\.balance) == [25000])
    #expect(connection.poolRows.map(\.status) == [.healthy]) // defaults low 1500 / critical 500
    #expect(credentials.items.values.first == key)
    let persisted = store.bytes.map { String(decoding: $0, as: UTF8.self) } ?? ""
    #expect(!persisted.contains("client-secret"))
  }
}

private extension Result where Success == [PoolBalance], Failure == ProviderReadError {
  var error: ProviderReadError? {
    if case let .failure(e) = self { return e }
    return nil
  }
}
