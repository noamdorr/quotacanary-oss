import Foundation
@testable import QuotaCanaryCore
import Testing

/// QUO-447 (audit F09): a state file the app cannot read is never saved over.
/// Every test works in its own temporary folder.
@MainActor @Suite struct UnreadableStateFileTests {
  private let folder = FileManager.default.temporaryDirectory
    .appendingPathComponent("qc-unreadable-\(UUID().uuidString)", isDirectory: true)
  private let setAsideAt = Date(timeIntervalSince1970: 1_700_000_000)

  private var url: URL { folder.appendingPathComponent("connections.json") }

  private func makeStore() -> JSONFileConnectionStore {
    JSONFileConnectionStore(url: url, now: { self.setAsideAt })
  }

  private func cleanUp() { try? FileManager.default.removeItem(at: folder) }

  private func files() -> [String] {
    ((try? FileManager.default.contentsOfDirectory(atPath: folder.path)) ?? []).sorted()
  }

  private func setAsideCopies() -> [String] { files().filter { $0.hasPrefix("connections-unreadable-") } }

  /// Three OpenRouter connections with a dollar reading, then `edit` on the text.
  private func seed(_ edit: (inout String) -> Void = { _ in }) throws -> Data {
    let reading = Reading(
      balances: [PoolBalance(pool: Pool(creditType: "credits", label: "Credits", unit: .usd, cap: nil), balance: 12.5)],
      checkedAt: t0
    )
    try makeStore().save((1...3).map {
      Connection(id: "c\($0)", provider: .openrouter, name: "OpenRouter \($0)", credentialRef: "c\($0)", lastReading: reading)
    })
    var text = try String(contentsOf: url, encoding: .utf8)
    edit(&text)
    try text.write(to: url, atomically: true, encoding: .utf8)
    return try Data(contentsOf: url)
  }

  private func service(_ store: ConnectionStore) -> MonitoringService {
    MonitoringService(
      credentials: InMemoryCredentialStore(), store: store,
      transport: RoutedTransport(["openrouter.ai": ScriptedTransport([ok])]), now: { t0 }
    )
  }

  /// Audit S1 / lifecycle probe: a truncated file, then the user connects again.
  @Test func aTruncatedFileIsMovedAsideBeforeTheNextConnectSaves() async throws {
    defer { cleanUp() }
    let original = try seed { $0 = String($0.prefix($0.count / 2)) }
    let store = makeStore()
    let service = service(store)
    #expect(try service.restore().isEmpty)
    let copy = try #require(service.setAsideFile)
    #expect(copy.lastPathComponent.hasPrefix("connections-unreadable-"))
    try await service.connect(provider: .openrouter, key: secret, name: "Fresh")
    #expect(try Data(contentsOf: copy) == original)
    #expect(try store.load().map(\.name) == ["Fresh"])
  }

  /// Audit S2: one balance in a unit this build does not know. Every
  /// connection shows; the unit reads as unknown; the original is kept.
  @Test func anUnknownUnitReadsAsUnknownAndTheOriginalIsKept() async throws {
    defer { cleanUp() }
    let original = try seed { text in
      text.replaceSubrange(text.range(of: "\"usd\"")!, with: "\"tokens\"")
    }
    let service = service(makeStore())
    let loaded = try service.restore()
    #expect(loaded.map(\.id) == ["c1", "c2", "c3"])
    #expect(loaded[0].lastReading?.balances.first?.pool.unit == .unknown)
    #expect(loaded[1].lastReading?.balances.first?.pool.unit == .usd)
    #expect(Format.balance(12.5, unit: .unknown, locale: Locale(identifier: "en_US")) == "12.5")
    let copy = try #require(service.setAsideFile)
    try await service.connect(provider: .openrouter, key: secret, name: "Fresh")
    #expect(try Data(contentsOf: copy) == original)
  }

  /// Three connections, one unreadable: the other two load and refresh, and
  /// the unreadable one survives the next save in the set-aside copy.
  @Test func oneUnreadableConnectionLeavesTheOthersWorking() async throws {
    defer { cleanUp() }
    let original = try seed { text in
      text.replaceSubrange(text.range(of: "\"credentialRef\" : \"c2\"")!, with: "\"credentialRef\" : 2")
    }
    let credentials = InMemoryCredentialStore()
    for ref in ["c1", "c3"] { try credentials.save(secret, ref: ref) }
    let store = makeStore()
    let service = MonitoringService(
      credentials: credentials, store: store,
      transport: RoutedTransport(["openrouter.ai": ScriptedTransport([ok])]), now: { t0.addingTimeInterval(60) }
    )
    #expect(try service.restore().map(\.id) == ["c1", "c3"])
    try await service.refresh(id: "c1")
    try await service.refresh(id: "c3")
    #expect(try store.load().map(\.id) == ["c1", "c3"])
    let copy = try #require(service.setAsideFile)
    #expect(try Data(contentsOf: copy) == original)
  }

