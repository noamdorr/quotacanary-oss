import Foundation
@testable import QuotaCanaryCore
import Testing

/// Ahrefs, Diffbot and NetNut (QUO-255): the Swift twins of the three web
/// adapters whose balance is computed after parsing one JSON response (a
/// lower-of-two-pairs pick, a billing-cycle sum, a sum across rows).
/// Fixtures are the web tests' examples.
private let ahrefsFixture = #"""
{"limits_and_usage":{"subscription":"Lite, billed monthly","usage_reset_date":"2026-06-27T00:00:00Z",
"units_limit_workspace":100000,"units_usage_workspace":30670,"units_limit_api_key":null,"units_usage_api_key":0,
"api_key_expiration_date":"2027-06-16T08:48:20Z"}}
"""#
private let diffbotFixture = #"""
{"planCredits":10000,"planStart":"2026-07-28","created":"2026-07-28","usage":[
{"date":"2026-07-28","subtitles":0,"nlp":1,"entities":5,"credits":136,"refresh":0,"proxies":0,"videos":0,"extractions":10,"facets":0},
{"date":"2026-07-29","credits":258},{"date":"2026-07-30","credits":6}],
"name":"REDACTED","plan":"kgfree","email":"person@example.com","token":"REDACTED","status":"active"}
"""#
/// The web test pins the clock at this instant.
private let webTestNow = ISO8601DateFormatter().date(from: "2026-07-30T12:00:00Z")!

private func read(
  _ provider: ProviderID, key: String = "the-key", now: Date = webTestNow, _ steps: [ScriptedTransport.Step]
) async -> (Result<[PoolBalance], ProviderReadError>, ScriptedTransport) {
  let transport = ScriptedTransport(steps)
  do {
    let balances: [PoolBalance]
    switch provider {
    case .ahrefs: balances = try await Ahrefs.read(key: key, transport: transport)
    case .diffbot: balances = try await Diffbot.read(key: key, transport: transport, now: { now })
    default: balances = try await NetNut.read(key: key, transport: transport)
    }
    return (.success(balances), transport)
  } catch {
    return (.failure(error as! ProviderReadError), transport)
  }
}

private func read(
  _ provider: ProviderID, key: String = "the-key", now: Date = webTestNow, body: String, status: Int = 200
) async -> (Result<[PoolBalance], ProviderReadError>, ScriptedTransport) {
  await read(provider, key: key, now: now, [.respond(status: status, body: body)])
}

private func capped(_ pool: Pool, _ cap: Double?) -> Pool {
  var pool = pool
  pool.cap = cap
  return pool
}

private let all: [ProviderID] = [.ahrefs, .diffbot, .netnut]

/// A body that parses but has nothing usable, and the field it names.
private let missing: [ProviderID: (body: String, field: String)] = [
  .ahrefs: (#"{"limits_and_usage":{"units_limit_workspace":null,"units_limit_api_key":""}}"#, "units_limit_workspace"),
  .diffbot: (#"{"planStart":"2026-07-28","usage":[]}"#, "planCredits"),
  .netnut: (#"{"data":[{"total_gb_used":3}]}"#, "plan_gb"),
]

@Suite struct ComputedBalanceTwinsTests {
  // MARK: Ahrefs

  @Test func ahrefsDerivesRemainingWorkspaceUnitsWithABearerHeader() async throws {
    let (result, transport) = await read(.ahrefs, key: "api-key", body: ahrefsFixture)
    #expect(try result.get() == [PoolBalance(pool: capped(Ahrefs.unitsPool, 100_000), balance: 69330)])
    #expect(Ahrefs.unitsPool == Pool(creditType: "units", label: "API Units", unit: .credits, cap: nil))
    let request = try #require(transport.requests.first)
    #expect(request.method == "GET")
    #expect(request.url.absoluteString == "https://api.ahrefs.com/v3/subscription-info/limits-and-usage")
    #expect(request.headers == ["Accept": "application/json", "Authorization": "Bearer api-key"])
  }

  @Test func ahrefsReportsThePairWithTheLowerRemainingAndItsLimit() async throws {
    let apiKeyTighter = #"""
    {"limits_and_usage":{"units_limit_workspace":100000,"units_usage_workspace":10000,
    "units_limit_api_key":50000,"units_usage_api_key":47000}}
    """#
    #expect(try await read(.ahrefs, body: apiKeyTighter).0.get()
      == [PoolBalance(pool: capped(Ahrefs.unitsPool, 50_000), balance: 3000)])
    let workspaceTighter = #"""
    {"limits_and_usage":{"units_limit_workspace":100000,"units_usage_workspace":98000,
    "units_limit_api_key":50000,"units_usage_api_key":1000}}
    """#
    #expect(try await read(.ahrefs, body: workspaceTighter).0.get()
      == [PoolBalance(pool: capped(Ahrefs.unitsPool, 100_000), balance: 2000)])
    // A tie keeps the workspace pair.
    let tie = #"""
    {"limits_and_usage":{"units_limit_workspace":100,"units_usage_workspace":50,
    "units_limit_api_key":80,"units_usage_api_key":30}}
    """#
    #expect(try await read(.ahrefs, body: tie).0.get() == [PoolBalance(pool: capped(Ahrefs.unitsPool, 100), balance: 50)])
  }

  @Test func ahrefsClampsAtZeroAndTreatsMissingUsageAsNothingUsed() async throws {
    let over = #"{"limits_and_usage":{"units_limit_workspace":1000,"units_usage_workspace":1500}}"#
    #expect(try await read(.ahrefs, body: over).0.get() == [PoolBalance(pool: capped(Ahrefs.unitsPool, 1000), balance: 0)])
    let noUsage = #"{"limits_and_usage":{"units_limit_api_key":"500"}}"#
    #expect(try await read(.ahrefs, body: noUsage).0.get() == [PoolBalance(pool: capped(Ahrefs.unitsPool, 500), balance: 500)])
    // A limit of 0 is a real zero balance with no cap.
    let zero = #"{"limits_and_usage":{"units_limit_workspace":0}}"#
    #expect(try await read(.ahrefs, body: zero).0.get() == [PoolBalance(pool: Ahrefs.unitsPool, balance: 0)])
  }

  @Test func ahrefsSurfacesATopLevelErrorOnA2xx() async {
    #expect(await read(.ahrefs, body: #"{"error":"Invalid output parameter."}"#).0.error
      == .reportedError("Invalid output parameter."))
    #expect(await read(.ahrefs, body: #"{"error":"Nope","limits_and_usage":{"units_limit_workspace":5}}"#).0.error
      == .reportedError("Nope"))
    #expect(await read(.ahrefs, body: #"{"other":1}"#).0.error == .missingField("limits_and_usage"))
  }

  // MARK: Diffbot

  @Test func diffbotReadsPlanCreditsMinusThisCyclesUsageWithTheTokenInTheQuery() async throws {
    let (result, transport) = await read(.diffbot, key: "db token", body: diffbotFixture)
    #expect(try result.get() == [PoolBalance(pool: capped(Diffbot.creditsPool, 10_000), balance: 10000 - 136 - 258 - 6)])
    #expect(Diffbot.creditsPool == Pool(creditType: "credits", label: "Monthly credits", unit: .credits, cap: nil))
    let request = try #require(transport.requests.first)
    #expect(request.method == "GET")
    #expect(request.url.absoluteString == "https://api.diffbot.com/v4/account?token=db%20token&days=31")
    #expect(request.headers.isEmpty)
  }

  @Test func diffbotIgnoresUsageFromBeforeTheCurrentCycle() async throws {
    let body = #"""
    {"planCredits":10000,"planStart":"2026-07-28","usage":[
    {"date":"2026-08-27","credits":5000},{"date":"2026-08-28","credits":100},{"date":"2026-09-01","credits":50}]}
    """#
    // 2026-09-02 12:00 UTC: the cycle started 2026-08-28, so the 08-27 day is out.
    let now = ISO8601DateFormatter().date(from: "2026-09-02T12:00:00Z")!
    #expect(try await read(.diffbot, now: now, body: body).0.get()
      == [PoolBalance(pool: capped(Diffbot.creditsPool, 10_000), balance: 9850)])
  }

  @Test func diffbotCycleStartMatchesTheWebCases() {
    #expect(Diffbot.cycleStart(planStart: "2026-01-10", today: "2026-07-30") == "2026-07-10")
    #expect(Diffbot.cycleStart(planStart: "2026-01-28", today: "2026-07-05") == "2026-06-28")
    // A day-31 start clamps to the month's last day.
    #expect(Diffbot.cycleStart(planStart: "2026-01-31", today: "2026-03-15") == "2026-02-28")
    #expect(Diffbot.cycleStart(planStart: "2026-01-31", today: "2026-04-30") == "2026-04-30")
    // Leap February.
    #expect(Diffbot.cycleStart(planStart: "2027-12-31", today: "2028-03-15") == "2028-02-29")
    // Across a year boundary.
    #expect(Diffbot.cycleStart(planStart: "2025-06-20", today: "2026-01-05") == "2025-12-20")
    // The first cycle starts on planStart.
    #expect(Diffbot.cycleStart(planStart: "2026-07-28", today: "2026-07-30") == "2026-07-28")
    #expect(Diffbot.cycleStart(planStart: "2026-07-30", today: "2026-07-30") == "2026-07-30")
    #expect(Diffbot.cycleStart(planStart: "July 28", today: "2026-07-30") == nil)
  }

  @Test func diffbotCycleBoundaryIsInclusiveAndUsesTheUTCDay() async throws {
    // 2026-07-30 23:30 in UTC-5 is already 2026-07-31 in UTC: the clock is read in UTC.
    let lateEvening = ISO8601DateFormatter().date(from: "2026-07-31T04:30:00Z")!
    #expect(Diffbot.utcDay(lateEvening) == "2026-07-31")
    #expect(Diffbot.utcDay(ISO8601DateFormatter().date(from: "2026-07-30T23:59:59Z")!) == "2026-07-30")
    let body = #"""
    {"planCredits":1000,"planStart":"2026-01-31","usage":[
    {"date":"2026-02-27","credits":400},{"date":"2026-02-28","credits":10},{"date":"2026-03-01","credits":5}]}
    """#
    // Cycle start 2026-02-28 (clamped): that day counts, the day before does not.
    let now = ISO8601DateFormatter().date(from: "2026-03-15T00:00:00Z")!
    #expect(try await read(.diffbot, now: now, body: body).0.get()
      == [PoolBalance(pool: capped(Diffbot.creditsPool, 1000), balance: 985)])
  }

  @Test func diffbotReadsAnEmptyUsageArrayAsNothingUsedAndSkipsBadRows() async throws {
    #expect(try await read(.diffbot, body: #"{"planCredits":10000,"planStart":"2026-07-28","usage":[]}"#).0.get()
      == [PoolBalance(pool: capped(Diffbot.creditsPool, 10_000), balance: 10000)])
    let rows = #"{"planCredits":"500","planStart":"2026-07-01","usage":[{"date":"2026-07-02","credits":null},{"credits":9},"x",{"date":"2026-07-03","credits":"20"}]}"#
    #expect(try await read(.diffbot, body: rows).0.get() == [PoolBalance(pool: capped(Diffbot.creditsPool, 500), balance: 480)])
  }

  @Test func diffbotNamesTheMissingField() async {
    #expect(await read(.diffbot, body: #"{"planStart":"2026-07-28","usage":[]}"#).0.error == .missingField("planCredits"))
    #expect(await read(.diffbot, body: #"{"planCredits":1,"usage":[]}"#).0.error == .missingField("planStart"))
    #expect(await read(.diffbot, body: #"{"planCredits":1,"planStart":"July 28","usage":[]}"#).0.error == .missingField("planStart"))
    #expect(await read(.diffbot, body: #"{"planCredits":1,"planStart":"2026-07-28"}"#).0.error == .missingField("usage"))
  }

  // MARK: NetNut

  @Test func netNutPostsAnEmptyObjectWithTheRawKeyAndSumsBandwidth() async throws {
    let (result, transport) = await read(.netnut, key: "nn-key", body: #"{"data":[{"plan_gb":100,"total_gb_used":30}]}"#)
    #expect(try result.get() == [PoolBalance(pool: capped(NetNut.bandwidthPool, 100), balance: 70)])
    #expect(NetNut.bandwidthPool == Pool(creditType: "bandwidth", label: "Bandwidth", unit: .gb, cap: nil))
    let request = try #require(transport.requests.first)
    #expect(request.method == "POST")
    #expect(request.url.absoluteString == "https://customers-api.netnut.io/v1/customer/usage/myusage")
    // No "Bearer": the raw key is the whole header value.
    #expect(request.headers == ["Authorization": "nn-key", "Content-Type": "application/json"])
    #expect(request.body.map { String(decoding: $0, as: UTF8.self) } == "{}")
  }

  @Test func netNutSumsPlanAndUsageAcrossRows() async throws {
    let body = #"{"data":[{"plan_gb":100,"total_gb_used":30},{"plan_gb":50,"total_gb_used":"5.5"},{"total_gb_used":4}]}"#
    #expect(try await read(.netnut, body: body).0.get()
      == [PoolBalance(pool: capped(NetNut.bandwidthPool, 150), balance: 150 - 39.5)])
  }

  @Test func netNutReadsAZeroPlanAsNoCap() async throws {
    #expect(try await read(.netnut, body: #"{"data":[{"plan_gb":0,"total_gb_used":2}]}"#).0.get()
      == [PoolBalance(pool: NetNut.bandwidthPool, balance: -2)])
    // A present plan_gb on any row anchors the pool even when used is absent.
    #expect(try await read(.netnut, body: #"{"data":[{"plan_gb":20}]}"#).0.get()
      == [PoolBalance(pool: capped(NetNut.bandwidthPool, 20), balance: 20)])
    #expect(await read(.netnut, body: #"{"data":[]}"#).0.error == .missingField("plan_gb"))
    #expect(await read(.netnut, body: #"{"other":1}"#).0.error == .missingField("plan_gb"))
  }

  // MARK: All three

  @Test func statusesAndBodiesMapTheSameWayForEveryTool() async {
    for provider in all {
      let id = provider.rawValue
      for status in [401, 403] {
        #expect(await read(provider, body: "{}", status: status).0.error == .keyRejected, "\(id) \(status)")
      }
      #expect(await read(provider, body: "{}", status: 429).0.error == .rateLimited, "\(id)")
      #expect(await read(provider, body: "{}", status: 500).0.error == .httpStatus(500), "\(id)")
      #expect(await read(provider, body: "{}", status: 404).0.error == .httpStatus(404), "\(id)")
      #expect(await read(provider, body: "<html>nope</html>").0.error == .notJSON, "\(id)")
      let (body, field) = missing[provider]!
      #expect(await read(provider, body: body).0.error == .missingField(field), "\(id)")
    }
  }

  @Test func anUnreachableVendorIsUnreachable() async {
    for provider in all {
      #expect(await read(provider, [.fail]).0.error == .unreachable, "\(provider.rawValue)")
    }
  }
}

private extension Result where Success == [PoolBalance], Failure == ProviderReadError {
  var error: ProviderReadError? {
    if case let .failure(e) = self { return e }
    return nil
  }
}
