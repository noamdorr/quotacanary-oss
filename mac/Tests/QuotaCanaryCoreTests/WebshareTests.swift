import Foundation
@testable import QuotaCanaryCore
import Testing

/// From src/lib/adapters/webshare.test.ts: the docs examples for the
/// subscription, plan and aggregate stats objects (apidocs.webshare.io,
/// fetched 2026-10-17), trimmed. bandwidth_limit is GB (0 = unlimited),
/// bandwidth_total is bytes, free_credits is USD.
private let now = ISO8601DateFormatter().date(from: "2026-10-17T12:00:00Z")!
private let subscriptionBody = #"{"id":1,"plan":2,"free_credits":13.37,"term":"monthly","start_date":"2026-10-01T09:30:00.123456-07:00","end_date":"2026-10-31T09:30:00.123456-07:00","throttled":false}"#
private let noCreditsBody = #"{"id":1,"plan":2,"free_credits":0,"start_date":"2026-10-01T09:30:00.123456-07:00"}"#
private let planBody = #"{"id":2,"status":"active","bandwidth_limit":50.0,"proxy_type":"shared","proxy_count":1000}"#
private let unlimitedPlanBody = #"{"id":2,"status":"active","bandwidth_limit":0,"proxy_type":"shared","proxy_count":1000}"#
private let aggregateBody = #"{"bandwidth_projected":100000,"bandwidth_total":12500000000,"bandwidth_average":1000,"requests_total":5}"#
private let subscriptionURL = "https://proxy.webshare.io/api/v2/subscription/"
private let planURL = "https://proxy.webshare.io/api/v2/subscription/plan/2/"
private func aggregateURL(_ gte: String) -> String {
  "https://proxy.webshare.io/api/v2/stats/aggregate/?timestamp__gte=\(gte)&timestamp__lte=2026-10-17T12:00:00.000Z"
}

private func traffic(_ balance: Double, cap: Double) -> PoolBalance {
  var pool = Webshare.trafficPool
  pool.cap = cap
  return PoolBalance(pool: pool, balance: balance)
}
private func credits(_ balance: Double) -> PoolBalance { PoolBalance(pool: Webshare.freeCreditsPool, balance: balance) }

private func read(_ steps: [ScriptedTransport.Step]) async -> Result<[PoolBalance], ProviderReadError> {
  do {
    return .success(try await Webshare.read(key: "ws-key", transport: ScriptedTransport(steps), now: now))
  } catch {
    return .failure(error as! ProviderReadError)
  }
}

@Suite struct WebshareTests {
  @Test func readsSubscriptionPlanThenPeriodUsage() async throws {
    let transport = ScriptedTransport([
      .respond(status: 200, body: subscriptionBody),
      .respond(status: 200, body: planBody),
      .respond(status: 200, body: aggregateBody),
    ])
    let balances = try await Webshare.read(key: "ws-key", transport: transport, now: now)
    #expect(balances == [traffic(37.5, cap: 50), credits(13.37)])
    #expect(transport.requests.map(\.url.absoluteString) == [subscriptionURL, planURL, aggregateURL("2026-10-01T16:30:00.123Z")])
    #expect(transport.requests.allSatisfy { $0.method == "GET" })
    #expect(transport.requests.allSatisfy { $0.headers == ["Authorization": "Token ws-key", "Accept": "application/json"] })
  }

  @Test func aCappedPlanWithoutFreeCreditsReportsTrafficOnly() async throws {
    let result = await read([
      .respond(status: 200, body: noCreditsBody), .respond(status: 200, body: planBody),
      .respond(status: 200, body: aggregateBody),
    ])
    #expect(try result.get() == [traffic(37.5, cap: 50)])
  }

  @Test func anUnlimitedPlanReportsCreditsOnlyAndSkipsTheAggregate() async throws {
    let transport = ScriptedTransport([
      .respond(status: 200, body: subscriptionBody), .respond(status: 200, body: unlimitedPlanBody),
    ])
    let balances = try await Webshare.read(key: "ws-key", transport: transport, now: now)
    #expect(balances == [credits(13.37)])
    #expect(transport.requests.count == 2)
  }

