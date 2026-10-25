import Foundation
@testable import QuotaCanaryCore
import Testing

/// QUO-129: several named connections to one provider, rename, key
/// replacement, removal, and results that land after a removal.
private let workKey = "hunter-work-SYNTHETIC-MARKER"
private let homeKey = "hunter-home-SYNTHETIC-MARKER"
private let newKey = "hunter-new-SYNTHETIC-MARKER"

/// Hunter with `left` verifications remaining (of 1,000) and no searches.
private func hunterBody(left: Int) -> String {
  #"{"data":{"requests":{"searches":{"used":0,"available":0},"verifications":{"used":\#(1000 - left),"available":1000}}}}"#
}

private func hunterOK(left: Int) -> ScriptedTransport.Step { .respond(status: 200, body: hunterBody(left: left)) }

private func verifications(_ connection: Connection?) -> Double? {
  connection?.lastReading?.balances.first { $0.pool.creditType == "verifications" }?.balance
}

/// Waits (bounded) until a held request is parked on its gate.
@MainActor
private func waitUntilArrived(_ gate: ScriptedTransport.Gate) async {
  for _ in 0..<10_000 where !gate.arrived {
    await Task.yield()
  }
  #expect(gate.arrived)
}

/// Saves normally until `failAfter` saves have succeeded, then fails every
/// save. Reads and deletes behave like the in-memory store.
private final class FlakyCredentialStore: CredentialStore {
  var items: [String: String] = [:]
  var failAfter = Int.max
  private var saves = 0

  func save(_ secret: String, ref: String) throws {
    saves += 1
    if saves > failAfter { throw CredentialStoreError.status(-25308) }
    items[ref] = secret
  }

  func read(ref: String) throws -> String {
    guard let secret = items[ref] else { throw CredentialStoreError.notFound }
    return secret
  }

  func delete(ref: String) throws { items[ref] = nil }
  func deleteAll() throws { items = [:] }
}

@MainActor @Suite struct NamedConnectionsTests {
  // MARK: Two connections to one provider

  @Test func twoHunterConnectionsKeepSeparateIdentityCredentialsAndReadings() async throws {
    let h = Harness(hunter: [hunterOK(left: 900), hunterOK(left: 300), hunterOK(left: 250)])
    let work = try await h.service.connect(provider: .hunter, key: workKey)
    let home = try await h.service.connect(provider: .hunter, key: homeKey, name: "  Home  ")

    #expect(work.name == "Hunter")
    #expect(home.name == "Home")
    #expect([work.id, home.id] == ["conn-1", "conn-2"])
    #expect(work.credentialRef != home.credentialRef)
    #expect(h.credentials.items == ["conn-1": workKey, "conn-2": homeKey])
    #expect(verifications(work) == 900)
    #expect(verifications(home) == 300)

    // Settings are per connection, even for the same pool of the same provider.
    let tight = PoolSettings(monitored: true, low: 400, critical: 100)
    try h.service.updatePoolSettings([PoolKey(connectionID: "conn-2", creditType: "verifications"): tight])
    #expect(h.service.connections.map { $0.poolSettings["verifications"] } == [nil, tight])

    // Refreshing one reads with its own key and leaves the other exactly as it was.
    let workBefore = h.service.connections[0]
    h.clock = t0.addingTimeInterval(60)
    let refreshed = try await h.service.refresh(id: "conn-2")
    #expect(h.hunter.requests.last?.headers["Authorization"] == "Bearer \(homeKey)")
    #expect(verifications(refreshed) == 250)
    #expect(refreshed.poolSettings["verifications"] == tight)
    #expect(h.service.connections[0] == workBefore)
    #expect(try h.store.load() == h.service.connections)
  }

  @Test func secondConnectionWithoutANameGetsANumberedOne() async throws {
    let h = Harness()
    try await h.service.connect(provider: .hunter, key: workKey)
    let second = try await h.service.connect(provider: .hunter, key: homeKey, name: "   ")
    #expect(second.name == "Hunter 2")
    // A different provider can reuse the name: uniqueness is per provider.
    let openRouter = try await h.service.connect(provider: .openrouter, key: secret, name: "Hunter")
    #expect(openRouter.name == "Hunter")
    #expect(ConnectionNames.suggested(for: .hunter, among: h.service.connections) == "Hunter 3")
    #expect(ConnectionNames.suggested(for: .tavily, among: h.service.connections) == "Tavily")
  }

