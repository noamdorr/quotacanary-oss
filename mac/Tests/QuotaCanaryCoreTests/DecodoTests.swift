import Foundation
@testable import QuotaCanaryCore
import Testing

/// From src/lib/adapters/decodo.test.ts: the docs examples for Get
/// subscriptions and Get sub users (help.decodo.com, fetched 2026-10-17).
/// traffic_limit is a string; GB is implied, the docs state no unit.
private let subscription = #"{"traffic_limit":"50","traffic_per_period":"0.15","users_limit":3,"ip_address_limit":2,"valid_from":"2018-11-08","valid_until":"2019-06-30","service_type":"residential_proxies"}"#
private func subUser(_ traffic: String) -> String {
  #"{"id":24570,"username":"name","status":"active","traffic":"# + traffic + #","traffic_limit":null,"service_type":"residential_proxies"}"#
}

private func traffic(_ balance: Double, cap: Double) -> PoolBalance {
  var pool = Decodo.trafficPool
  pool.cap = cap
  return PoolBalance(pool: pool, balance: balance)
}

private func read(_ steps: [ScriptedTransport.Step]) async -> Result<[PoolBalance], ProviderReadError> {
  do {
    return .success(try await Decodo.read(key: "dc-key", transport: ScriptedTransport(steps)))
  } catch {
    return .failure(error as! ProviderReadError)
  }
}

@Suite struct DecodoTests {
  @Test func subtractsTheSubUsersTrafficFromTheResidentialLimit() async throws {
    let transport = ScriptedTransport([
      .respond(status: 200, body: "[\(subscription)]"),
      .respond(status: 200, body: "[\(subUser("1.13")),\(subUser("3.87"))]"),
    ])
    let balances = try await Decodo.read(key: "dc-key", transport: transport)
    #expect(balances == [traffic(45, cap: 50)])
    #expect(transport.requests.map(\.url.absoluteString) == [
      "https://api.decodo.com/v2/subscriptions",
      "https://api.decodo.com/v2/sub-users?service_type=residential_proxies",
    ])
    #expect(transport.requests.allSatisfy { $0.method == "GET" })
    #expect(transport.requests.allSatisfy { $0.headers == ["Authorization": "dc-key"] })
  }

  @Test func readsTheDocsSingleObjectShapeToo() async throws {
    let result = await read([.respond(status: 200, body: subscription), .respond(status: 200, body: "[\(subUser("1.13"))]")])
    #expect(try result.get() == [traffic(50 - 1.13, cap: 50)])
  }

  @Test func anEmptySubUserListMeansNothingUsed() async throws {
    let result = await read([.respond(status: 200, body: "[\(subscription)]"), .respond(status: 200, body: "[]")])
    #expect(try result.get() == [traffic(50, cap: 50)])
  }

  @Test func usageOverTheLimitFloorsAtZero() async throws {
    let result = await read([.respond(status: 200, body: "[\(subscription)]"), .respond(status: 200, body: "[\(subUser("60"))]")])
    #expect(try result.get() == [traffic(0, cap: 50)])
  }

  @Test func noResidentialSubscriptionIsUnexpected() async {
    let mobile = subscription.replacingOccurrences(of: "residential_proxies", with: "mobile_proxies")
    let transport = ScriptedTransport([.respond(status: 200, body: "[\(mobile)]")])
    await #expect(throws: ProviderReadError.missingField("subscriptions")) {
      try await Decodo.read(key: "dc-key", transport: transport)
    }
    #expect(transport.requests.count == 1)
    #expect(await read([.respond(status: 200, body: "[]")]).error == .missingField("subscriptions"))
    #expect(MonitorError.provider(.decodo, .missingField("subscriptions")).message == "Decodo returned an unexpected response.")
  }

  @Test func aNonNumericTrafficLimitIsUnexpected() async {
    let unlimited = subscription.replacingOccurrences(of: #""50""#, with: #""unlimited""#)
    #expect(await read([.respond(status: 200, body: "[\(unlimited)]")]).error == .missingField("traffic_limit"))
  }

  @Test func statusesMapToTheSharedErrors() async {
    // 401 body observed with a dummy key on 2026-10-17.
    let unauthorized = #"{"error_code":"unauthorized","message":"Invalid Api key provided"}"#
    #expect(await read([.respond(status: 401, body: unauthorized)]).error == .keyRejected)
    #expect(await read([.respond(status: 429, body: "{}")]).error == .rateLimited)
    #expect(await read([.respond(status: 200, body: "[\(subscription)]"), .respond(status: 500, body: "{}")]).error == .httpStatus(500))
    #expect(MonitorError.provider(.decodo, .keyRejected).message == "Decodo rejected this key.")
  }

  @Test func malformedBodiesFailTheRead() async {
    #expect(await read([.respond(status: 200, body: "not json{")]).error == .notJSON)
    #expect(await read([.respond(status: 200, body: "[\(subscription)]"), .respond(status: 200, body: "{}")]).error
      == .missingField("sub-users"))
    #expect(await read([.respond(status: 200, body: "[\(subscription)]"), .respond(status: 200, body: "[\(subUser("null"))]")]).error
      == .missingField("sub-users.traffic"))
  }

  @Test func aTransportFailureIsUnreachable() async {
    #expect(await read([.fail]).error == .unreachable)
    #expect(await read([.respond(status: 200, body: "[\(subscription)]"), .fail]).error == .unreachable)
  }
}

private extension Result where Success == [PoolBalance], Failure == ProviderReadError {
  var error: ProviderReadError? {
    if case let .failure(e) = self { return e }
    return nil
  }
}
