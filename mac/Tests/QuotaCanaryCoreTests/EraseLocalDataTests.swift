import Foundation
@testable import QuotaCanaryCore
import Testing

// QUO-297: one erase for everything the app keeps on this Mac.

@MainActor
@Suite struct EraseLocalDataTests {
  @MainActor private struct Harness {
    let credentials = InMemoryCredentialStore()
    let store = InMemoryConnectionStore()
    let history = InMemoryReadingHistoryStore()
    let transport = ScriptedTransport([Scenarios.hunterOK])
    var service: MonitoringService {
      MonitoringService(credentials: credentials, store: store, history: history, transport: transport)
    }
  }

  private func connectedHarness() async throws -> (Harness, MonitoringService, Int) {
    let h = Harness()
    let service = h.service
    _ = try await service.connect(provider: .hunter, key: "synthetic-key")
    return (h, service, h.transport.sent.count)
  }

  @Test func removesEveryKeyAndShowsFirstRunWithoutANetworkCall() async throws {
    let (h, service, callsBefore) = try await connectedHarness()
    let summary = try EraseLocalData(service: service).run()

    #expect(summary == EraseSummary(keys: 1))
    #expect(h.credentials.items.isEmpty)
    #expect(h.store.bytes == nil)
    #expect(h.history.bytes == nil)
    // First run: no connections or history.
    #expect(service.connections.isEmpty)
    #expect(service.history == ReadingHistory())
    #expect(h.transport.sent.count == callsBefore)
    // Nothing was sent: the erase is local only.
    // A relaunch from the erased stores is first run too.
    #expect(try service.restore().isEmpty)
  }

  @Test func removesOrphanedKeysAndTheApplicationSupportFolder() async throws {
    let h = Harness()
    let service = h.service
    try h.credentials.save("orphan", ref: "from-a-connection-long-gone")
    let folder = FileManager.default.temporaryDirectory.appendingPathComponent("qc-erase-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    for name in ["connections.json", "history.json", "preferences.json"] {
      try Data("{}".utf8).write(to: folder.appendingPathComponent(name))
    }
    defer { try? FileManager.default.removeItem(at: folder) }

    try EraseLocalData(service: service, folder: folder).run()

    #expect(h.credentials.items.isEmpty)
    #expect(!FileManager.default.fileExists(atPath: folder.path))
  }

  @Test func theFileStoresEraseTheirFiles() throws {
    let folder = FileManager.default.temporaryDirectory.appendingPathComponent("qc-erase-\(UUID().uuidString)")
    defer { try? FileManager.default.removeItem(at: folder) }
    let connections = JSONFileConnectionStore(url: folder.appendingPathComponent("connections.json"))
    let history = JSONFileReadingHistoryStore(url: folder.appendingPathComponent("history.json"))
    try connections.save([])
    try history.save(ReadingHistory())
    try connections.erase()
    try history.erase()
    try connections.erase() // already gone is not an error
    #expect(try FileManager.default.contentsOfDirectory(atPath: folder.path).isEmpty)
    #expect(try connections.load().isEmpty)
  }

  @Test func aRefusingKeychainKeepsTheScreenHonest() async throws {
    let (h, service, _) = try await connectedHarness()
    h.credentials.failing = true
    #expect(throws: EraseError.failed) { try EraseLocalData(service: service).run() }
    #expect(service.connections.count == 1) // still shown: it is still on disk
  }
}