  @Test func connectRefusesATakenNameBeforeAnyRead() async throws {
    let h = Harness()
    try await h.service.connect(provider: .hunter, key: workKey, name: "Client Work")
    let requests = h.hunter.requests.count
    let bytes = h.store.bytes
    let error = await monitorError {
      try await h.service.connect(provider: .hunter, key: homeKey, name: " client work ")
    }
    #expect(error == .invalidName(.taken(provider: .hunter, name: "client work")))
    #expect(error?.message == "Another Hunter connection is already called client work.")
    #expect(h.hunter.requests.count == requests)
    #expect(h.store.bytes == bytes)
    #expect(h.credentials.items == ["conn-1": workKey])
  }

  @Test func nameRules() {
    let existing = [
      Connection(id: "a", provider: .hunter, name: "Hunter", credentialRef: "a", lastReading: nil),
      Connection(id: "b", provider: .hunter, name: "Hunter 2", credentialRef: "b", lastReading: nil),
    ]
    #expect(ConnectionNames.validate(" \n", provider: .hunter, among: existing) == .empty)
    #expect(ConnectionNames.validate(String(repeating: "x", count: 41), provider: .hunter, among: existing) == .tooLong)
    #expect(ConnectionNames.validate(String(repeating: "x", count: 40), provider: .hunter, among: existing) == nil)
    #expect(ConnectionNames.validate("HUNTER", provider: .hunter, among: existing) == .taken(provider: .hunter, name: "HUNTER"))
    #expect(ConnectionNames.validate("HUNTER", provider: .hunter, among: existing, excluding: "a") == nil)
    #expect(ConnectionNames.validate("Hunter", provider: .apollo, among: existing) == nil)
    #expect(ConnectionNames.suggested(for: .hunter, among: existing) == "Hunter 3")
    #expect(NameError.empty.message == "Give it a name.")
    #expect(NameError.tooLong.message == "Keep it to 40 characters.")
  }

  // MARK: Rename

  @Test func renameChangesOnlyTheNameAndSurvivesRelaunch() async throws {
    let h = Harness(hunter: [hunterOK(left: 900), hunterOK(left: 300), hunterOK(left: 200)])
    try await h.service.connect(provider: .hunter, key: workKey)
    try await h.service.connect(provider: .hunter, key: homeKey)
    let tight = PoolSettings(monitored: false, low: 400, critical: 100)
    try h.service.updatePoolSettings([PoolKey(connectionID: "conn-2", creditType: "verifications"): tight])
    let before = h.service.connections
    let requests = h.hunter.requests.count

    let renamed = try h.service.rename(id: "conn-2", to: "  Client work ")
    #expect(renamed.name == "Client work")
    #expect(renamed.id == "conn-2")
    #expect(renamed.credentialRef == before[1].credentialRef)
    #expect(renamed.lastReading == before[1].lastReading)
    #expect(renamed.poolSettings == before[1].poolSettings)
    #expect(h.service.connections[0] == before[0])
    #expect(h.credentials.items == ["conn-1": workKey, "conn-2": homeKey])
    #expect(h.hunter.requests.count == requests) // no provider read, no Keychain

    // A refresh does not bring the old name back.
    let refreshed = try await h.service.refresh(id: "conn-2")
    #expect(refreshed.name == "Client work")

    let restored = try h.makeService().restore()
    #expect(restored.map(\.id) == ["conn-1", "conn-2"])
    #expect(restored.map(\.name) == ["Hunter", "Client work"])
    #expect(restored[1].poolSettings["verifications"] == tight)
  }

