import Foundation
@testable import QuotaCanaryCore
import Testing

/// Prospeo through its catalog entry, with the hand-written port's fixtures.
/// From src/lib/adapters/prospeo.test.ts.
let prospeoFixture = #"{"error":false,"response":{"remaining_credits":900,"used_credits":100}}"#

private let prospeo = ProviderRegistry.current.entry(.prospeo)!

private func read(_ body: String, status: Int = 200) async -> Result<[PoolBalance], ProviderReadError> {
  do {
    return .success(try await CatalogProvider.read(prospeo, key: "key", transport: ScriptedTransport([.respond(status: status, body: body)])))
  } catch {
    return .failure(error as! ProviderReadError)
  }
}

@Suite struct ProspeoTests {
  @Test func balanceIsRemainingAndCapIsRemainingPlusUsed() async throws {
    let transport = ScriptedTransport([.respond(status: 200, body: prospeoFixture)])
    let balances = try await CatalogProvider.read(prospeo, key: "prospeo-key", transport: transport)
    #expect(balances == [
      PoolBalance(pool: Pool(creditType: "credits", label: "Credits", unit: .credits, cap: 1000), balance: 900),
    ])
    #expect(transport.requests.first?.url.absoluteString == "https://api.prospeo.io/account-information")
    #expect(transport.requests.first?.method == "GET")
    #expect(transport.requests.first?.headers == ["X-KEY": "prospeo-key"])
  }

  @Test func capOnlyWhenUsedIsANumber() async throws {
    for response in [#"{"remaining_credits":900}"#, #"{"remaining_credits":900,"used_credits":null}"#,
                     #"{"remaining_credits":900,"used_credits":"n/a"}"#] {
      let balances = try await read(#"{"error":false,"response":"# + response + "}").get()
      #expect(balances.first?.balance == 900)
      #expect(balances.first?.pool.cap == nil)
    }
    // Catalog rule (same as the web): limit = balance + used, whatever the sign.
    let odd = try await read(#"{"error":false,"response":{"remaining_credits":900,"used_credits":-5}}"#).get()
    #expect(odd.first?.pool.cap == 895)
  }

  @Test func zeroRemainingIsEmptyNotNotInPlan() async throws {
    let balances = try await read(#"{"error":false,"response":{"remaining_credits":0,"used_credits":0}}"#).get()
    #expect(balances.first?.pool.cap == nil)
    #expect(PoolStatus.of(balances.first, settings: ProviderID.prospeo.defaultSettings) == .empty)
  }

  @Test func missingOrNonFiniteRemainingIsUnexpected() async {
    for response in [#"{}"#, #"{"remaining_credits":null}"#, #"{"remaining_credits":"lots"}"#,
                     #"{"remaining_credits":true}"#, #"{"used_credits":100}"#] {
      #expect(await read(#"{"error":false,"response":"# + response + "}").error
        == .missingField("response.remaining_credits"))
    }
    #expect(await read("[]").error == .missingField("response.remaining_credits"))
    #expect(MonitorError.provider(.prospeo, .missingField("x")).message == "Prospeo returned an unexpected response.")
  }

  @Test func errorEnvelopesNeverBecomeABalance() async {
    // rejectWhen { path: error, equals: true }: any error envelope on a 2xx is a rejected key.
    #expect(await read(#"{"error":true,"response":{}}"#).error == .keyRejected)
    #expect(await read(#"{"error":true,"error_code":"INTERNAL_ERROR"}"#).error == .keyRejected)
    // QUO-280: Prospeo answers a bad key with 400 + INVALID_API_KEY; any other 400 shows its own code.
    #expect(await read(#"{"error":true,"error_code":"INVALID_API_KEY"}"#, status: 400).error == .keyRejected)
    #expect(await read(#"{"error":true,"error_code":"INVALID_REQUEST"}"#, status: 400).error == .reportedError("INVALID_REQUEST"))
    #expect(MonitorError.provider(.prospeo, .reportedError("INVALID_REQUEST")).message == "INVALID_REQUEST")
    // No Prospeo envelope on the 400: the status itself.
    #expect(await read("{}", status: 400).error == .httpStatus(400))
    #expect(MonitorError.provider(.prospeo, .keyRejected).message == "Prospeo rejected this key.")
  }

  @Test func statusNonJSONAndTransportFailure() async {
    #expect(await read("{}", status: 401).error == .keyRejected)
    #expect(await read("{}", status: 503).error == .httpStatus(503))
    #expect(await read("<html>").error == .notJSON)
    do {
      _ = try await CatalogProvider.read(prospeo, key: "k", transport: ScriptedTransport([.fail]))
      Issue.record("expected a failure")
    } catch {
      #expect(error as? ProviderReadError == .unreachable)
    }
    #expect(MonitorError.provider(.prospeo, .unreachable).message == "Couldn't reach Prospeo.")
  }
}

private extension Result where Success == [PoolBalance], Failure == ProviderReadError {
  var error: ProviderReadError? {
    if case let .failure(e) = self { return e }
    return nil
  }
}
