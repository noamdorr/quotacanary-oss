import Foundation
@testable import QuotaCanaryCore
import Testing

/// From src/lib/adapters/peopledatalabs.test.ts: the usage-limits docs'
/// "Sample Response Headers" (ratelimit objects left out).
let peopleDataLabsHeaders = [
  "x-call-credits-spent": "1",
  "x-call-credits-type": "enrich",
  "x-ratelimit-reset": "2022-02-23T20:19:55Z",
  "x-lifetime-used": "984152",
  "x-totallimit-remaining": "1342",
  "x-totallimit-purchased-remaining": "342",
  "x-totallimit-overages-remaining": "1000",
]

private func read(status: Int, headers: [String: String] = [:]) async -> Result<[PoolBalance], ProviderReadError> {
  do {
    let transport = ScriptedTransport([.respond(status: status, body: "", headers: headers)])
    return .success(try await PeopleDataLabs.read(key: "pdl-key", transport: transport))
  } catch {
    return .failure(error as! ProviderReadError)
  }
}

@Suite struct PeopleDataLabsTests {
  @Test func readsTheRemainingTotalFromAParameterlessHead() async throws {
    let transport = ScriptedTransport([.respond(status: 400, body: "", headers: peopleDataLabsHeaders)])
    let balances = try await PeopleDataLabs.read(key: "pdl-key", transport: transport)
    #expect(balances == [
      PoolBalance(pool: Pool(creditType: "credits", label: "Credits", unit: .credits, cap: nil), balance: 1342),
    ])
    #expect(transport.requests.first?.url.absoluteString == "https://api.peopledatalabs.com/v5/person/enrich")
    #expect(transport.requests.first?.method == "HEAD")
    #expect(transport.requests.first?.headers == ["X-Api-Key": "pdl-key", "Accept": "application/json"])
  }

  @Test func theHeaderWinsOverAnyStatusButAuth() async {
    #expect(await read(status: 200, headers: peopleDataLabsHeaders).balances == ["credits": 1342])
    #expect(await read(status: 402, headers: ["x-totallimit-remaining": "0"]).balances == ["credits": 0])
    #expect(await read(status: 404, headers: [
      "x-totallimit-remaining": "7", "x-totallimit-purchased-remaining": "999", "x-totallimit-overages-remaining": "888",
    ]).balances == ["credits": 7])
  }

  @Test func authFailuresAreKeyRejected() async {
    #expect(await read(status: 401).error == .keyRejected)
    #expect(await read(status: 403, headers: peopleDataLabsHeaders).error == .keyRejected)
    #expect(MonitorError.provider(.peopledatalabs, .keyRejected).message == "People Data Labs rejected this key.")
  }

  @Test func withoutTheHeaderTheStatusDecides() async {
    #expect(await read(status: 429).error == .rateLimited)
    #expect(await read(status: 500).error == .httpStatus(500))
    #expect(await read(status: 200, headers: ["x-call-credits-type": "enrich"]).error == .missingField("x-totallimit-remaining"))
    for value in ["lots", "", "NaN"] {
      #expect(await read(status: 200, headers: ["x-totallimit-remaining": value]).error == .missingField("x-totallimit-remaining"))
    }
    #expect(MonitorError.provider(.peopledatalabs, .missingField("x-totallimit-remaining")).message
      == "People Data Labs returned an unexpected response.")
  }

  @Test func aTransportFailureIsUnreachable() async {
    do {
      _ = try await PeopleDataLabs.read(key: "k", transport: ScriptedTransport([.fail]))
      Issue.record("expected a failure")
    } catch {
      #expect(error as? ProviderReadError == .unreachable)
    }
  }
}

private extension Result where Success == [PoolBalance], Failure == ProviderReadError {
  var balances: [String: Double]? {
    (try? get()).map { Dictionary(uniqueKeysWithValues: $0.map { ($0.pool.creditType, $0.balance) }) }
  }

  var error: ProviderReadError? {
    if case let .failure(e) = self { return e }
    return nil
  }
}