  /// Coordination with the catalog: a tool no longer in this build loads as a
  /// normal connection (its check fails later), never as an unreadable file.
  @Test func anUnknownProviderIDLoadsAsANormalConnection() throws {
    defer { cleanUp() }
    let original = try seed { $0 = $0.replacingOccurrences(of: "\"openrouter\"", with: "\"x\"") }
    let store = makeStore()
    let loaded = try store.load()
    #expect(loaded.map(\.provider) == [ProviderID("x"), ProviderID("x"), ProviderID("x")])
    #expect(store.setAside == nil)
    #expect(setAsideCopies().isEmpty)
    try store.save(loaded)
    #expect(try Data(contentsOf: url) == original)
  }

  @Test func aValidFileRoundTripsByteIdenticallyAndIsNotCopied() throws {
    defer { cleanUp() }
    let original = try seed()
    let store = makeStore()
    try store.save(try store.load())
    #expect(try Data(contentsOf: url) == original)
    #expect(store.setAside == nil)
    #expect(files() == ["connections.json"])
  }

  /// A store that cannot read and could not keep a copy: connect saves nothing.
  @Test func anUnreadableStoreIsNotOverwrittenByTheNextConnect() async throws {
    final class Unreadable: ConnectionStore {
      var saved: [Connection]?
      func load() throws -> [Connection] { throw CocoaError(.fileReadCorruptFile) }
      func save(_ connections: [Connection]) throws { saved = connections }
      func erase() throws {}
    }
    let store = Unreadable()
    let service = service(store)
    #expect(throws: MonitorError.loadFailed) { try service.restore() }
    await #expect(throws: MonitorError.loadFailed) { try await service.connect(provider: .openrouter, key: secret) }
    #expect(store.saved == nil)
    // Erase is the way out: afterwards a connect saves.
    try service.eraseLocal()
    try await service.connect(provider: .openrouter, key: secret)
    #expect(store.saved?.count == 1)
  }

  @Test func twoSetAsidesInTheSameSecondKeepBothCopies() throws {
    defer { cleanUp() }
    for _ in 0..<2 {
      _ = try seed { $0 = String($0.prefix(10)) }
      _ = try makeStore().load()
    }
    #expect(setAsideCopies().count == 2)
  }

  @Test func eraseRemovesTheSetAsideCopies() async throws {
    defer { cleanUp() }
    _ = try seed { $0 = String($0.prefix(10)) }
    let store = makeStore()
    let service = service(store)
    try service.restore()
    try await service.connect(provider: .openrouter, key: secret)
    #expect(!setAsideCopies().isEmpty)
    try EraseLocalData(service: service).run()
    #expect(files().isEmpty)
    #expect(service.setAsideFile == nil)
  }

  // MARK: preferences.json

  @Test func aTruncatedPreferencesFileIsMovedAsideNotOverwritten() throws {
    defer { cleanUp() }
    let prefsURL = folder.appendingPathComponent("preferences.json")
    let store = JSONFilePreferencesStore(url: prefsURL, now: { self.setAsideAt })
    try store.save(Preferences(loginPromptAnswered: true, automaticUpdateChecks: true))
    let full = try Data(contentsOf: prefsURL)
    try full.prefix(full.count - 5).write(to: prefsURL)
    #expect(store.load() == Preferences())
    try store.save(Preferences(alertsPromptAnswered: true))
    let copy = try #require(files().first { $0.hasPrefix("preferences-unreadable-") })
    #expect(try Data(contentsOf: folder.appendingPathComponent(copy)) == full.prefix(full.count - 5))
    try store.erase()
    #expect(files().isEmpty)
  }

  @Test func validPreferencesAreNotCopied() throws {
    defer { cleanUp() }
    let prefsURL = folder.appendingPathComponent("preferences.json")
    let store = JSONFilePreferencesStore(url: prefsURL)
    try store.save(Preferences(loginPromptAnswered: true))
    #expect(store.load().loginPromptAnswered)
    #expect(files() == ["preferences.json"])
  }
}
