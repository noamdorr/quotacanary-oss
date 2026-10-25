import Foundation
@testable import QuotaCanaryCore
import Testing

/// The Swift interpreter for catalog entries, case for case with
/// src/lib/adapters/catalog.test.ts: request shapes, the error vocabulary,
/// status overrides, body-level errors and the pool arithmetic.
private let bearerEntry = CatalogEntry(
  id: "acme", name: "Acme",
  request: .init(method: .get, url: "https://api.acme.test/v1/account"),
  auth: .init(in: .header, name: "Authorization", format: "Bearer {key}"),
  pools: [.init(creditType: "credits", label: "Credits", unit: .credits, balance: "data.credits_left")]
)

private func entry(
  request: CatalogEntry.Request? = nil, auth: CatalogEntry.Auth? = nil, errors: [String: CatalogEntry.ErrorKind]? = nil,
  errorPath: String? = nil, rejectWhen: CatalogEntry.RejectWhen? = nil, bodyError: CatalogEntry.BodyError? = nil,
  pools: [CatalogEntry.PoolSpec]? = nil
) -> CatalogEntry {
  var e = bearerEntry
  if let request { e.request = request }
  if let auth { e.auth = auth }
  e.errors = errors
  e.errorPath = errorPath
  e.rejectWhen = rejectWhen
  e.bodyError = bodyError
  if let pools { e.pools = pools }
  return e
}

private func read(
  _ entry: CatalogEntry, _ body: String, status: Int = 200, key: String = "key"
) async -> Result<[PoolBalance], ProviderReadError> {
  do {
    let transport = ScriptedTransport([.respond(status: status, body: body)])
    return .success(try await CatalogProvider.read(entry, key: key, transport: transport))
  } catch {
    return .failure(error as! ProviderReadError)
  }
}

