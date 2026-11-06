import Foundation
@testable import QuotaCanaryCore
import Testing

/// QUO-451: X left the catalog, but a connections.json written by an earlier
/// build can still hold an `x` connection. It must load next to the others,
/// never reach the network, and fail its check instead of keeping a balance.
@MainActor @Suite struct RetiredProviderConnectionTests {
  private let retired = ProviderID("x")
  private let reading = Reading(
    balances: [PoolBalance(pool: Pool(creditType: "post_reads", label: "Post reads", unit: .credits, cap: 100), balance: 40)],
    checkedAt: Date(timeIntervalSince1970: 1_700_000_000)
  )

  private func makeFile() throws -> JSONFileConnectionStore {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("qc-retired-\(UUID().uuidString)")
    let store = JSONFileConnectionStore(url: dir.appendingPathComponent("connections.json"))
    try store.save([
      Connection(id: "a", provider: .openrouter, name: "OpenRouter", credentialRef: "a", lastReading: nil),
      Connection(id: "b", provider: retired, name: "X", credentialRef: "b", lastReading: reading),
      Connection(id: "c", provider: .hunter, name: "Hunter", credentialRef: "c", lastReading: nil),
    ])
    return JSONFileConnectionStore(url: store.url)
  }

  @Test func theRetiredToolIsNotInTheCatalog() {
    #expect(!ProviderRegistry.current.isKnown(retired))
    #expect(!ProviderRegistry.current.ids.contains(retired))
  }

  @Test func aSavedConnectionLoadsNextToTheOthers() throws {
    let file = try makeFile()
    defer { try? file.erase() }
    let credentials = InMemoryCredentialStore()
    let service = MonitoringService(credentials: credentials, store: file, transport: ScriptedTransport([]))
    let loaded = try service.restore()
    #expect(loaded.map(\.id) == ["a", "b", "c"])
    #expect(loaded.map(\.provider) == [.openrouter, retired, .hunter])
    #expect(loaded[1].provider.displayName == "x")
  }

  @Test func checkingItFailsWithoutAnyRequestAndKeepsTheOthers() async throws {
    let file = try makeFile()
    defer { try? file.erase() }
    let credentials = InMemoryCredentialStore()
    try credentials.save("x-key", ref: "b")
    let transport = ScriptedTransport([])
    let service = MonitoringService(credentials: credentials, store: file, transport: transport)
    try service.restore()

    let error = await monitorError { _ = try await service.refresh(id: "b") }
    #expect(error == .provider(retired, .missingField("catalog")))
    #expect(transport.requests.isEmpty) // the key is never sent anywhere
    #expect(service.connections.map(\.id) == ["a", "b", "c"])
    // The failure is the only outcome: the refresh did not rewrite the old reading as a fresh one.
    #expect(service.connections[1].lastReading == reading)
  }
}