  @Test func renameToATakenOrBlankNameChangesNothing() async throws {
    let h = Harness()
    try await h.service.connect(provider: .hunter, key: workKey)
    try await h.service.connect(provider: .hunter, key: homeKey)
    let bytes = h.store.bytes
    #expect(throws: MonitorError.invalidName(.taken(provider: .hunter, name: "hunter"))) {
      try h.service.rename(id: "conn-2", to: "hunter")
    }
    #expect(throws: MonitorError.invalidName(.empty)) { try h.service.rename(id: "conn-2", to: "  ") }
    #expect(throws: MonitorError.notConnected) { try h.service.rename(id: "conn-9", to: "Other") }
    #expect(h.store.bytes == bytes)
    #expect(h.service.connections.map(\.name) == ["Hunter", "Hunter 2"])

    // Re-casing its own name is fine.
    #expect(try h.service.rename(id: "conn-1", to: "HUNTER").name == "HUNTER")
  }

  @Test func renameWithFailedSaveKeepsTheOldName() async throws {
    let h = Harness()
    try await h.service.connect(provider: .hunter, key: workKey)
    h.store.failSaves = true
    #expect(throws: MonitorError.saveFailed) { try h.service.rename(id: "conn-1", to: "Work") }
    #expect(h.service.connections.first?.name == "Hunter")
    #expect(try h.store.load().first?.name == "Hunter")
  }

  @Test func renameThroughTheJSONFileNeverDuplicatesRecords() async throws {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("qc-\(UUID().uuidString)")
    defer { try? FileManager.default.removeItem(at: dir) }
    let url = dir.appendingPathComponent("QuotaCanary/connections.json")
    let credentials = InMemoryCredentialStore()
    let transport = RoutedTransport(["api.hunter.io": ScriptedTransport([hunterOK(left: 700)])])
    let service = MonitoringService(credentials: credentials, store: JSONFileConnectionStore(url: url), transport: transport)
    let a = try await service.connect(provider: .hunter, key: workKey)
    let b = try await service.connect(provider: .hunter, key: homeKey)
    try service.rename(id: b.id, to: "Client work")
    try service.rename(id: b.id, to: "Client work 2026")
    try service.rename(id: a.id, to: "Agency")

    let relaunched = MonitoringService(credentials: credentials, store: JSONFileConnectionStore(url: url), transport: transport)
    let restored = try relaunched.restore()
    #expect(restored.map(\.id) == [a.id, b.id])
    #expect(restored.map(\.name) == ["Agency", "Client work 2026"])
    #expect(restored.map(\.credentialRef) == [a.credentialRef, b.credentialRef])

    let json = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any]
    let ids = (json?["connections"] as? [[String: Any]])?.compactMap { $0["id"] as? String } ?? []
    #expect(ids.count == 2)
    #expect(Set(ids).count == 2)
    let text = try String(contentsOf: url, encoding: .utf8)
    #expect(!text.contains(workKey) && !text.contains(homeKey))
  }

  // MARK: Key replacement

  @Test func replaceKeyValidatesFirstThenSwapsInPlace() async throws {
    let h = Harness(hunter: [hunterOK(left: 900), hunterOK(left: 300), hunterOK(left: 640), hunterOK(left: 630)])
    try await h.service.connect(provider: .hunter, key: workKey)
    try await h.service.connect(provider: .hunter, key: homeKey, name: "Home")
    let tight = PoolSettings(monitored: true, low: 700, critical: 200)
    try h.service.updatePoolSettings([PoolKey(connectionID: "conn-1", creditType: "verifications"): tight])
    let other = h.service.connections[1]

    h.clock = t0.addingTimeInterval(90)
    let replaced = try await h.service.replaceKey(id: "conn-1", key: "  \(newKey)\n")
    #expect(h.hunter.requests.last?.headers["Authorization"] == "Bearer \(newKey)")
    #expect(replaced.id == "conn-1")
    #expect(replaced.name == "Hunter")
    #expect(replaced.credentialRef == "conn-1")
    #expect(replaced.poolSettings["verifications"] == tight)
    #expect(verifications(replaced) == 640)
    #expect(replaced.lastReading?.checkedAt == h.clock)
    #expect(h.credentials.items == ["conn-1": newKey, "conn-2": homeKey])
    #expect(h.service.connections[1] == other)
    #expect(try h.store.load() == h.service.connections)

    // After a relaunch the connection reads with the new key.
    let relaunched = h.makeService()
    try relaunched.restore()
    try await relaunched.refresh(id: "conn-1")
    #expect(h.hunter.requests.last?.headers["Authorization"] == "Bearer \(newKey)")
  }

  @Test func rejectedReplacementKeyChangesNothing() async throws {
    let h = Harness(hunter: [hunterOK(left: 900), .respond(status: 401, body: "{}"), hunterOK(left: 880)])
    let original = try await h.service.connect(provider: .hunter, key: workKey)
    let bytes = h.store.bytes
    let error = await monitorError { try await h.service.replaceKey(id: "conn-1", key: newKey) }
    #expect(error == .provider(.hunter, .keyRejected))
    #expect(h.credentials.items == ["conn-1": workKey])
    #expect(h.store.bytes == bytes)
    #expect(h.service.connections == [original])

    // The old key still works.
    try await h.service.refresh(id: "conn-1")
    #expect(h.hunter.requests.last?.headers["Authorization"] == "Bearer \(workKey)")
  }

  @Test func emptyReplacementKeyFailsBeforeAnyRead() async throws {
    let h = Harness()
    try await h.service.connect(provider: .hunter, key: workKey)
    let requests = h.hunter.requests.count
    #expect(await monitorError { try await h.service.replaceKey(id: "conn-1", key: " ") } == .missingKey)
    #expect(await monitorError { try await h.service.replaceKey(id: "conn-9", key: newKey) } == .notConnected)
    #expect(h.hunter.requests.count == requests)
  }

  @Test func keychainFailureDuringReplacementKeepsTheOldKey() async throws {
    let h = Harness()
    let original = try await h.service.connect(provider: .hunter, key: workKey)
    let bytes = h.store.bytes
    h.credentials.failing = true
    #expect(await monitorError { try await h.service.replaceKey(id: "conn-1", key: newKey) } == .credentialWriteFailed)
    h.credentials.failing = false
    #expect(h.credentials.items == ["conn-1": workKey])
    #expect(h.store.bytes == bytes)
    #expect(h.service.connections == [original])
  }

  @Test func diskFailureDuringReplacementPutsTheOldKeyBack() async throws {
    let h = Harness()
    let original = try await h.service.connect(provider: .hunter, key: workKey)
    h.store.failSaves = true
    #expect(await monitorError { try await h.service.replaceKey(id: "conn-1", key: newKey) } == .saveFailed)
    #expect(h.credentials.items == ["conn-1": workKey])
    #expect(h.service.connections == [original])
  }

  @Test func replacementThatCannotBeUndoneSaysTheNewKeyIsLive() async throws {
    let credentials = FlakyCredentialStore()
    let store = InMemoryConnectionStore()
    let service = MonitoringService(
      credentials: credentials, store: store,
      transport: RoutedTransport(["api.hunter.io": ScriptedTransport([hunterOK(left: 900)])]),
      makeID: { "only" }
    )
    let original = try await service.connect(provider: .hunter, key: workKey)
    credentials.failAfter = 2 // the new key saves, putting the old one back fails
    store.failSaves = true
    let error = await monitorError { try await service.replaceKey(id: "only", key: newKey) }
    #expect(error == .keyReplacedReadingNotSaved)
    #expect(error?.message == "New key saved to Keychain, but its balances couldn't be saved to disk.")
    #expect(credentials.items == ["only": newKey])
    // The saved record still points at the same Keychain item, so it stays usable.
    #expect(service.connections == [original])
  }

  // MARK: Removal

  @Test func removingOneOfTwoHunterConnectionsDeletesOnlyItsKeyAndRecord() async throws {
    let h = Harness()
    try await h.service.connect(provider: .hunter, key: workKey)
    let home = try await h.service.connect(provider: .hunter, key: homeKey, name: "Home")
    try h.service.remove(id: "conn-1")
    #expect(h.service.connections == [home])
    #expect(h.credentials.items == ["conn-2": homeKey])
    #expect(try h.store.load() == [home])
    #expect(try h.makeService().restore() == [home])
  }

  @Test func removalWithAFailedKeychainDeleteKeepsTheRecordAndSaysSo() async throws {
    let h = Harness()
    try await h.service.connect(provider: .hunter, key: workKey)
    try await h.service.connect(provider: .hunter, key: homeKey)
    let before = h.service.connections
    let bytes = h.store.bytes
    h.credentials.failing = true
    #expect(throws: MonitorError.credentialDeleteFailed) { try h.service.remove(id: "conn-2") }
    #expect(MonitorError.credentialDeleteFailed.message == "Couldn't remove the key from Keychain.")
    h.credentials.failing = false
    #expect(h.service.connections == before)
    #expect(h.store.bytes == bytes)
    #expect(h.credentials.items == ["conn-1": workKey, "conn-2": homeKey])
  }

  @Test func removalWithAFailedDiskSaveReportsIt() async throws {
    let h = Harness()
    try await h.service.connect(provider: .hunter, key: workKey)
    h.store.failSaves = true
    #expect(throws: MonitorError.saveFailed) { try h.service.remove(id: "conn-1") }
    // The key is gone, so the error is shown rather than a clean removal claimed.
    #expect(h.credentials.items.isEmpty)
  }

  // MARK: Results that land after a removal

  @Test func refreshThatLandsAfterRemovalWritesNothing() async throws {
    let gate = ScriptedTransport.Gate(status: 200, body: hunterBody(left: 100))
    let h = Harness(hunter: [hunterOK(left: 900), .held(gate)])
    try await h.service.connect(provider: .hunter, key: workKey)

    let inFlight = Task { await monitorError { try await h.service.refresh(id: "conn-1") } }
    await waitUntilArrived(gate)
    try h.service.remove(id: "conn-1")
    #expect(try h.store.load().isEmpty)
    gate.open()

    #expect(await inFlight.value == .notConnected)
    #expect(h.service.connections.isEmpty)
    #expect(try h.store.load().isEmpty)
    #expect(h.credentials.items.isEmpty)
    #expect(try h.makeService().restore().isEmpty)
  }

  @Test func refreshOfTheSurvivorAfterRemovingItsSiblingKeepsOnlyTheSurvivor() async throws {
    let gate = ScriptedTransport.Gate(status: 200, body: hunterBody(left: 100))
    let h = Harness(hunter: [hunterOK(left: 900), hunterOK(left: 300), .held(gate)])
    try await h.service.connect(provider: .hunter, key: workKey)
    try await h.service.connect(provider: .hunter, key: homeKey)

    let inFlight = Task { try await h.service.refresh(id: "conn-2") }
    await waitUntilArrived(gate)
    try h.service.remove(id: "conn-1")
    gate.open()

    let refreshed = try await inFlight.value
    #expect(verifications(refreshed) == 100)
    #expect(h.service.connections.map(\.id) == ["conn-2"])
    #expect(try h.store.load().map(\.id) == ["conn-2"])
    #expect(h.credentials.items == ["conn-2": homeKey])
  }

  @Test func keyReplacementThatLandsAfterRemovalRecreatesNothing() async throws {
    let gate = ScriptedTransport.Gate(status: 200, body: hunterBody(left: 100))
    let h = Harness(hunter: [hunterOK(left: 900), .held(gate)])
    try await h.service.connect(provider: .hunter, key: workKey)

    let inFlight = Task { await monitorError { try await h.service.replaceKey(id: "conn-1", key: newKey) } }
    await waitUntilArrived(gate)
    try h.service.remove(id: "conn-1")
    gate.open()

    #expect(await inFlight.value == .notConnected)
    #expect(h.credentials.items.isEmpty) // no Keychain item written back
    #expect(h.service.connections.isEmpty)
    #expect(try h.store.load().isEmpty)
  }

  // MARK: Privacy

  @Test func namesAndNewErrorsNeverLeakIntoDiagnosticsOrMessages() {
    let taken = MonitorError.invalidName(.taken(provider: .hunter, name: "Client work"))
    #expect(taken.diagnosticsCaseName == "invalidName")
    #expect(MonitorError.keyReplacedReadingNotSaved.diagnosticsCaseName == "keyReplacedReadingNotSaved")
    for error in [taken, .invalidName(.empty), .invalidName(.tooLong), .keyReplacedReadingNotSaved] {
      #expect(!error.message.contains(newKey))
      #expect(!error.message.contains("\u{2014}"))
    }
  }
}
