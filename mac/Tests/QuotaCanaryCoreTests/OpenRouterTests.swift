import Foundation
@testable import QuotaCanaryCore
import Testing

private func read(_ step: ScriptedTransport.Step) async -> Result<[PoolBalance], ProviderReadError> {
  do {
    return .success(try await OpenRouter.read(key: "key", transport: ScriptedTransport([step])))
  } catch {
    return .failure(error as! ProviderReadError)
  }
}

@Suite struct OpenRouterTests {
  @Test func computesRemainingAsTotalCreditsMinusTotalUsage() async throws {
    let transport = ScriptedTransport([.respond(status: 200, body: #"{"data":{"total_credits":20,"total_usage":7.5}}"#)])
    let balances = try await OpenRouter.read(key: "sk-test", transport: transport)
    #expect(balances == [PoolBalance(
      pool: Pool(creditType: "credits", label: "Credits", unit: .usd, cap: nil),
      balance: 12.5
    )])
    #expect(transport.requests.first?.url.absoluteString == "https://openrouter.ai/api/v1/credits")
    #expect(transport.requests.first?.headers["Authorization"] == "Bearer sk-test")
  }

  @Test func missingUsageCountsAsZero() async {
    #expect(await read(.respond(status: 200, body: #"{"data":{"total_credits":5}}"#)).balance == 5)
  }

  @Test func rejects401AsKeyRejected() async {
    #expect(await read(.respond(status: 401, body: "{}")).error == .keyRejected)
    #expect(MonitorError.provider(.openrouter, .keyRejected).message == "OpenRouter rejected this key.")
  }

  @Test func otherStatusIsReported() async {
    #expect(await read(.respond(status: 503, body: "{}")).error == .httpStatus(503))
    #expect(MonitorError.provider(.openrouter, .httpStatus(503)).message == "OpenRouter returned 503.")
  }

  @Test func nonJSONBodyIsUnexpected() async {
    #expect(await read(.respond(status: 200, body: "<html>nope</html>")).error == .notJSON)
    #expect(MonitorError.provider(.openrouter, .notJSON).message == "OpenRouter returned an unexpected response.")
  }

  @Test func missingOrNonNumericTotalIsUnexpected() async {
    for body in [#"{"data":{}}"#, #"{"data":{"total_credits":null}}"#, #"{"data":{"total_credits":true}}"#, "[]"] {
      #expect(await read(.respond(status: 200, body: body)).error == .missingField("data.total_credits"))
    }
    #expect(
      MonitorError.provider(.openrouter, .missingField("x")).message == "OpenRouter returned an unexpected response."
    )
  }

  @Test func transportFailureIsUnreachable() async {
    #expect(await read(.fail).error == .unreachable)
    #expect(MonitorError.provider(.openrouter, .unreachable).message == "Couldn't reach OpenRouter.")
  }

  @Test func formatsUSD() {
    #expect(Format.balance(12.5, unit: .usd) == "$12.50")
    #expect(Format.balance(-1, unit: .usd) == "-$1.00")
  }
}

private extension Result where Success == [PoolBalance], Failure == ProviderReadError {
  var balance: Double? { (try? get())?.first?.balance }
  var error: ProviderReadError? {
    if case let .failure(e) = self { return e }
    return nil
  }
}
