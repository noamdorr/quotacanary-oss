import Foundation
@testable import QuotaCanaryCore
import Testing

/// From src/lib/adapters/deepgram.test.ts: the docs examples for List
/// Projects and Get Project Balances (developers.deepgram.com, fetched
/// 2026-10-17). Units come back as "USD" there and are matched case-insensitively.
private let projectID = "proj_9f8b7c6d5e4a3b2c1d0e"
private let projectsBody = #"{"projects":[{"project_id":"proj_9f8b7c6d5e4a3b2c1d0e","name":"Customer Support Transcriptions"}]}"#
private let docsBalance = #"{"balance_id":"b7f3c9d2-4a1e-4f8b-9c3d-2e5a7f8b9c1d","amount":1250.75,"units":"USD","purchase_order_id":"PO-2024-04567"}"#
private func balancesBody(_ entries: String...) -> String { #"{"balances":["# + entries.joined(separator: ",") + "]}" }
private func balancesURL(_ id: String) -> String { "https://api.deepgram.com/v1/projects/\(id)/balances" }

private func usd(_ id: String, _ label: String, _ balance: Double) -> PoolBalance {
  PoolBalance(pool: Pool(creditType: "project:\(id)", label: label, unit: .usd, cap: nil), balance: balance)
}

private func read(_ steps: [ScriptedTransport.Step]) async -> Result<[PoolBalance], ProviderReadError> {
  do {
    return .success(try await Deepgram.read(key: "dg-key", transport: ScriptedTransport(steps)))
  } catch {
    return .failure(error as! ProviderReadError)
  }
}

@Suite struct DeepgramTests {
  @Test func listsProjectsThenSumsOneProjectsUSDBalances() async throws {
    let transport = ScriptedTransport([
      .respond(status: 200, body: projectsBody),
      .respond(status: 200, body: balancesBody(docsBalance, #"{"amount":49.25,"units":"usd"}"#)),
    ])
    let balances = try await Deepgram.read(key: "dg-key", transport: transport)
    #expect(balances == [usd(projectID, "Customer Support Transcriptions", 1300)])
    #expect(transport.requests.map(\.url.absoluteString) == ["https://api.deepgram.com/v1/projects", balancesURL(projectID)])
    #expect(transport.requests.allSatisfy { $0.method == "GET" })
    #expect(transport.requests.allSatisfy { $0.headers == ["Authorization": "Token dg-key", "Accept": "application/json"] })
  }

  @Test func onePoolPerProjectKeyedByIDAndLabelledByName() async throws {
    let projects = #"{"projects":[{"project_id":"proj_a","name":"Support"},{"project_id":"proj_b","name":"Voice Agent"}]}"#
    let result = await read([
      .respond(status: 200, body: projects),
      .respond(status: 200, body: balancesBody(docsBalance)),
      .respond(status: 200, body: balancesBody(#"{"amount":3.5,"units":"usd"}"#)),
    ])
    #expect(try result.get() == [usd("proj_a", "Support", 1250.75), usd("proj_b", "Voice Agent", 3.5)])
  }

  @Test func aNamelessProjectFallsBackToTheIDPrefixAndTheIDIsEncoded() async throws {
    let transport = ScriptedTransport([
      .respond(status: 200, body: #"{"projects":[{"project_id":"abcdef12/34 56"}]}"#),
      .respond(status: 200, body: balancesBody(docsBalance)),
    ])
    let balances = try await Deepgram.read(key: "dg-key", transport: transport)
    #expect(balances == [usd("abcdef12/34 56", "abcdef12", 1250.75)])
    #expect(transport.requests.last?.url.absoluteString == balancesURL("abcdef12%2F34%2056"))
  }

  @Test func aProjectWithNoBalanceIsSkipped() async throws {
    let projects = #"{"projects":[{"project_id":"proj_a","name":"Empty"},{"project_id":"proj_b","name":"Funded"}]}"#
    let result = await read([
      .respond(status: 200, body: projects),
      .respond(status: 200, body: balancesBody()),
      .respond(status: 200, body: balancesBody(docsBalance)),
    ])
    #expect(try result.get() == [usd("proj_b", "Funded", 1250.75)])
  }

  @Test func noProjectYieldingAPoolIsUnexpected() async {
    #expect(await read([.respond(status: 200, body: projectsBody), .respond(status: 200, body: balancesBody())]).error
      == .missingField("balances"))
    #expect(await read([.respond(status: 200, body: #"{"projects":[]}"#)]).error == .missingField("balances"))
    #expect(MonitorError.provider(.deepgram, .missingField("balances")).message == "Deepgram returned an unexpected response.")
  }

  @Test func moneyInAnotherUnitOrAMissingAmountFailsTheRead() async {
    let eur = #"{"amount":10,"units":"EUR"}"#
    #expect(await read([.respond(status: 200, body: projectsBody), .respond(status: 200, body: balancesBody(docsBalance, eur))])
      .error == .missingField("balances.units"))
    #expect(await read([.respond(status: 200, body: projectsBody), .respond(status: 200, body: balancesBody(#"{"units":"usd"}"#))])
      .error == .missingField("balances.amount"))
  }

  @Test func readsAtMostTenProjectsInListOrder() async throws {
    let projects = (0..<12).map { #"{"project_id":"p\#($0)","name":"P\#($0)"}"# }.joined(separator: ",")
    // The last scripted step repeats, so every balances call gets the docs body.
    let transport = ScriptedTransport([
      .respond(status: 200, body: #"{"projects":["# + projects + "]}"),
      .respond(status: 200, body: balancesBody(docsBalance)),
    ])
    let balances = try await Deepgram.read(key: "dg-key", transport: transport)
    #expect(transport.requests.count == 1 + Deepgram.maxProjects)
    #expect(balances.map(\.pool.creditType) == (0..<10).map { "project:p\($0)" })
  }

  @Test func statusesMapToTheSharedErrors() async {
    // 401 body observed with a dummy key on 2026-10-17.
    let unauthorized = #"{"category":"UNAUTHORIZED","message":"Authentication failed.","details":"Check that you are using the correct credentials.","request_id":"07ad225a-9358-40e6-a0cb-68b6894ac0aa"}"#
    #expect(await read([.respond(status: 401, body: unauthorized)]).error == .keyRejected)
    // A key that lists projects but lacks billing:read.
    #expect(await read([.respond(status: 200, body: projectsBody), .respond(status: 403, body: "{}")]).error == .keyRejected)
    #expect(await read([.respond(status: 429, body: "{}")]).error == .rateLimited)
    #expect(await read([.respond(status: 200, body: projectsBody), .respond(status: 500, body: "{}")]).error == .httpStatus(500))
    #expect(await read([.respond(status: 200, body: "not json{")]).error == .notJSON)
    #expect(MonitorError.provider(.deepgram, .keyRejected).message == "Deepgram rejected this key.")
  }

  @Test func aProjectWithoutAnIDIsUnexpected() async {
    #expect(await read([.respond(status: 200, body: #"{"projects":[{"name":"No id"}]}"#)]).error
      == .missingField("projects.project_id"))
  }

  @Test func theFirstFailureStopsTheRead() async {
    let projects = #"{"projects":[{"project_id":"proj_a"},{"project_id":"proj_b"}]}"#
    let transport = ScriptedTransport([.respond(status: 200, body: projects), .respond(status: 500, body: "{}")])
    _ = try? await Deepgram.read(key: "k", transport: transport)
    #expect(transport.requests.count == 2)
  }

  @Test func aTransportFailureIsUnreachable() async {
    #expect(await read([.fail]).error == .unreachable)
    #expect(await read([.respond(status: 200, body: projectsBody), .fail]).error == .unreachable)
  }
}

private extension Result where Success == [PoolBalance], Failure == ProviderReadError {
  var error: ProviderReadError? {
    if case let .failure(e) = self { return e }
    return nil
  }
}
