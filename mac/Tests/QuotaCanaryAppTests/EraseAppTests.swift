import CryptoKit
import Foundation
@testable import QuotaCanary
import QuotaCanaryCore
import Testing

@MainActor @Suite struct EraseAppTests {
  @Test func eraseReturnsRunningAppToFirstRun() async throws {
    let h = try Harness()
    #expect(h.model.eraseLocalData() == nil)
    #expect(!h.updater.automaticChecks)
    h.clock.advance(by: 2 * UpdateFeed.automaticInterval)
    await h.updater.settle()
    #expect(h.transport.requests.isEmpty)
    #expect(!h.folderExists)
    await h.connect()
    #expect(h.model.connections.count == 1)
    #expect(h.model.showsLoginPrompt)
    #expect(h.model.showsAlertsPrompt)
    #expect(h.model.showsUpdatePrompt)
  }

  @Test func queuedCheckIsCancelledBeforeItCanRequestTheFeed() async throws {
    let h = try Harness()
    h.clock.advance(by: UpdateFeed.automaticInterval)
    #expect(h.model.eraseLocalData() == nil)
    for _ in 0..<20 { await Task.yield() }
    #expect(h.transport.requests.isEmpty)
    #expect(h.updater.status == .idle)
    #expect(!h.folderExists)
  }

  @Test(arguments: [false, true])
  func lateFeedCannotResurrectPreferencesAndManualChecksStillWork(folderRemovalFails: Bool) async throws {
    let gate = HeldUpdateTransport()
    let h = try Harness(updateTransport: gate)
    gate.response = h.response
    let oldCheck = Task { await h.updater.checkNow() }
    for _ in 0..<1000 where gate.held == nil { await Task.yield() }
    #expect(gate.held != nil)
    let error = h.model.eraseLocalData(removeFolder: { folder in
      if folderRemovalFails { throw EraseError.failed }
      try FileManager.default.removeItem(at: folder)
    })
    #expect(error == (folderRemovalFails ? Copy.eraseFailed : nil))
    gate.held?.resume(returning: h.response)
    await oldCheck.value
    h.clock.advance(by: 2 * UpdateFeed.automaticInterval)
    #expect(gate.calls == 1)
    #expect(h.updater.status == .idle)
    #expect(h.updater.lastCheckAt == nil)
    #expect(h.folderExists == folderRemovalFails)
    #expect(!FileManager.default.fileExists(atPath: h.folder.appendingPathComponent("preferences.json").path))
    // A new explicit check still works after cancellation.
    gate.hold = false
    await h.updater.checkNow()
    #expect(gate.calls == 2)
    #expect(h.updater.lastCheckAt == h.clock.now)
  }

  @Test func oldCompletionCannotOverwriteANewerManualCheck() async throws {
    let gate = HeldUpdateTransport()
    let h = try Harness(updateTransport: gate)
    gate.response = h.response
    let oldCheck = Task { await h.updater.checkNow() }
    for _ in 0..<1000 where gate.held == nil { await Task.yield() }
    #expect(gate.held != nil)
    #expect(h.model.eraseLocalData() == nil)
    gate.hold = false
    await h.updater.checkNow()
    let checkedAt = try #require(h.updater.lastCheckAt)
    h.clock.advance(by: 60)
    gate.held?.resume(returning: h.response)
    await oldCheck.value
    #expect(h.updater.lastCheckAt == checkedAt)
    #expect(h.updater.status == .upToDate(checkedAt: checkedAt))
    #expect(!h.updater.automaticChecks)
  }

  @Test func lateDownloadIsDiscardedWithoutRestoringReadyState() async throws {
    let gate = HeldUpdateTransport()
    gate.hold = false
    gate.holdDownload = true
    let h = try Harness(updateTransport: gate, version: "0.2.0")
    gate.response = h.response
    let check = Task { await h.updater.checkNow() }
    for _ in 0..<1000 where gate.downloadHeld == nil { await Task.yield() }
    #expect(gate.downloadHeld != nil)
    #expect(h.updater.status == .downloading(version: "0.2.0"))
    #expect(h.model.eraseLocalData() == nil)
    gate.downloadHeld?.resume()
    await check.value
    #expect(h.updater.status == .idle)
    #expect(h.updater.ready == nil)
    #expect(h.updater.lastCheckAt == nil)
    #expect(!h.folderExists)
    #expect(try FileManager.default.contentsOfDirectory(atPath: h.downloads.path).isEmpty)
  }

  @Test func resetReadsCurrentOSStateWithoutChangingIt() async throws {
    let h = try Harness()
    h.login.status = .enabled
    h.notifier.permission = .denied
    #expect(h.model.eraseLocalData() == nil)
    await h.connect()
    #expect(!h.model.startAtLogin.promptAnswered)
    #expect(!h.model.notifications.promptAnswered)
    #expect(h.model.startAtLogin.status == .enabled)
    #expect(h.model.notifications.permission == .denied)
    #expect(!h.model.showsLoginPrompt)
    #expect(!h.model.showsAlertsPrompt)
    #expect(h.model.showsUpdatePrompt)
    #expect(h.login.registerCalls == 0)
    #expect(h.notifier.requestCalls == 0)
  }

