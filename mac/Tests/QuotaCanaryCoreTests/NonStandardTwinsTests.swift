import Foundation
@testable import QuotaCanaryCore
import Testing

/// RocketReach, Enrich CRM, Majestic, Mangools and Semrush (QUO-258): the
/// Swift twins of the five web adapters whose transport or response shape the
/// catalog cannot express (a per-row pool list, field sniffing, a key in a
/// POST body, two chained calls, a plain-text body). Fixtures are the web
/// tests' examples.
private let rocketReachFixture = #"""
{"id":1,"state":"registered","credit_usage":[
{"credit_type":"standard_lookup","allocated":5,"used":0,"remaining":5},
{"credit_type":"premium_lookup","allocated":0,"used":0,"remaining":0},
{"credit_type":"phone_lookup","allocated":0,"used":0,"remaining":0},
{"credit_type":"person_enrich","allocated":0,"used":0,"remaining":0},
{"credit_type":"person_export","allocated":0,"used":0,"remaining":0},
{"credit_type":"company_export","allocated":0,"used":0,"remaining":0}]}
"""#
private let majesticFixture = #"""
{"Code":"OK","ErrorMessage":"","FullError":"","IndexBuildDate":"2017-09-04 13:42:54","SubscriptionIsActive":1,
"TotalAnalysisResUnits":97094051,"TotalDetailedReportsPerPeriodRemaining":1010,"TotalIndexItemInfoResUnits":504986,
"TotalRetrievalResUnits":19462890,"DataTables":{"Subscriptions":{"Headers":{},"Data":[]}}}
"""#
private let mangoolsFixture = #"""
{"resources":{"related-keywords":{"limit":500,"remaining":497,"reset":7796},"serps":{"limit":500,"remaining":496,"reset":7769},
"links":{"limit":100000,"remaining":99500,"reset":572091},"trends":{"limit":500,"remaining":499,"reset":8300}},
"reqs-per-short-period":3,"upgraded_account":true,"highestPlan":"premium","platformPlan":"mangools"}
"""#
private let mangoolsBadTokenLimits = #"""
{"resources":{"related-keywords":{"limit":0,"remaining":0},"serps":{"limit":0,"remaining":0},"links":{"limit":0,"remaining":0},
"share-of-search":{"limit":3,"remaining":0,"reset":null}},"upgraded_account":false,"highestPlan":"free","platformPlan":"mangools"}
"""#

private let all: [ProviderID] = [.rocketreach, .enrichcrm, .majestic, .mangools, .semrush]

private func read(
  _ provider: ProviderID, key: String = "the-key", _ steps: [ScriptedTransport.Step]
) async -> (Result<[PoolBalance], ProviderReadError>, ScriptedTransport) {
  let transport = ScriptedTransport(steps)
  do {
    let balances: [PoolBalance]
    switch provider {
    case .rocketreach: balances = try await RocketReach.read(key: key, transport: transport)
    case .enrichcrm: balances = try await EnrichCRM.read(key: key, transport: transport)
    case .majestic: balances = try await Majestic.read(key: key, transport: transport)
    case .mangools: balances = try await Mangools.read(key: key, transport: transport)
    default: balances = try await Semrush.read(key: key, transport: transport)
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
  .rocketreach: (#"{"credit_usage":[]}"#, "credit_usage"),
  .enrichcrm: (#"{"code":0,"message":"ok"}"#, "credits"),
  .majestic: (#"{"Code":"OK","ErrorMessage":""}"#, "TotalAnalysisResUnits"),
  .mangools: (#"{"trackings":1}"#, "resources"),
  .semrush: ("not a number", "units"),
]

@Suite struct NonStandardTwinsTests {
  // MARK: RocketReach

  @Test func rocketReachReadsEveryCreditTypeWithAnApiKeyHeader() async throws {
    let (result, transport) = await read(.rocketreach, body: rocketReachFixture)
    let balances = try result.get()
    #expect(balances.count == 6)
    #expect(balances.first == PoolBalance(pool: capped(RocketReach.standardLookupPool, 5), balance: 5))
    // Unallocated, nothing left: "not in plan" (cap 0), never an empty-pool alert.
    #expect(balances.dropFirst().allSatisfy { $0.pool.cap == 0 && $0.balance == 0 })
    #expect(balances.map(\.pool.creditType) == RocketReach.pools.map(\.creditType))
    #expect(RocketReach.pools.map(\.label) == [
      "Standard Lookup", "Premium Lookup", "Phone Lookup", "Person Enrich", "Person Export", "Company Export",
    ])
    #expect(PoolStatus.of(balances[1], settings: ProviderID.rocketreach.defaultSettings) == .unavailable)
    let request = try #require(transport.requests.first)
    #expect(request.method == "GET")
    #expect(request.url.absoluteString == "https://api.rocketreach.co/api/v2/account/")
    #expect(request.headers == ["Api-Key": "the-key"])
  }

  @Test func rocketReachCapsEachAllocatedPool() async throws {
    let body = #"""
    {"credit_usage":[{"credit_type":"standard_lookup","allocated":1000,"used":200,"remaining":800},
    {"credit_type":"phone_lookup","allocated":50,"used":0,"remaining":50},
    {"credit_type":"person_export","allocated":0,"used":0,"remaining":0}]}
    """#
    #expect(try await read(.rocketreach, body: body).0.get() == [
      PoolBalance(pool: capped(RocketReach.standardLookupPool, 1000), balance: 800),
      PoolBalance(pool: capped(RocketReach.phoneLookupPool, 50), balance: 50),
      PoolBalance(pool: capped(RocketReach.personExportPool, 0), balance: 0),
    ])
  }

  @Test func rocketReachKeepsUnallocatedCreditsAndDropsUnknownRows() async throws {
    let body = #"""
    {"credit_usage":[{"credit_type":"premium_lookup","allocated":0,"remaining":12},
    {"credit_type":"universal_credit","allocated":100,"remaining":90},{"allocated":5,"remaining":5}]}
    """#
    #expect(try await read(.rocketreach, body: body).0.get() == [PoolBalance(pool: RocketReach.premiumLookupPool, balance: 12)])
    let unknownOnly = #"{"credit_usage":[{"credit_type":"universal_credit","allocated":100,"remaining":90}]}"#
    #expect(await read(.rocketreach, body: unknownOnly).0.error == .missingField("credit_usage"))
    #expect(await read(.rocketreach, body: #"{"id":1}"#).0.error == .missingField("credit_usage"))
  }

  // MARK: Enrich CRM

  @Test func enrichCRMReadsCreditsWithTheKeyInTheQuery() async throws {
    let (result, transport) = await read(.enrichcrm, key: "api-key", body: #"{"credits":1234}"#)
    #expect(try result.get() == [PoolBalance(pool: EnrichCRM.creditsPool, balance: 1234)])
    #expect(EnrichCRM.creditsPool == Pool(creditType: "credits", label: "Credits", unit: .credits, cap: nil))
    let request = try #require(transport.requests.first)
    #expect(request.method == "GET")
    #expect(request.url.absoluteString == "https://gateway.enrich-crm.com/api/credit_crm/v1/mine?apiId=api-key")
    #expect(request.headers == ["Accept": "application/json"])
  }

  @Test func enrichCRMSniffsTheBalanceFieldAndRecursesIntoDataAndResult() async throws {
    let cases: [(String, Double)] = [
      (#"{"data":{"remainingCredits":"456"}}"#, 456),
      (#"{"remaining_credits":1}"#, 1), (#"{"credit":2}"#, 2), (#"{"remaining":3}"#, 3), (#"{"balance":4}"#, 4),
      (#"{"creditBalance":5}"#, 5), (#"{"credit_balance":6}"#, 6),
      (#"{"result":{"data":{"credit_balance":7}}}"#, 7),
      // First field in the web's order wins.
      (#"{"balance":9,"remainingCredits":8}"#, 8),
      (#"{"code":0,"success":true,"data":{"credits":0}}"#, 0),
    ]
    for (body, balance) in cases {
      #expect(try await read(.enrichcrm, body: body).0.get().first?.balance == balance, "\(body)")
    }
  }

  @Test func enrichCRMReadsTheVendorErrorEvenOnANon2xx() async {
    let creditFailure = #"{"code":13,"message":"can't get credit","details":[]}"#
    #expect(await read(.enrichcrm, body: creditFailure, status: 500).0.error
      == .reportedError("Enrich CRM couldn't read credits for this key."))
    #expect(await read(.enrichcrm, body: #"{"code":5,"message":"Quota service down"}"#, status: 503).0.error
      == .reportedError("Quota service down"))
    #expect(await read(.enrichcrm, body: #"{"code":5}"#).0.error == .reportedError("Enrich CRM returned an error."))
    #expect(await read(.enrichcrm, body: #"{"success":false,"credits":3}"#).0.error
      == .reportedError("Enrich CRM returned an error."))
    #expect(await read(.enrichcrm, body: #"{"success":false,"message":"Nope"}"#, status: 401).0.error == .reportedError("Nope"))
    #expect(MonitorError.provider(.enrichcrm, .reportedError(Copy.enrichCRMCreditsUnreadable)).message
      == "Enrich CRM couldn't read credits for this key.")
  }

  // MARK: Majestic

  @Test func majesticPostsTheKeyInAFormBodyAndReadsThreeTotals() async throws {
    let (result, transport) = await read(.majestic, key: "mj key", body: majesticFixture)
    #expect(try result.get() == [
      PoolBalance(pool: Majestic.analysisPool, balance: 97_094_051),
      PoolBalance(pool: Majestic.retrievalPool, balance: 19_462_890),
      PoolBalance(pool: Majestic.indexItemInfoPool, balance: 504_986),
    ])
    #expect(Majestic.pools.map(\.label) == ["Analysis units", "Retrieval units", "Index item info units"])
    #expect(Majestic.pools.map(\.creditType) == ["analysis_units", "retrieval_units", "index_item_info_units"])
    let request = try #require(transport.requests.first)
    #expect(request.method == "POST")
    #expect(request.url.absoluteString == "https://api.majestic.com/api/json")
    #expect(request.headers == ["Content-Type": "application/x-www-form-urlencoded"])
    #expect(request.body.map { String(decoding: $0, as: UTF8.self) } == "app_api_key=mj+key&cmd=GetSubscriptionInfo")
  }

  @Test func majesticKeepsThePoolsThatArePresentAndAZero() async throws {
    #expect(try await read(.majestic, body: #"{"Code":"OK","TotalAnalysisResUnits":0}"#).0.get()
      == [PoolBalance(pool: Majestic.analysisPool, balance: 0)])
    #expect(await read(.majestic, body: #"{"TotalAnalysisResUnits":10}"#).0.error == .missingField("Code"))
  }

  @Test func majesticMapsItsCodeAndNeverEchoesTheKey() async {
    let key = "mj_SECRET_key_123"
    let echo = "API Key does not appear to be correct: API_KEY - '\(key)'"
    let bodies: [(String, ProviderReadError)] = [
      (#"{"Code":"FailedRequestViaAPI","ErrorMessage":"\#(echo)","FullError":"\#(echo)"}"#, .keyRejected),
      (#"{"Code":"AuthenticationFailed","ErrorMessage":"\#(echo)"}"#, .keyRejected),
      (#"{"Code":"AuthenticationRequired","ErrorMessage":""}"#, .keyRejected),
      (#"{"Code":"FailedAuth","ErrorMessage":"\#(echo)"}"#, .keyRejected),
      (#"{"Code":"NoSubscription","ErrorMessage":"\#(echo)"}"#, .reportedError("Majestic returned NoSubscription.")),
      (#"{"Code":"FailedRequestViaAPI","ErrorMessage":"Something else broke for \#(key)"}"#,
       .reportedError("Majestic returned FailedRequestViaAPI.")),
      // A code that is not a plain word is not named (it could carry anything).
      (#"{"Code":"\#(key)","ErrorMessage":"\#(echo)"}"#, .reportedError(nil)),
      (#"{"Code":"Bad code: \#(key)","ErrorMessage":"\#(echo)"}"#, .reportedError(nil)),
    ]
    for (body, expected) in bodies {
      let error = await read(.majestic, key: key, body: body).0.error
      #expect(error == expected, "\(body)")
      let shown = error.map { MonitorError.provider(.majestic, $0).message } ?? ""
      #expect(!"\(String(describing: error))".contains(key) && !shown.contains(key), "\(body)")
    }
  }

  // MARK: Mangools

  @Test func mangoolsChecksTheKeyThenReadsThreeCappedPools() async throws {
    let (result, transport) = await read(.mangools, key: "mangools-token", [
      .respond(status: 200, body: "[]"), .respond(status: 200, body: mangoolsFixture),
    ])
    #expect(try result.get() == [
      PoolBalance(pool: capped(Mangools.keywordLookupsPool, 500), balance: 497),
      PoolBalance(pool: capped(Mangools.serpLookupsPool, 500), balance: 496),
      PoolBalance(pool: capped(Mangools.backlinkRowsPool, 100_000), balance: 99500),
    ])
    #expect(Mangools.pools.map(\.label) == ["Keyword lookups", "SERP lookups", "Backlink rows"])
    #expect(transport.requests.map(\.method) == ["GET", "GET"])
    #expect(transport.requests.map(\.url.absoluteString) == [
      "https://api.mangools.com/v3/kwfinder/requests", "https://api.mangools.com/v3/kwfinder/limits",
    ])
    #expect(transport.requests.allSatisfy { $0.headers == ["X-Access-Token": "mangools-token"] })
  }

  @Test func mangoolsRejectsABadTokenOnTheFirstCallAndNeverReadsLimits() async {
    for status in [401, 403] {
      let (result, transport) = await read(.mangools, [
        .respond(status: status, body: #"{"error":{"type":"AuthError","message":"Invalid API Key"}}"#),
        .respond(status: 200, body: mangoolsBadTokenLimits),
      ])
      #expect(result.error == .keyRejected)
      #expect(transport.requests.count == 1)
    }
    let (result, transport) = await read(.mangools, [.respond(status: 429, body: "{}"), .respond(status: 200, body: mangoolsFixture)])
    #expect(result.error == .rateLimited)
    #expect(transport.requests.count == 1)
  }

  @Test func mangoolsNeverReadsTheBadTokenZerosAsARealBalance() async {
    #expect(await read(.mangools, [.respond(status: 200, body: "[]"), .respond(status: 200, body: mangoolsBadTokenLimits)]).0.error
      == .missingField("resources"))
  }

  @Test func mangoolsKeepsASpentPoolAndMarksAZeroLimitNotInPlan() async throws {
    let body = #"{"resources":{"related-keywords":{"limit":100,"remaining":0},"serps":{"limit":0,"remaining":0}}}"#
    #expect(try await read(.mangools, [.respond(status: 200, body: "[]"), .respond(status: 200, body: body)]).0.get() == [
      PoolBalance(pool: capped(Mangools.keywordLookupsPool, 100), balance: 0),
      PoolBalance(pool: capped(Mangools.serpLookupsPool, 0), balance: 0),
    ])
    #expect(await read(.mangools, [.respond(status: 200, body: "[]"), .respond(status: 429, body: "{}")]).0.error == .rateLimited)
  }

  // MARK: Semrush

  @Test func semrushReadsThePlainTextUnitCount() async throws {
    let (result, transport) = await read(.semrush, key: "semrush-key", body: "1,250\n")
    #expect(try result.get() == [PoolBalance(pool: Semrush.unitsPool, balance: 1250)])
    #expect(Semrush.unitsPool == Pool(creditType: "units", label: "API Units", unit: .credits, cap: nil))
    let request = try #require(transport.requests.first)
    #expect(request.method == "GET")
    #expect(request.url.absoluteString == "https://www.semrush.com/users/countapiunits.html?key=semrush-key")
    #expect(request.headers == ["Accept": "text/csv, text/plain;q=0.9, application/json;q=0.8"])
    let (_, odd) = await read(.semrush, key: "key with spaces", body: "42")
    #expect(odd.requests.first?.url.absoluteString == "https://www.semrush.com/users/countapiunits.html?key=key%20with%20spaces")
    #expect(try await read(.semrush, body: "\n\r\n  9,999,000 \r\nextra\n").0.get().first?.balance == 9_999_000)
    #expect(try await read(.semrush, body: "0").0.get().first?.balance == 0)
  }

  @Test func semrushTreatsATextBodyThatIsNotANumberAsMissing() async {
    for body in ["not a number", "", "\n\n", #"{"units":5}"#, "<html>nope</html>"] {
      #expect(await read(.semrush, body: body).0.error == .missingField("units"), "\(body)")
    }
    let invalid = #"{"errors":[{"field":"key","message":"invalid api key: nope"}]}"#
    #expect(await read(.semrush, body: invalid, status: 400).0.error == .keyRejected)
  }

  // MARK: All five

  @Test func authFailuresAreKeyRejected() async {
    for provider in all {
      for status in [401, 403] {
        #expect(await read(provider, body: "{}", status: status).0.error == .keyRejected, "\(provider.rawValue) \(status)")
      }
    }
    #expect(MonitorError.provider(.rocketreach, .keyRejected).message == "RocketReach rejected this key.")
  }

  @Test func rateLimitAndOtherStatusesAreTold() async {
    for provider in all {
      #expect(await read(provider, body: "{}", status: 429).0.error == .rateLimited, "\(provider.rawValue)")
      #expect(await read(provider, body: "{}", status: 500).0.error == .httpStatus(500), "\(provider.rawValue)")
      #expect(await read(provider, body: "{}", status: 404).0.error == .httpStatus(404), "\(provider.rawValue)")
    }
    // Enrich CRM reads the body first; a non-JSON error page still reports its status.
    #expect(await read(.enrichcrm, body: "<html>bad gateway</html>", status: 502).0.error == .httpStatus(502))
  }

  @Test func aBodyThatIsNotJSONOrLacksTheFieldIsAnUnexpectedResponse() async {
    for provider in all where provider != .semrush {
      #expect(await read(provider, body: "<html>nope</html>").0.error == .notJSON, "\(provider.rawValue)")
    }
    for provider in all {
      let (body, field) = missing[provider]!
      #expect(await read(provider, body: body).0.error == .missingField(field), "\(provider.rawValue)")
    }
    #expect(MonitorError.provider(.semrush, .missingField("units")).message == "Semrush returned an unexpected response.")
  }

  @Test func aTransportFailureIsUnreachable() async {
    for provider in all {
      #expect(await read(provider, [.fail]).0.error == .unreachable, "\(provider.rawValue)")
    }
    #expect(await read(.mangools, [.respond(status: 200, body: "[]"), .fail]).0.error == .unreachable)
  }

  @Test func theTopUpLinkIsTheSeedRowVerbatim() {
    #expect(ProviderID.semrush.topupURL?.absoluteString == "https://www.semrush.com/billing-admin/profile/subscription/api-units")
  }
}

private extension Result where Success == [PoolBalance], Failure == ProviderReadError {
  var error: ProviderReadError? {
    if case let .failure(e) = self { return e }
    return nil
  }
}