  @Test func anUnlimitedPlanWithoutCreditsHasNothingToWatch() async {
    let error = await read([.respond(status: 200, body: noCreditsBody), .respond(status: 200, body: unlimitedPlanBody)]).error
    #expect(error == .reportedError("Webshare has no capped traffic or credits to watch."))
    #expect(MonitorError.provider(.webshare, error!).message == "Webshare has no capped traffic or credits to watch.")
  }

  @Test func usageOverTheCapFloorsAtZero() async throws {
    let result = await read([
      .respond(status: 200, body: subscriptionBody), .respond(status: 200, body: planBody),
      .respond(status: 200, body: #"{"bandwidth_total":51000000000}"#),
    ])
    #expect(try result.get() == [traffic(0, cap: 50), credits(13.37)])
  }

  @Test func aPeriodStartOlderThan90DaysIsClamped() async throws {
    let transport = ScriptedTransport([
      .respond(status: 200, body: #"{"plan":2,"free_credits":0,"start_date":"2026-06-01T00:00:00Z"}"#),
      .respond(status: 200, body: planBody), .respond(status: 200, body: aggregateBody),
    ])
    _ = try await Webshare.read(key: "ws-key", transport: transport, now: now)
    #expect(transport.requests.last?.url.absoluteString == aggregateURL("2026-07-19T12:00:00.000Z"))
  }

  @Test func statusesMapToTheSharedErrors() async {
    // 401 body observed with a dummy key on 2026-10-17.
    #expect(await read([.respond(status: 401, body: #"{"detail":"Invalid token."}"#)]).error == .keyRejected)
    #expect(await read([.respond(status: 200, body: subscriptionBody), .respond(status: 403, body: "{}")]).error == .keyRejected)
    #expect(await read([.respond(status: 429, body: "{}")]).error == .rateLimited)
    #expect(await read([
      .respond(status: 200, body: subscriptionBody), .respond(status: 200, body: planBody), .respond(status: 500, body: "{}"),
    ]).error == .httpStatus(500))
    #expect(MonitorError.provider(.webshare, .keyRejected).message == "Webshare rejected this key.")
  }

  @Test func malformedBodiesFailTheReadNeverZero() async {
    #expect(await read([.respond(status: 200, body: "not json{")]).error == .notJSON)
    #expect(await read([.respond(status: 200, body: #"{"plan":null,"free_credits":1}"#)]).error == .missingField("plan"))
    #expect(await read([.respond(status: 200, body: #"{"plan":true,"free_credits":1}"#)]).error == .missingField("plan"))
    #expect(await read([.respond(status: 200, body: #"{"plan":2,"free_credits":"lots"}"#)]).error == .missingField("free_credits"))
    #expect(await read([.respond(status: 200, body: subscriptionBody), .respond(status: 200, body: #"{"bandwidth_limit":null}"#)])
      .error == .missingField("bandwidth_limit"))
    #expect(await read([.respond(status: 200, body: #"{"plan":2,"free_credits":1,"start_date":"soon"}"#), .respond(status: 200, body: planBody)])
      .error == .missingField("start_date"))
    #expect(await read([
      .respond(status: 200, body: subscriptionBody), .respond(status: 200, body: planBody), .respond(status: 200, body: #"{"requests_total":5}"#),
    ]).error == .missingField("bandwidth_total"))
    #expect(MonitorError.provider(.webshare, .missingField("plan")).message == "Webshare returned an unexpected response.")
  }

  @Test func aTransportFailureIsUnreachable() async {
    #expect(await read([.fail]).error == .unreachable)
    #expect(await read([.respond(status: 200, body: subscriptionBody), .fail]).error == .unreachable)
  }
}

private extension Result where Success == [PoolBalance], Failure == ProviderReadError {
  var error: ProviderReadError? {
    if case let .failure(e) = self { return e }
    return nil
  }
}