  @Test func folderCleanupFailureStillRetiresErasedPreferences() async throws {
    let h = try Harness()
    let error = h.model.eraseLocalData(removeFolder: { _ in throw EraseError.failed })
    #expect(error == Copy.eraseFailed)
    #expect(h.folderExists) // The failed final removal is not hidden.
    #expect(!h.updater.automaticChecks)
    #expect(!h.model.startAtLogin.promptAnswered)
    #expect(!h.model.notifications.promptAnswered)
    h.clock.advance(by: 2 * UpdateFeed.automaticInterval)
    await h.updater.settle()
    #expect(h.transport.requests.isEmpty)
    #expect(!FileManager.default.fileExists(atPath: h.folder.appendingPathComponent("preferences.json").path))
  }

  @Test func refusingCredentialCleanupKeepsTheAppHonest() async throws {
    let h = try Harness()
    await h.connect()
    h.credentials.failing = true
    #expect(h.model.eraseLocalData() == Copy.eraseFailed)
    #expect(h.model.connections.count == 1)
    #expect(h.updater.automaticChecks)
    #expect(h.model.startAtLogin.promptAnswered)
    #expect(h.model.notifications.promptAnswered)
    #expect(h.folderExists)
  }
}

@MainActor private final class Harness {
  let root = FileManager.default.temporaryDirectory.appendingPathComponent("qc-erase-app-\(UUID())")
  var folder: URL { root.appendingPathComponent("app-data") }
  var downloads: URL { root.appendingPathComponent("downloads") }
  let clock = ManualClock(now: Date())
  let transport = FakeUpdateTransport()
  let credentials = InMemoryCredentialStore()
  let login = FakeLoginItem()
  let notifier = FakeNotificationCenter(permission: .notAsked)
  let updater: Updater
  let model: AppModel
  let response: HTTPResponse

  init(updateTransport: UpdateTransport? = nil, version: String = "0.1.0") throws {
    let folder = root.appendingPathComponent("app-data")
    let downloads = root.appendingPathComponent("downloads")
    let prefs = JSONFilePreferencesStore(url: folder.appendingPathComponent("preferences.json"))
    try prefs.save(Preferences(loginPromptAnswered: true, alertsPromptAnswered: true,
                              automaticUpdateChecks: true, updatePromptAnswered: true, lastUpdateCheckAt: clock.now))
    let key = Curve25519.Signing.PrivateKey()
    let entry = try UpdateEntry.signed(version: version, url: "https://example.com/update.zip", archive: Data(), key: key)
    let body = try JSONEncoder().encode(entry)
    response = HTTPResponse(status: 200, body: body)
    transport.feed = .respond(status: 200, body: body)
    updater = Updater(transport: updateTransport ?? transport, installer: FakeUpdateInstaller(), clock: clock,
                      preferences: prefs, currentVersion: "0.1.0", publicKey: key.publicKey,
                      downloads: downloads)
    let service = MonitoringService(credentials: credentials, store: InMemoryConnectionStore(),
                                    transport: ScriptedTransport([Scenarios.hunterOK]))
    model = AppModel(service: service, system: SystemHooks(clock: clock, lifecycle: ManualLifecycle(),
      reachability: ScriptedReachability(online: true), loginItem: login, preferences: prefs,
      notifier: notifier, updater: updater))
    model.eraseFolder = folder
  }

  deinit { try? FileManager.default.removeItem(at: root) }
  var folderExists: Bool { FileManager.default.fileExists(atPath: folder.path) }
  func connect() async {
    model.provider = .hunter
    model.keyInput = "synthetic-key"
    await model.connect()
    await model.notifications.reload()
  }
}

/// Intentionally ignores task cancellation, to exercise stale completion guards.
private final class HeldUpdateTransport: UpdateTransport, @unchecked Sendable {
  var held: CheckedContinuation<HTTPResponse, Never>?
  var calls = 0
  var hold = true
  var holdDownload = false
  var downloadHeld: CheckedContinuation<Void, Never>?
  var response = HTTPResponse(status: 200, body: Data())
  func fetch(_ url: URL, headers: [String: String]) async throws -> HTTPResponse {
    calls += 1
    if hold { return await withCheckedContinuation { held = $0 } }
    return response
  }
  func download(_ url: URL, headers: [String: String], to destination: URL) async throws {
    guard holdDownload else { throw UpdateFailure.downloadFailed }
    await withCheckedContinuation { downloadHeld = $0 }
    try Data().write(to: destination)
  }
}
