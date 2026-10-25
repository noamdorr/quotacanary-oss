import Foundation
@testable import QuotaCanaryCore
import Testing

let secret = "sk-or-SYNTHETIC-MARKER"
let ok = ScriptedTransport.Step.respond(status: 200, body: #"{"data":{"total_credits":20,"total_usage":7.5}}"#)
let t0 = Date(timeIntervalSince1970: 1_700_000_000)

@MainActor
final class Harness {
  let credentials = InMemoryCredentialStore()
  let store = InMemoryConnectionStore()
  let history = InMemoryReadingHistoryStore()
  /// OpenRouter's scripted responses.
  let transport: ScriptedTransport
  /// Hunter's scripted responses.
  let hunter: ScriptedTransport
  var clock = Date(timeIntervalSince1970: 1_700_000_000)
  var issuedIDs = 0
  lazy var service = makeService()

  init(
    _ steps: [ScriptedTransport.Step] = [ok],
    hunter hunterSteps: [ScriptedTransport.Step] = [.respond(status: 200, body: hunterFixture)]
  ) {
    transport = ScriptedTransport(steps)
    hunter = ScriptedTransport(hunterSteps)
  }

  func makeService() -> MonitoringService {
    MonitoringService(
      credentials: credentials, store: store, history: history,
      transport: RoutedTransport(["openrouter.ai": transport, "api.hunter.io": hunter]),
      now: { [unowned self] in self.clock },
      makeID: { [unowned self] in
        self.issuedIDs += 1
        return "conn-\(self.issuedIDs)"
      }
    )
  }

  var persisted: String { store.bytes.map { String(decoding: $0, as: UTF8.self) } ?? "" }
}

func monitorError(_ body: () async throws -> Void) async -> MonitorError? {
  do {
    try await body()
    return nil
  } catch {
    return error as? MonitorError
  }
}

@MainActor @Suite struct MonitoringServiceTests {
  @Test func connectStoresCredentialAndFirstReading() async throws {
    let h = Harness()
    let connection = try await h.service.connect(provider: .openrouter, key: "  \(secret)\n")
    #expect(connection.provider == .openrouter)
    #expect(connection.credentialRef == "conn-1")
    #expect(connection.lastReading?.balances.first?.balance == 12.5)
    #expect(connection.lastReading?.balances.first?.pool.creditType == "credits")
    #expect(connection.lastReading?.balances.first?.pool.unit == .usd)
    #expect(connection.lastReading?.checkedAt == t0)
    #expect(h.credentials.items == ["conn-1": secret])
    #expect(try h.store.load() == [connection])
  }

  @Test func connectWithEmptyKeyFailsBeforeAnyRead() async {
    let h = Harness()
    #expect(await monitorError { try await h.service.connect(provider: .openrouter, key: "  ") } == .missingKey)
    #expect(h.transport.requests.isEmpty)
    #expect(h.credentials.items.isEmpty)
    #expect(h.store.bytes == nil)
  }

  @Test func connectWithRejectedKeyStoresNothing() async {
    let h = Harness([.respond(status: 401, body: "{}")])
    let error = await monitorError { try await h.service.connect(provider: .openrouter, key: secret) }
    #expect(error == .provider(.openrouter, .keyRejected))
    #expect(h.credentials.items.isEmpty)
    #expect(h.store.bytes == nil)
    #expect(h.service.connections.isEmpty)
  }

  @Test func connectWithUnavailableKeychainFailsVisibly() async {
    let h = Harness()
    h.credentials.failing = true
    let error = await monitorError { try await h.service.connect(provider: .openrouter, key: secret) }
    #expect(error == .credentialWriteFailed)
    #expect(h.store.bytes == nil)
    #expect(h.service.connections.isEmpty)
  }

  @Test func connectWithFailedSaveRollsBackTheCredential() async {
    let h = Harness()
    h.store.failSaves = true
    let error = await monitorError { try await h.service.connect(provider: .openrouter, key: secret) }
    #expect(error == .saveFailed)
    #expect(h.credentials.items.isEmpty)
    #expect(h.service.connections.isEmpty)
  }

  @Test func refreshUpdatesReadingAndTimestamp() async throws {
    let h = Harness([ok, .respond(status: 200, body: #"{"data":{"total_credits":20,"total_usage":10}}"#)])
    try await h.service.connect(provider: .openrouter, key: secret)
    h.clock = t0.addingTimeInterval(300)
    let updated = try await h.service.refresh(id: "conn-1")
    #expect(updated.lastReading == Reading(balances: [PoolBalance(pool: OpenRouter.creditsPool, balance: 10)], checkedAt: h.clock))
    #expect(try h.store.load() == [updated])
    #expect(h.transport.requests.last?.headers["Authorization"] == "Bearer \(secret)")
  }

  @Test(arguments: [
    (ScriptedTransport.Step.fail, MonitorError.provider(.openrouter, .unreachable)),
    (.respond(status: 401, body: "{}"), .provider(.openrouter, .keyRejected)),
    (.respond(status: 500, body: "{}"), .provider(.openrouter, .httpStatus(500))),
    (.respond(status: 200, body: "not json"), .provider(.openrouter, .notJSON)),
    (.respond(status: 200, body: #"{"data":{"total_usage":3}}"#), .provider(.openrouter, .missingField("data.total_credits"))),
  ])
  func failedRefreshKeepsLastTrustworthyReading(step: ScriptedTransport.Step, expected: MonitorError) async throws {
    let h = Harness([ok, step])
    let original = try await h.service.connect(provider: .openrouter, key: secret)
    let savedBytes = h.store.bytes
    h.clock = t0.addingTimeInterval(600)
    #expect(await monitorError { try await h.service.refresh(id: "conn-1") } == expected)
    #expect(h.service.connections.first == original)
    #expect(h.service.connections.first?.lastReading?.checkedAt == t0)
    #expect(h.store.bytes == savedBytes)
  }

  @Test func refreshWithUnreadableKeychainKeepsReading() async throws {
    let h = Harness()
    let original = try await h.service.connect(provider: .openrouter, key: secret)
    h.credentials.failing = true
    #expect(await monitorError { try await h.service.refresh(id: "conn-1") } == .credentialReadFailed)
    #expect(h.service.connections.first == original)
  }

  @Test func refreshWithMissingCredentialSaysSo() async throws {
    let h = Harness()
    try await h.service.connect(provider: .openrouter, key: secret)
    try h.credentials.delete(ref: "conn-1")
    #expect(await monitorError { try await h.service.refresh(id: "conn-1") } == .credentialMissing)
  }

  @Test func refreshWithFailedSaveDoesNotClaimSuccess() async throws {
    let h = Harness()
    let original = try await h.service.connect(provider: .openrouter, key: secret)
    h.store.failSaves = true
    h.clock = t0.addingTimeInterval(60)
    #expect(await monitorError { try await h.service.refresh(id: "conn-1") } == .saveFailed)
    #expect(h.service.connections.first == original)
  }

  @Test func refreshWithoutConnectionFails() async {
    #expect(await monitorError { try await Harness().service.refresh(id: "missing") } == .notConnected)
  }

  @Test func relaunchRestoresConnectionAndReadsCredentialFromStore() async throws {
    let h = Harness()
    let original = try await h.service.connect(provider: .openrouter, key: secret)
    let relaunched = h.makeService()
    #expect(relaunched.connections.isEmpty)
    #expect(try relaunched.restore() == [original])
    h.clock = t0.addingTimeInterval(120)
    let refreshed = try await relaunched.refresh(id: "conn-1")
    #expect(refreshed.lastReading?.checkedAt == h.clock)
    #expect(h.transport.requests.last?.headers["Authorization"] == "Bearer \(secret)")
  }

  @Test func restoreWithCorruptStateFailsVisibly() throws {
    final class Corrupt: ConnectionStore {
      func load() throws -> [Connection] { throw ConnectionStoreFailure() }
      func save(_: [Connection]) throws {}
      func erase() throws {}
    }
    let service = MonitoringService(credentials: InMemoryCredentialStore(), store: Corrupt(), transport: ScriptedTransport([ok]))
    #expect(throws: MonitorError.loadFailed) { try service.restore() }
  }

  @Test func removeDeletesCredentialAndRecord() async throws {
    let h = Harness()
    try await h.service.connect(provider: .openrouter, key: secret)
    try h.service.remove(id: "conn-1")
    #expect(h.service.connections.isEmpty)
    #expect(h.credentials.items.isEmpty)
    #expect(try h.store.load().isEmpty)
    #expect(try h.makeService().restore().isEmpty)
  }

  @Test func removeWithUnavailableKeychainFailsVisibly() async throws {
    let h = Harness()
    let original = try await h.service.connect(provider: .openrouter, key: secret)
    h.credentials.failing = true
    #expect(throws: MonitorError.credentialDeleteFailed) { try h.service.remove(id: "conn-1") }
    #expect(h.service.connections.first == original)
  }

  @Test func secretNeverAppearsInPersistedStateOrMessages() async throws {
    let h = Harness([ok, .respond(status: 401, body: "{}")])
    let connection = try await h.service.connect(provider: .openrouter, key: secret)
    _ = await monitorError { try await h.service.refresh(id: "conn-1") }
    #expect(!h.persisted.isEmpty)
    #expect(!h.persisted.contains(secret))
    #expect(!String(describing: connection).contains(secret))
    #expect(!String(reflecting: h.service.connections).contains(secret))

    let allErrors: [MonitorError] = [
      .missingKey, .credentialWriteFailed, .credentialReadFailed, .credentialMissing,
      .credentialDeleteFailed, .saveFailed, .loadFailed, .notConnected,
      .provider(.openrouter, .unreachable), .provider(.openrouter, .keyRejected),
      .provider(.openrouter, .httpStatus(500)), .provider(.openrouter, .notJSON),
      .provider(.openrouter, .missingField("data.total_credits")),
    ]
    for error in allErrors {
      #expect(!error.message.contains(secret))
      #expect(!String(describing: error).contains(secret))
    }
  }

  @Test func jsonFileStoreRoundTripsWithoutSecret() async throws {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("qc-\(UUID().uuidString)")
    defer { try? FileManager.default.removeItem(at: dir) }
    let file = JSONFileConnectionStore(url: dir.appendingPathComponent("QuotaCanary/connections.json"))
    let credentials = InMemoryCredentialStore()
    let service = MonitoringService(credentials: credentials, store: file, transport: ScriptedTransport([ok]))
    let connection = try await service.connect(provider: .openrouter, key: secret)

    let bytes = try String(contentsOf: file.url, encoding: .utf8)
    #expect(!bytes.contains(secret))
    #expect(bytes.contains(#""credentialRef""#))
    let relaunched = MonitoringService(credentials: credentials, store: JSONFileConnectionStore(url: file.url), transport: ScriptedTransport([ok]))
    #expect(try relaunched.restore() == [connection])
  }

  @Test func jsonFileStoreSurfacesWriteFailure() async throws {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("qc-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: dir) }
    let blocker = dir.appendingPathComponent("not-a-dir")
    try Data("x".utf8).write(to: blocker)
    let file = JSONFileConnectionStore(url: blocker.appendingPathComponent("connections.json"))
    let credentials = InMemoryCredentialStore()
    let service = MonitoringService(credentials: credentials, store: file, transport: ScriptedTransport([ok]))
    #expect(await monitorError { try await service.connect(provider: .openrouter, key: secret) } == .saveFailed)
    #expect(credentials.items.isEmpty)
  }
}

private let hunterKey = "hunter-SYNTHETIC-MARKER"
private func key(_ connectionID: String, _ creditType: String) -> PoolKey {
  PoolKey(connectionID: connectionID, creditType: creditType)
}

@MainActor @Suite struct PoolSettingsServiceTests {
  @Test func connectHunterShowsBothPoolsWithStableIDsAndUnits() async throws {
    let h = Harness()
    let connection = try await h.service.connect(provider: .hunter, key: hunterKey)
    #expect(h.hunter.requests.first?.headers["Authorization"] == "Bearer \(hunterKey)")
    let rows = connection.poolRows
    #expect(rows.map(\.pool.creditType) == ["searches", "verifications"])
    #expect(rows.map(\.pool.unit) == [.credits, .credits])
    #expect(rows.map(\.balance) == [0, 520])
    // Zero-cap searches: not in plan, never "empty", never alerting.
    #expect(rows.map(\.status) == [.unavailable, .low])
    #expect(rows.map(\.alerts) == [false, true])
  }

  @Test func settingsSurviveRefreshAndRelaunch() async throws {
    let h = Harness(hunter: [
      .respond(status: 200, body: hunterFixture),
      .respond(status: 200, body: #"{"data":{"requests":{"searches":{"used":0,"available":0},"verifications":{"used":900,"available":1000}}}}"#),
    ])
    try await h.service.connect(provider: .hunter, key: hunterKey)
    let saved = PoolSettings(monitored: true, low: 600, critical: 100)
    try h.service.updatePoolSettings([key("conn-1", "verifications"): saved])

    let refreshed = try await h.service.refresh(id: "conn-1")
    #expect(refreshed.poolSettings == ["verifications": saved])
    #expect(refreshed.poolRows[1].status == .critical) // 100 left, critical at 100 inclusive

    let relaunched = h.makeService()
    let restored = try relaunched.restore()
    #expect(restored.first?.poolSettings == ["verifications": saved])
    #expect(restored.first?.poolRows[1].settings == saved)
    #expect(restored.first?.poolRows[0].settings == ProviderID.hunter.defaultSettings)
  }

  @Test func settingsAreScopedToTheirConnectionAndPool() async throws {
    let h = Harness()
    try await h.service.connect(provider: .openrouter, key: secret) // conn-1
    try await h.service.connect(provider: .hunter, key: hunterKey) // conn-2
    #expect(h.credentials.items == ["conn-1": secret, "conn-2": hunterKey])

    let verifications = PoolSettings(monitored: false, low: 300, critical: 50)
    try h.service.updatePoolSettings([key("conn-2", "verifications"): verifications])
    #expect(h.service.connections.map(\.poolSettings) == [[:], ["verifications": verifications]])

    let credits = PoolSettings(monitored: true, low: 40, critical: 10)
    try h.service.updatePoolSettings([key("conn-1", "credits"): credits])
    #expect(h.service.connections.map(\.poolSettings) == [["credits": credits], ["verifications": verifications]])

    // Refreshing one connection leaves the other's reading and settings alone.
    let hunterBefore = h.service.connections[1]
    h.clock = t0.addingTimeInterval(60)
    try await h.service.refresh(id: "conn-1")
    #expect(h.service.connections[1] == hunterBefore)
    #expect(try h.store.load() == h.service.connections)
  }

  @Test func legacyCriticalSurvivesReloadUntilThatBalanceIsSaved() async throws {
    let h = Harness()
    try await h.service.connect(provider: .hunter, key: hunterKey)
    let legacy = PoolSettings(monitored: true, low: 1500, critical: 200)
    try h.service.updatePoolSettings([key("conn-1", "verifications"): legacy])
    let relaunched = h.makeService()
    let restored = try #require(relaunched.restore().first)
    #expect(restored.settings(for: "verifications") == legacy)
    let pool = try #require(restored.poolRows.last?.pool)
    #expect(PoolStatus.of(PoolBalance(pool: pool, balance: 200), settings: legacy) == .critical)
    #expect(PoolStatus.of(PoolBalance(pool: pool, balance: 201), settings: legacy) == .low)
    let changed = try PoolSettingsDraft(monitored: true, low: "900").validated().get()
    try relaunched.updatePoolSettings([key("conn-1", "searches"): changed])
    #expect(try h.store.load().first?.settings(for: "verifications") == legacy)
    let saved = try PoolSettingsDraft(legacy).validated().get()
    try relaunched.updatePoolSettings([key("conn-1", "verifications"): saved])
    #expect(try h.store.load().first?.settings(for: "verifications").critical == 500)
  }

  @Test func invalidSettingsSaveNothing() async throws {
    let h = Harness()
    try await h.service.connect(provider: .hunter, key: hunterKey)
    let before = h.store.bytes
    let error = await monitorError {
      try h.service.updatePoolSettings([
        key("conn-1", "searches"): PoolSettings(monitored: true, low: 10, critical: 5),
        key("conn-1", "verifications"): PoolSettings(monitored: true, low: 5, critical: 5),
      ])
    }
    #expect(error == .invalidThresholds(.notANumber))
    #expect(error?.message == "Enter a number above zero.")
    #expect(h.store.bytes == before)
    #expect(h.service.connections.first?.poolSettings == [:])

    #expect(throws: MonitorError.invalidThresholds(.notANumber)) {
      try h.service.updatePoolSettings([key("conn-1", "searches"): PoolSettings(monitored: true, low: .nan, critical: 1)])
    }
  }

  @Test func settingsForAnUnknownConnectionFailWithoutSaving() async throws {
    let h = Harness()
    try await h.service.connect(provider: .hunter, key: hunterKey)
    let before = h.store.bytes
    #expect(throws: MonitorError.notConnected) {
      try h.service.updatePoolSettings([key("conn-9", "searches"): PoolSettings(monitored: true, low: 10, critical: 5)])
    }
    #expect(h.store.bytes == before)
  }

  @Test func failedSettingsSaveKeepsPreviousSettings() async throws {
    let h = Harness()
    try await h.service.connect(provider: .hunter, key: hunterKey)
    h.store.failSaves = true
    #expect(throws: MonitorError.saveFailed) {
      try h.service.updatePoolSettings([key("conn-1", "searches"): PoolSettings(monitored: false, low: 10, critical: 5)])
    }
    #expect(h.service.connections.first?.poolSettings == [:])
  }

  @Test func monitoringChoiceIsIndependentOfWhetherThePoolIsReported() async throws {
    let h = Harness(hunter: [
      .respond(status: 200, body: hunterFixture),
      .respond(status: 200, body: #"{"data":{"requests":{"verifications":{"used":1,"available":1000}}}}"#),
      .respond(status: 200, body: #"{"data":{"requests":{"searches":{"used":10,"available":25},"verifications":{"used":1,"available":1000}}}}"#),
    ])
    try await h.service.connect(provider: .hunter, key: hunterKey)
    let off = PoolSettings(monitored: false, low: 10, critical: 2)
    try h.service.updatePoolSettings([key("conn-1", "searches"): off])

    let missing = try await h.service.refresh(id: "conn-1")
    #expect(missing.poolRows.map(\.status) == [.unknown, .low]) // 999 left, default Low is 1500
    #expect(missing.poolRows[0].settings == off)

    let back = try await h.service.refresh(id: "conn-1")
    #expect(back.poolRows[0].balance == 15)
    #expect(back.poolRows[0].settings == off)
    #expect(!back.poolRows[0].alerts)
  }

  @Test func removingOneConnectionKeepsTheOther() async throws {
    let h = Harness()
    try await h.service.connect(provider: .openrouter, key: secret)
    let hunter = try await h.service.connect(provider: .hunter, key: hunterKey)
    try h.service.remove(id: "conn-1")
    #expect(h.service.connections == [hunter])
    #expect(h.credentials.items == ["conn-2": hunterKey])
    #expect(try h.store.load() == [hunter])
  }

  @Test func stateWrittenBeforePoolSettingsStillLoads() throws {
    let legacy = #"""
    {"connections":[{"credentialRef":"c1","id":"c1","name":"OpenRouter","provider":"openrouter",
    "lastReading":{"checkedAt":700000000,"balances":[{"balance":12.5,"pool":{"creditType":"credits","label":"Credits","unit":"usd"}}]}}],
    "version":1}
    """#
    let connections = try StateCoding.decode(Data(legacy.utf8))
    #expect(connections.first?.poolSettings == [:])
    #expect(connections.first?.poolRows.first?.settings == ProviderID.openrouter.defaultSettings)
    #expect(connections.first?.poolRows.first?.status == .low)
  }

  @Test func settingsRoundTripThroughTheJSONFile() async throws {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("qc-\(UUID().uuidString)")
    defer { try? FileManager.default.removeItem(at: dir) }
    let url = dir.appendingPathComponent("QuotaCanary/connections.json")
    let credentials = InMemoryCredentialStore()
    let transport = RoutedTransport(["api.hunter.io": ScriptedTransport([.respond(status: 200, body: hunterFixture)])])
    let service = MonitoringService(credentials: credentials, store: JSONFileConnectionStore(url: url), transport: transport)
    let connection = try await service.connect(provider: .hunter, key: hunterKey)
    let saved = PoolSettings(monitored: false, low: 2.5, critical: 0)
    try service.updatePoolSettings([PoolKey(connectionID: connection.id, creditType: "searches"): saved])

    let relaunched = MonitoringService(credentials: credentials, store: JSONFileConnectionStore(url: url), transport: transport)
    #expect(try relaunched.restore().first?.poolSettings == ["searches": saved])
    #expect(!(try String(contentsOf: url, encoding: .utf8)).contains(hunterKey))
  }
}