@Suite struct CatalogProviderTests {
  @Test func sendsTheKeyInTheConfiguredHeaderAndReadsTheBalancePath() async throws {
    let transport = ScriptedTransport([.respond(status: 200, body: #"{"data":{"credits_left":420}}"#)])
    let balances = try await CatalogProvider.read(bearerEntry, key: "key", transport: transport)
    #expect(balances == [PoolBalance(pool: Pool(creditType: "credits", label: "Credits", unit: .credits, cap: nil), balance: 420)])
    let request = try #require(transport.requests.first)
    #expect(request.url.absoluteString == "https://api.acme.test/v1/account")
    #expect(request.method == "GET")
    #expect(request.headers == ["Authorization": "Bearer key"])
    #expect(request.body == nil)
  }

  // MARK: Error vocabulary

  @Test func transportFailureIsUnreachable() async {
    do {
      _ = try await CatalogProvider.read(bearerEntry, key: "key", transport: ScriptedTransport([.fail]))
      Issue.record("expected a failure")
    } catch {
      #expect(error as? ProviderReadError == .unreachable)
    }
  }

  @Test func maps401ToARejectedKeyAndAnyOtherFailureToTheStatus() async {
    #expect(await read(bearerEntry, "{}", status: 401).error == .keyRejected)
    #expect(await read(bearerEntry, "{}", status: 403).error == .httpStatus(403))
    #expect(await read(bearerEntry, "{}", status: 500).error == .httpStatus(500))
    // Every Mac adapter reads 429 as throttling, not a bad key (QUO-133).
    #expect(await read(bearerEntry, "{}", status: 429).error == .rateLimited)
  }

  @Test func statusOverridesLetAnEntryTreat403AsRejectedAnd401AsPlainHTTP() async {
    let e = entry(errors: ["403": .invalidKey, "401": .http])
    #expect(await read(e, "{}", status: 403).error == .keyRejected)
    #expect(await read(e, "{}", status: 401).error == .httpStatus(401))
    // An explicit 429 override wins over the Mac's throttling default.
    #expect(await read(entry(errors: ["429": .http]), "{}", status: 429).error == .httpStatus(429))
  }

  // MARK: Body handling

  @Test func nonJSONBodyIsAnUnexpectedResponse() async {
    #expect(await read(bearerEntry, "<html>").error == .notJSON)
  }

  @Test func absentNullOrNonNumericBalanceIsUnexpectedNeverAFalseZero() async throws {
    for body in ["{}", #"{"data":{"credits_left":null}}"#, #"{"data":"x"}"#, "[]", #"{"data":{"credits_left":true}}"#] {
      #expect(await read(bearerEntry, body).error == .missingField("data.credits_left"), "\(body)")
    }
    let zero = try await read(bearerEntry, #"{"data":{"credits_left":"0"}}"#).get()
    #expect(zero.first?.balance == 0)
  }

  @Test func indexesAnArrayWithANumericSegmentAtTheRootOrNested() async throws {
    let root = entry(pools: [.init(creditType: "c", label: "C", unit: .credits, balance: "0")])
    #expect(try await read(root, "[95597755]").get().first?.balance == 95_597_755)
    #expect(await read(root, "[]").error == .missingField("0"))
    #expect(try await read(root, #"{"0":5}"#).get().first?.balance == 5)
    let nested = entry(pools: [.init(creditType: "c", label: "C", unit: .credits, balance: "data.0.left")])
    #expect(try await read(nested, #"{"data":[{"left":12}]}"#).get().first?.balance == 12)
    #expect(await read(nested, #"{"data":{"left":12}}"#).error == .missingField("data.0.left"))
  }

  @Test func dropsPoolsWhoseBalanceIsMissingAndKeepsTheRest() async throws {
    let e = entry(pools: [
      .init(creditType: "a", label: "A", unit: .credits, balance: "a"),
      .init(creditType: "b", label: "B", unit: .credits, balance: "b"),
    ])
    let balances = try await read(e, #"{"b":7}"#).get()
    #expect(balances == [PoolBalance(pool: Pool(creditType: "b", label: "B", unit: .credits, cap: nil), balance: 7)])
  }

  // MARK: Request shapes

  @Test func putsAQueryKeyOnTheURLPercentEncodedWithNoHeaders() async throws {
    let transport = ScriptedTransport([.respond(status: 200, body: #"{"data":{"credits_left":1}}"#)])
    let e = entry(request: .init(method: .get, url: "https://api.acme.test/v1/balance/"), auth: .init(in: .query, name: "api_key"))
    _ = try await CatalogProvider.read(e, key: "key with spaces&more", transport: transport)
    #expect(transport.requests.first?.url.absoluteString == "https://api.acme.test/v1/balance/?api_key=key%20with%20spaces%26more")
    #expect(transport.requests.first?.headers == [:])
    // A URL that already has a query string gets & instead of ?.
    let second = ScriptedTransport([.respond(status: 200, body: #"{"data":{"credits_left":1}}"#)])
    let withQuery = entry(request: .init(method: .get, url: "https://api.acme.test/v1/balance?format=json"), auth: .init(in: .query, name: "api_key"))
    _ = try await CatalogProvider.read(withQuery, key: "k", transport: second)
    #expect(second.requests.first?.url.absoluteString == "https://api.acme.test/v1/balance?format=json&api_key=k")
  }

  @Test func substitutesAPathKeyIntoTheURLTemplate() async throws {
    let transport = ScriptedTransport([.respond(status: 200, body: #"{"data":{"credits_left":1}}"#)])
    let e = entry(request: .init(method: .get, url: "https://api.acme.test/quota/{key}"), auth: .init(in: .path))
    _ = try await CatalogProvider.read(e, key: "a/b", transport: transport)
    #expect(transport.requests.first?.url.absoluteString == "https://api.acme.test/quota/a%2Fb")
  }

  @Test func sendsStaticHeadersBesideTheAuthHeaderAndAPOSTBodyVerbatim() async throws {
    let transport = ScriptedTransport([.respond(status: 200, body: #"{"data":{"credits_left":1}}"#)])
    let e = entry(
      request: .init(
        method: .post, url: "https://api.acme.test/v1/enrich", headers: ["Content-Type": "application/json"], body: #"{"data":[{}]}"#
      ),
      auth: .init(in: .header, name: "X-Access-Token")
    )
    _ = try await CatalogProvider.read(e, key: "key", transport: transport)
    let request = try #require(transport.requests.first)
    #expect(request.method == "POST")
    #expect(request.headers == ["X-Access-Token": "key", "Content-Type": "application/json"])
    #expect(request.body == Data(#"{"data":[{}]}"#.utf8))
  }

  // MARK: Pool arithmetic

  private func pool(_ spec: CatalogEntry.PoolSpec) -> CatalogEntry { entry(pools: [spec]) }

  @Test func reportsAnOptionalLimitOnlyWhenItIsAFiniteNumberAboveZero() async throws {
    let e = pool(.init(creditType: "c", label: "C", unit: .credits, balance: "left", limit: "cap"))
    let capped = try await read(e, #"{"left":5,"cap":100}"#).get()
    #expect(capped.first?.balance == 5)
    #expect(capped.first?.pool.cap == 100)
    for cap in ["0", "-1", "null", #""x""#] {
      let reading = try await read(e, #"{"left":5,"cap":"# + cap + "}").get()
      #expect(reading.first?.balance == 5)
      #expect(reading.first?.pool.cap == nil, "\(cap)")
    }
    #expect(try await read(e, #"{"left":5}"#).get().first?.pool.cap == nil)
  }

  @Test func derivesBalanceAsLimitMinusUsedKeepingAZeroLimitAndDefaultingUsedToZero() async throws {
    let e = pool(.init(creditType: "c", label: "C", unit: .credits, limit: "cap", used: "spent"))
    let a = try await read(e, #"{"cap":1000,"spent":480}"#).get().first
    #expect(a?.balance == 520 && a?.pool.cap == 1000)
    // A reported limit of 0 is a known allowance the plan lacks: cap 0 (unavailable).
    let b = try await read(e, #"{"cap":0,"spent":0}"#).get().first
    #expect(b?.balance == 0 && b?.pool.cap == 0)
    let c = try await read(e, #"{"cap":10}"#).get().first
    #expect(c?.balance == 10 && c?.pool.cap == 10)
    #expect(await read(e, #"{"spent":3}"#).error == .missingField("cap"))
  }

  @Test func derivesLimitAsBalancePlusUsedWhenBothAreGiven() async throws {
    let e = pool(.init(creditType: "c", label: "C", unit: .credits, balance: "remaining", used: "spent"))
    let a = try await read(e, #"{"remaining":800,"spent":200}"#).get().first
    #expect(a?.balance == 800 && a?.pool.cap == 1000)
    let b = try await read(e, #"{"remaining":800}"#).get().first
    #expect(b?.balance == 800 && b?.pool.cap == nil)
    // Mac-only: a derived total of 0 would read as "not in plan" here (cap 0
    // is unavailable), so an exhausted account keeps an empty, capless pool.
    let c = try await read(e, #"{"remaining":0,"spent":0}"#).get().first
    #expect(c?.balance == 0 && c?.pool.cap == nil)
  }

  // MARK: Body-level errors

  @Test func aNonEmptyVendorErrorStringInA2xxBodyIsAReportedError() async throws {
    let e = entry(errorPath: "error")
    #expect(await read(e, #"{"error":"Invalid API key","data":{"credits_left":9}}"#).error == .reportedError("Invalid API key"))
    #expect(try await read(e, #"{"error":"","data":{"credits_left":9}}"#).get().first?.balance == 9)
    #expect(try await read(e, #"{"error":null,"data":{"credits_left":9}}"#).get().first?.balance == 9)
    #expect(try await read(e, #"{"error":false,"data":{"credits_left":9}}"#).get().first?.balance == 9)
  }

  // MARK: bodyError (the web's "catalogAdapter bodyError" block, QUO-196)

  @Test func bodyErrorFailsWithTheFirstNonEmptyMessageWhenTheFlagEqualsTheBoolean() async throws {
    let e = entry(bodyError: .init(when: .equals(path: "success", false), messagePaths: ["error", "message"]))
    #expect(await read(e, #"{"success":false,"error":"","message":"Invalid API key"}"#).error == .reportedError("Invalid API key"))
    #expect(try await read(e, #"{"success":true,"message":"ignored","data":{"credits_left":3}}"#).get().first?.balance == 3)
    #expect(try await read(e, #"{"data":{"credits_left":3}}"#).get().first?.balance == 3)
  }

  @Test func bodyErrorFallsBackToTheGenericErrorOrARejectedKeyWithoutAMessage() async {
    let generic = entry(bodyError: .init(when: .equals(path: "success", false), messagePaths: ["message"]))
    #expect(await read(generic, #"{"success":false}"#).error == .reportedError(nil))
    let rejected = entry(
      bodyError: .init(when: .notEquals(path: "status", "success"), messagePaths: ["message"], fallback: .invalidKey)
    )
    #expect(await read(rejected, #"{"status":"auth_failure"}"#).error == .keyRejected)
  }

  @Test func bodyErrorTreatsAMissingValueAsNotEqualAndAnyTruthyValueAsFired() async throws {
    let notEquals = entry(bodyError: .init(when: .notEquals(path: "status", "success"), messagePaths: ["message"]))
    #expect(await read(notEquals, #"{"message":"no status at all","data":{"credits_left":3}}"#).error == .reportedError("no status at all"))
    #expect(try await read(notEquals, #"{"status":"success","data":{"credits_left":3}}"#).get().first?.balance == 3)

    let truthy = entry(bodyError: .init(when: .truthy(path: "error"), messagePaths: ["errorMessage"]))
    #expect(await read(truthy, #"{"error":true,"errorMessage":"Out of credits"}"#).error == .reportedError("Out of credits"))
    #expect(await read(truthy, #"{"error":"yes"}"#).error == .reportedError(nil))
    #expect(await read(truthy, #"{"error":1}"#).error == .reportedError(nil))
    #expect(await read(truthy, #"{"error":{}}"#).error == .reportedError(nil))
    for falsy in [#"false"#, #"0"#, #""""#, #"null"#] {
      #expect(try await read(truthy, #"{"error":\#(falsy),"data":{"credits_left":3}}"#).get().first?.balance == 3)
    }
  }

  @Test func bodyErrorWithoutWhenFiresOnlyOnANonEmptyStringInTheChain() async throws {
    let e = entry(bodyError: .init(messagePaths: ["error", "error.message", "message"]))
    #expect(await read(e, #"{"error":{"message":"API access requires a Pro plan."}}"#).error == .reportedError("API access requires a Pro plan."))
    #expect(try await read(e, #"{"error":{"code":7},"data":{"credits_left":3}}"#).get().first?.balance == 3)
    #expect(try await read(e, #"{"message":"","data":{"credits_left":3}}"#).get().first?.balance == 3)
  }

  @Test func bodyErrorReadsAFailingStatusOnlyForNon2xxOrAnyAfterTheStatusOverrides() async throws {
    let body = #"{"message":"Agent API Billing is not enabled."}"#
    let billing = ProviderReadError.reportedError("Agent API Billing is not enabled.")
    let non2xx = entry(bodyError: .init(messagePaths: ["message"], on: .non2xx))
    #expect(await read(non2xx, body, status: 400).error == billing)
    #expect(await read(non2xx, "{}", status: 400).error == .httpStatus(400))
    #expect(await read(non2xx, "<html>", status: 502).error == .httpStatus(502))
    #expect(await read(non2xx, body, status: 401).error == .keyRejected)
    #expect(try await read(non2xx, #"{"message":"not read on 2xx","data":{"credits_left":3}}"#).get().first?.balance == 3)
    // An explicit http override reads the body too, as the web's "http" kind does.
    var overridden = non2xx
    overridden.errors = ["401": .http]
    #expect(await read(overridden, body, status: 401).error == billing)

    let twoXX = entry(bodyError: .init(messagePaths: ["message"]))
    #expect(await read(twoXX, body, status: 400).error == .httpStatus(400))

    let any = entry(bodyError: .init(messagePaths: ["message"], on: .any))
    #expect(await read(any, body, status: 402).error == billing)
    #expect(await read(any, body).error == billing)
  }

  @Test func aFlagRuleOnAFailingStatusWithANonJSONBodyFiresLikeTheWebsUndefined() async {
    // The web reads an unparseable failing body as undefined: a missing value is "not equal".
    let e = entry(
      bodyError: .init(when: .notEquals(path: "status", "success"), messagePaths: ["message"], fallback: .invalidKey, on: .non2xx)
    )
    #expect(await read(e, "<html>", status: 500).error == .keyRejected)
  }

  @Test func bodyErrorIsCheckedBeforeErrorPath() async {
    let e = entry(errorPath: "error", bodyError: .init(messagePaths: ["message"]))
    #expect(await read(e, #"{"error":"second","message":"first"}"#).error == .reportedError("first"))
  }

  // MARK: Vendor text on the row (QUO-193 decision 5b: parity with the web)

  @Test func theRowShowsTheVendorStringAndFallsBackToTheGenericCopy() {
    let id = ProviderID("neverbounce")
    let vendor = MonitorError.provider(id, .reportedError("VENDOR-SENTINEL: key revoked"))
    #expect(vendor.message == "VENDOR-SENTINEL: key revoked")
    #expect(vendor.checkFailureMessage == "VENDOR-SENTINEL: key revoked")
    let generic = MonitorError.provider(.tavily, .reportedError(nil))
    #expect(generic.message == Copy.reportedError("Tavily"))
    #expect(generic.checkFailureMessage == Copy.checkReportedError("Tavily"))
  }

  @Test func aFlagAtRejectWhenPathEqualToRejectWhenEqualsIsARejectedKey() async throws {
    let e = entry(rejectWhen: .init(path: "request_info.success", equals: false))
    #expect(await read(e, #"{"request_info":{"success":false}}"#).error == .keyRejected)
    #expect(try await read(e, #"{"request_info":{"success":true},"data":{"credits_left":2}}"#).get().first?.balance == 2)
    #expect(try await read(e, #"{"data":{"credits_left":2}}"#).get().first?.balance == 2)
    // Only a boolean matches: 0 is not false.
    #expect(try await read(e, #"{"request_info":{"success":0},"data":{"credits_left":2}}"#).get().first?.balance == 2)
  }
}

private extension Result where Success == [PoolBalance], Failure == ProviderReadError {
  var error: ProviderReadError? {
    if case let .failure(e) = self { return e }
    return nil
  }
}
