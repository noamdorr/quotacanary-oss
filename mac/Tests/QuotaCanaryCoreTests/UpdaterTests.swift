import CryptoKit
import Foundation
@testable import QuotaCanaryCore
import Testing

// QUO-139. Every feed and archive here is signed with a throwaway key made per
// test; the production key's private half never leaves ~/.config.

private let marker = "sk-or-SYNTHETIC-UPDATE-MARKER"
private let archiveBytes = Data("QuotaCanary 0.2.0 archive bytes".utf8)

private final class SpyCredentialStore: CredentialStore {
  let inner = InMemoryCredentialStore()
  private(set) var calls = 0
  func save(_ secret: String, ref: String) throws { calls += 1; try inner.save(secret, ref: ref) }
  func read(ref: String) throws -> String { calls += 1; return try inner.read(ref: ref) }
  func delete(ref: String) throws { calls += 1; try inner.delete(ref: ref) }
  func deleteAll() throws { calls += 1; try inner.deleteAll() }
}

private final class SpyConnectionStore: ConnectionStore {
  let inner = InMemoryConnectionStore()
  private(set) var calls = 0
  func load() throws -> [Connection] { calls += 1; return try inner.load() }
  func save(_ connections: [Connection]) throws { calls += 1; try inner.save(connections) }
  func erase() throws { calls += 1; try inner.erase() }
}

@MainActor
private final class UpdateHarness {
  let key = Curve25519.Signing.PrivateKey()
  let transport = FakeUpdateTransport()
  let installer = FakeUpdateInstaller()
  let clock = ManualClock(now: Date(timeIntervalSince1970: 1_800_000_000))
  let prefs: InMemoryPreferencesStore
  let downloads = FileManager.default.temporaryDirectory
    .appendingPathComponent("QuotaCanaryUpdateTests-\(UUID().uuidString)", isDirectory: true)
  let updater: Updater

  init(current: String = "0.1.0", os: String = "14.5.0", arch: String = "arm64", preferences: Preferences = Preferences()) {
    prefs = InMemoryPreferencesStore(preferences)
    updater = Updater(
      transport: transport, installer: installer, clock: clock, preferences: prefs, currentVersion: current,
      publicKey: key.publicKey, osVersion: os, architecture: arch, downloads: downloads
    )
  }

  deinit {
    try? FileManager.default.removeItem(at: downloads)
  }

  func entry(_ version: String, minimum: String = "13.0", archive: Data = archiveBytes) -> UpdateEntry {
    try! UpdateEntry.signed(
      version: version, minimumSystemVersion: minimum,
      url: "https://quotacanary.com/mac/QuotaCanary-\(version).zip", archive: archive, key: key
    )
  }

  func serve(_ entry: UpdateEntry, archive: Data = archiveBytes) {
    transport.feed = .respond(status: 200, body: try! JSONEncoder().encode(entry))
    transport.archive = .respond(status: 200, body: archive)
  }

  var downloadedFiles: [URL] {
    (try? FileManager.default.contentsOfDirectory(at: downloads, includingPropertiesForKeys: nil)) ?? []
  }
}

@MainActor @Suite struct UpdaterTests {
  // MARK: Versions and compatibility

  @Test func semanticVersionsCompareNumerically() {
    #expect(SemanticVersion("0.10.0")! > SemanticVersion("0.9.9")!)
    #expect(SemanticVersion("1")! == SemanticVersion("1.0.0")!)
    #expect(SemanticVersion("13.0")! < SemanticVersion("13.0.1")!)
    for bad in ["", "1.2.3.4", "1.x", "-1", "1.2.3-beta", "1..2", " 1.0"] {
      #expect(SemanticVersion(bad) == nil, "\(bad)")
    }
  }

  @Test func onlyANewerVersionIsDownloaded() async {
    for (version, expectReady) in [("0.2.0", true), ("0.1.0", false), ("0.0.9", false)] {
      let h = UpdateHarness()
      h.serve(h.entry(version))
      await h.updater.checkNow()
      if expectReady {
        #expect(h.updater.status == .ready(version: version))
        #expect(h.transport.requests.count == 2)
      } else {
        #expect(h.updater.status == .upToDate(checkedAt: h.clock.now))
        #expect(h.transport.requests.count == 1, "no download for \(version)")
        #expect(h.updater.ready == nil)
      }
    }
  }

  @Test func minimumSystemVersionGatesTheDownload() async {
    let h = UpdateHarness(os: "13.6.1")
    h.serve(h.entry("0.2.0", minimum: "14.0"))
    await h.updater.checkNow()
    #expect(h.updater.status == .needsNewerMacOS(version: "0.2.0", minimum: "14.0"))
    #expect(h.transport.requests.count == 1)
    #expect(h.updater.ready == nil)
    #expect(h.updater.statusLine == Copy.updatesNeedsNewerMacOS("0.2.0", "14.0"))

    let ok = UpdateHarness(os: "13.6.1")
    ok.serve(ok.entry("0.2.0", minimum: "13.6"))
    await ok.updater.checkNow()
    #expect(ok.updater.status == .ready(version: "0.2.0"))
  }

  // MARK: Privacy

  @Test func updateRequestsCarryOnlyVersionOSAndArchitecture() async throws {
    // A connected provider whose key and name are the marker, alive in the same process.
    let service = MonitoringService(
      credentials: InMemoryCredentialStore(), store: InMemoryConnectionStore(),
      transport: ScriptedTransport([.respond(status: 200, body: #"{"data":{"total_credits":20,"total_usage":7.5}}"#)])
    )
    _ = try await service.connect(provider: .openrouter, key: marker, name: marker)

    let h = UpdateHarness(current: "0.1.0", os: "14.5.0", arch: "arm64")
    let entry = h.entry("0.2.0")
    h.serve(entry)
    await h.updater.checkNow()
    #expect(h.updater.status == .ready(version: "0.2.0"))
    #expect(h.transport.requests.count == 2)

    for request in h.transport.requests {
      let everything = request.url.absoluteString + request.headers.map { "\($0.key)=\($0.value)" }.joined()
      #expect(!everything.contains(marker))
      #expect(!everything.contains("12.5")) // the connection's balance
      #expect(request.headers == ["User-Agent": "QuotaCanary/0.1.0"])
    }
    let feed = try #require(URLComponents(url: h.transport.requests[0].url, resolvingAgainstBaseURL: false))
    #expect(feed.host == "quotacanary.com" && feed.path == "/mac/updates.json")
    let items = (feed.queryItems ?? []).sorted { $0.name < $1.name }
    #expect(items.map(\.name) == ["app", "arch", "os"])
    #expect(items.map(\.value) == ["0.1.0", "arm64", "14.5.0"])
    // The archive request is the signed entry's URL, untouched.
    #expect(h.transport.requests[1].url.absoluteString == entry.url)
  }

  @Test func realTransportPinsLanguageAndCookies() {
    let request = URLSessionUpdateTransport.request(
      URL(string: "https://quotacanary.com/mac/updates.json")!, UpdateFeed.requestHeaders(appVersion: "0.1.0")
    )
    #expect(request.value(forHTTPHeaderField: "Accept-Language") == "en")
    #expect(request.value(forHTTPHeaderField: "User-Agent") == "QuotaCanary/0.1.0")
    #expect(!request.httpShouldHandleCookies)
    #expect(request.allHTTPHeaderFields?.count == 2)
  }

  // MARK: Authenticity

  @Test func feedNotSignedByTheReleaseKeyIsRejected() async {
    let h = UpdateHarness()
    let other = Curve25519.Signing.PrivateKey()
    h.serve(try! UpdateEntry.signed(
      version: "0.2.0", url: "https://quotacanary.com/mac/QuotaCanary-0.2.0.zip", archive: archiveBytes, key: other
    ))
    await h.updater.checkNow()
    #expect(h.updater.status == .failed(.badSignature))
    #expect(h.transport.requests.count == 1) // never downloaded
    #expect(h.prefs.saved.lastUpdateCheckAt == nil)
    #expect(h.updater.statusLine == Copy.updateBadSignature)
  }

  @Test func feedFieldsEditedAfterSigningAreRejected() async {
    for edit in [
      { (e: inout UpdateEntry) in e.version = "0.3.0" },
      { (e: inout UpdateEntry) in e.minimumSystemVersion = "12.0" },
      { (e: inout UpdateEntry) in e.sha256 = UpdateFeed.sha256Hex(Data("something else".utf8)) },
    ] {
      let h = UpdateHarness()
      var entry = h.entry("0.2.0")
      edit(&entry)
      h.serve(entry)
      await h.updater.checkNow()
      #expect(h.updater.status == .failed(.badSignature))
      #expect(h.updater.ready == nil)
    }
  }

  @Test func archiveThatDoesNotMatchTheSignedChecksumIsThrownAway() async {
    let h = UpdateHarness()
    h.serve(h.entry("0.2.0"), archive: Data("tampered archive".utf8))
    await h.updater.checkNow()
    #expect(h.updater.status == .failed(.checksumMismatch))
    #expect(h.updater.ready == nil)
    #expect(h.downloadedFiles.isEmpty)
  }

  @Test func archiveWithABadSignatureIsThrownAway() async {
    let h = UpdateHarness()
    var entry = h.entry("0.2.0")
    // Checksum and feed signature are right; the archive signature is someone else's.
    entry.signature = try! Curve25519.Signing.PrivateKey().signature(for: archiveBytes).base64EncodedString()
    h.serve(entry)
    await h.updater.checkNow()
    #expect(h.updater.status == .failed(.badSignature))
    #expect(h.updater.ready == nil)
    #expect(h.downloadedFiles.isEmpty)
  }

  @Test func unreadableFeedsAndInsecureArchiveURLsAreRejected() async {
    let notJSON = UpdateHarness()
    notJSON.transport.feed = .respond(status: 200, body: Data("<html>".utf8))
    await notJSON.updater.checkNow()
    #expect(notJSON.updater.status == .failed(.feedUnreadable))

    let missing = UpdateHarness()
    missing.transport.feed = .respond(status: 404, body: Data())
    await missing.updater.checkNow()
    #expect(missing.updater.status == .failed(.feedUnreadable))

    let http = UpdateHarness()
    var entry = http.entry("0.2.0")
    entry.url = "http://example.com/QuotaCanary-0.2.0.zip"
    http.serve(entry)
    await http.updater.checkNow()
    #expect(http.updater.status == .failed(.feedUnreadable))
    #expect(http.transport.requests.count == 1)
  }

  @Test func downloadFailureIsReported() async {
    let h = UpdateHarness()
    h.serve(h.entry("0.2.0"))
    h.transport.archive = .fail
    await h.updater.checkNow()
    #expect(h.updater.status == .failed(.downloadFailed))
    #expect(h.updater.ready == nil)
    #expect(h.downloadedFiles.isEmpty)
  }

  @Test func compiledInReleaseKeyAndFeedAreSound() {
    #expect(UpdateFeed.publicKey.rawRepresentation.count == 32)
    #expect(UpdateFeed.url.scheme == "https" && UpdateFeed.url.host == "quotacanary.com")
    #expect(UpdateFeed.bundleIdentifier == KeychainCredentialStore.defaultService)
  }

  @Test func feedOverrideAcceptsOnlyHTTPSOrThisMac() {
    let key = UpdateFeed.overrideVariable
    #expect(UpdateFeed.feedURL(environment: [:]) == UpdateFeed.url)
    #expect(UpdateFeed.feedURL(environment: [key: "http://127.0.0.1:8765/updates.json"]).host == "127.0.0.1")
    #expect(UpdateFeed.feedURL(environment: [key: "https://example.com/feed.json"]).host == "example.com")
    #expect(UpdateFeed.feedURL(environment: [key: "http://example.com/feed.json"]) == UpdateFeed.url)
    #expect(UpdateFeed.feedURL(environment: [key: "file:///tmp/feed.json"]) == UpdateFeed.url)
  }

  // MARK: User control

  @Test func verifiedUpdateWaitsForTheUser() async {
    let h = UpdateHarness()
    h.serve(h.entry("0.2.0"))
    await h.updater.checkNow()
    #expect(h.updater.status == .ready(version: "0.2.0"))
    #expect(h.updater.statusLine == Copy.updatesReady("0.2.0"))
    #expect(h.updater.panelLine == Copy.updatesPanelReady("0.2.0"))
    #expect(h.installer.unpacked.isEmpty && h.installer.installed.isEmpty)
    let ready = h.updater.ready
    #expect(ready.map { FileManager.default.fileExists(atPath: $0.archive.path) } == true)
    #expect(h.prefs.saved.lastUpdateCheckAt == h.clock.now)
  }

  @Test func installHandsTheVerifiedArchiveToTheInstallerOnce() async throws {
    let h = UpdateHarness()
    h.installer.facts.version = "0.2.0"
    h.serve(h.entry("0.2.0"))
    await h.updater.checkNow()
    let ready = try #require(h.updater.ready)
    h.updater.install()
    #expect(h.installer.unpacked == [ready.archive])
    #expect(h.installer.installed.count == 1)
    #expect(h.updater.status == .installing(version: "0.2.0"))
  }

  @Test func laterKeepsTheDownloadAndThePanelLine() async throws {
    let h = UpdateHarness()
    h.serve(h.entry("0.2.0"))
    await h.updater.checkNow()
    let ready = try #require(h.updater.ready)
    h.updater.later()
    #expect(h.updater.laterChosen)
    #expect(h.updater.ready == ready)
    #expect(FileManager.default.fileExists(atPath: ready.archive.path))
    #expect(h.updater.panelLine == Copy.updatesPanelReady("0.2.0"))
    #expect(h.updater.statusLine == Copy.updatesReadyLater("0.2.0"))
    #expect(h.installer.installed.isEmpty)
  }

  @Test func newBundleMustBeQuotaCanaryAtTheSignedVersionForThisChip() {
    let good = UpdateBundleFacts(identifier: "com.quotacanary.mac", version: "0.2.0", architectures: ["arm64", "x86_64"], sealIntact: true)
    #expect(Updater.validate(good, expectedVersion: "0.2.0", runningArchitecture: "arm64") == nil)
    var otherID = good
    otherID.identifier = "com.example.app"
    var otherVersion = good
    otherVersion.version = "0.1.9"
    var broken = good
    broken.sealIntact = false
    var intelOnly = good
    intelOnly.architectures = ["x86_64"]
    #expect(Updater.validate(otherID, expectedVersion: "0.2.0", runningArchitecture: "arm64") == .bundleMismatch)
    #expect(Updater.validate(otherVersion, expectedVersion: "0.2.0", runningArchitecture: "arm64") == .bundleMismatch)
    #expect(Updater.validate(broken, expectedVersion: "0.2.0", runningArchitecture: "arm64") == .bundleMismatch)
    #expect(Updater.validate(intelOnly, expectedVersion: "0.2.0", runningArchitecture: "arm64") == .unsupportedArchitecture)
  }

  @Test func mismatchedBundleIsRefusedAndDiscarded() async throws {
    let h = UpdateHarness()
    h.installer.facts = UpdateBundleFacts(identifier: "com.example.app", version: "0.2.0", architectures: ["arm64"], sealIntact: true)
    h.serve(h.entry("0.2.0"))
    await h.updater.checkNow()
    let ready = try #require(h.updater.ready)
    h.updater.install()
    #expect(h.updater.status == .failed(.bundleMismatch))
    #expect(h.installer.installed.isEmpty)
    #expect(h.updater.ready == nil)
    #expect(!FileManager.default.fileExists(atPath: ready.archive.path))
  }

  @Test func installOutsideAnAppBundleStopsBeforeTouchingAnything() async {
    for refusal in [UpdateFailure.notInBundle, .readOnlyLocation] {
      let h = UpdateHarness()
      h.installer.installable = refusal
      h.serve(h.entry("0.2.0"))
      await h.updater.checkNow()
      h.updater.install()
      #expect(h.updater.status == .failed(refusal))
      #expect(h.installer.unpacked.isEmpty && h.installer.installed.isEmpty)
      #expect(h.updater.ready != nil) // still there for when the app is moved
    }
  }

  @Test func failedInstallKeepsTheRunningAppAndTheDownload() async {
    let h = UpdateHarness()
    h.installer.facts.version = "0.2.0"
    h.installer.installError = .installFailed
    h.serve(h.entry("0.2.0"))
    await h.updater.checkNow()
    h.updater.install()
    #expect(h.updater.status == .failed(.installFailed))
    #expect(h.updater.statusLine == Copy.updateInstallFailed)
    #expect(h.updater.ready != nil)
  }

  @Test func archiveSwappedAfterVerificationIsRefused() async throws {
    let h = UpdateHarness()
    h.installer.facts.version = "0.2.0"
    h.serve(h.entry("0.2.0"))
    await h.updater.checkNow()
    let ready = try #require(h.updater.ready)
    try Data("swapped on disk".utf8).write(to: ready.archive)
    h.updater.install()
    #expect(h.updater.status == .failed(.checksumMismatch))
    #expect(h.installer.unpacked.isEmpty)
  }

  // MARK: Opt-in and cadence

  @Test func noOptInMeansNoRequestsEver() async {
    let h = UpdateHarness()
    h.serve(h.entry("0.2.0"))
    #expect(!h.updater.automaticChecks)
    h.updater.start()
    for _ in 0..<3 {
      h.clock.advance(by: UpdateFeed.automaticInterval)
      await h.updater.settle()
    }
    #expect(h.transport.requests.isEmpty)
    #expect(h.clock.pendingCount == 0)
  }

  @Test func automaticChecksRunAtMostOnceADayAndStopWhenTurnedOff() async {
    let h = UpdateHarness(preferences: Preferences(automaticUpdateChecks: true))
    h.serve(h.entry("0.1.0")) // up to date, so each check is one request
    h.updater.start()
    h.clock.advance(by: 0)
    await h.updater.settle()
    #expect(h.transport.feedRequests == 1)
    h.clock.advance(by: 23 * 3600)
    await h.updater.settle()
    #expect(h.transport.feedRequests == 1)
    h.clock.advance(by: 3600)
    await h.updater.settle()
    #expect(h.transport.feedRequests == 2)

    h.updater.setAutomaticChecks(false)
    #expect(h.prefs.saved.automaticUpdateChecks == false)
    h.clock.advance(by: 3 * UpdateFeed.automaticInterval)
    await h.updater.settle()
    #expect(h.transport.feedRequests == 2)
    #expect(h.clock.pendingCount == 0)
  }

  @Test func automaticCadenceCountsFromTheLastSavedCheck() async {
    let now = Date(timeIntervalSince1970: 1_800_000_000)
    let h = UpdateHarness(preferences: Preferences(automaticUpdateChecks: true, lastUpdateCheckAt: now.addingTimeInterval(-3600)))
    h.serve(h.entry("0.1.0"))
    h.updater.start()
    h.clock.advance(by: 22 * 3600)
    await h.updater.settle()
    #expect(h.transport.feedRequests == 0)
    h.clock.advance(by: 3600)
    await h.updater.settle()
    #expect(h.transport.feedRequests == 1)
  }

  @Test func manualCheckIgnoresTheInterval() async {
    let h = UpdateHarness(preferences: Preferences(automaticUpdateChecks: true))
    h.serve(h.entry("0.1.0"))
    h.updater.start()
    h.clock.advance(by: 0)
    await h.updater.settle()
    #expect(h.transport.feedRequests == 1)
    await h.updater.checkNow()
    await h.updater.checkNow()
    #expect(h.transport.feedRequests == 3)
  }

  @Test func manualCheckWorksWithAutomaticChecksOff() async {
    let h = UpdateHarness()
    h.serve(h.entry("0.1.0"))
    await h.updater.checkNow()
    #expect(h.updater.status == .upToDate(checkedAt: h.clock.now))
    #expect(h.updater.statusLine == Copy.updatesUpToDate(Updater.format(h.clock.now)))
    #expect(!h.updater.automaticChecks)
  }

  @Test func unreachableServerChangesNothing() async throws {
    let h = UpdateHarness()
    h.serve(h.entry("0.2.0"))
    await h.updater.checkNow()
    let ready = try #require(h.updater.ready)
    let saved = h.prefs.saved

    h.transport.feed = .fail
    h.clock.advance(by: 3600)
    await h.updater.checkNow()
    #expect(h.updater.status == .failed(.unreachable))
    #expect(h.updater.statusLine == Copy.updateUnreachable)
    #expect(h.prefs.saved == saved)
    #expect(h.updater.lastCheckAt == saved.lastUpdateCheckAt)
    #expect(h.updater.ready == ready)
    #expect(FileManager.default.fileExists(atPath: ready.archive.path))
    #expect(h.updater.panelLine == Copy.updatesPanelReady("0.2.0"))
  }

  @Test func downloadsFromAnEarlierRunAreDeletedAtLaunch() throws {
    let h = UpdateHarness()
    try FileManager.default.createDirectory(at: h.downloads, withIntermediateDirectories: true)
    try Data("old".utf8).write(to: h.downloads.appendingPathComponent("QuotaCanary-0.1.5-old.zip"))
    h.updater.start()
    #expect(h.downloadedFiles.isEmpty)
    #expect(h.transport.requests.isEmpty)
  }

  @Test func firstRunQuestionComesOnceAndEitherAnswerSettlesIt() {
    let no = UpdateHarness()
    #expect(!no.updater.showsPrompt(hasConnections: false))
    #expect(no.updater.showsPrompt(hasConnections: true))
    no.updater.answerPrompt(enable: false)
    #expect(!no.updater.showsPrompt(hasConnections: true))
    #expect(no.prefs.saved.updatePromptAnswered && !no.prefs.saved.automaticUpdateChecks)

    let yes = UpdateHarness()
    yes.updater.answerPrompt(enable: true)
    #expect(yes.updater.automaticChecks)
    #expect(yes.prefs.saved.updatePromptAnswered && yes.prefs.saved.automaticUpdateChecks)
    #expect(!yes.updater.showsPrompt(hasConnections: true))
  }

  @Test func preferencesSavedBeforeUpdatesExistedLoadWithUpdatesOff() throws {
    let old = try JSONDecoder().decode(Preferences.self, from: Data(#"{"loginPromptAnswered":true}"#.utf8))
    #expect(old.loginPromptAnswered)
    #expect(!old.automaticUpdateChecks && !old.updatePromptAnswered && old.lastUpdateCheckAt == nil)
  }

  // MARK: Local data stays out of it

  @Test func updatePathNeverTouchesKeychainOrConnections() async throws {
    let credentials = SpyCredentialStore()
    let store = SpyConnectionStore()
    let service = MonitoringService(
      credentials: credentials, store: store,
      transport: ScriptedTransport([.respond(status: 200, body: #"{"data":{"total_credits":20,"total_usage":7.5}}"#)])
    )
    _ = try await service.connect(provider: .openrouter, key: marker, name: "Main")
    let before = (credentials.calls, store.calls)

    let h = UpdateHarness()
    h.installer.facts.version = "0.2.0"
    h.serve(h.entry("0.2.0"))
    h.updater.setAutomaticChecks(true)
    h.updater.start()
    h.clock.advance(by: 0)
    await h.updater.settle()
    await h.updater.checkNow()
    h.updater.later()
    h.updater.install()

    #expect(h.installer.installed.count == 1)
    #expect(credentials.calls == before.0)
    #expect(store.calls == before.1)
    #expect(!h.downloads.path.contains("Application Support"))
  }
}

// MARK: - The real installer, on real folders (no relaunch)

@Suite struct SystemUpdateInstallerTests {
  /// A minimal ad hoc signed QuotaCanary.app whose executable is a copy of /usr/bin/true.
  private func makeApp(in dir: URL, version: String, identifier: String = "com.quotacanary.mac") throws -> URL {
    let app = dir.appendingPathComponent("QuotaCanary.app")
    let macOS = app.appendingPathComponent("Contents/MacOS")
    try FileManager.default.createDirectory(at: macOS, withIntermediateDirectories: true)
    try FileManager.default.copyItem(at: URL(fileURLWithPath: "/usr/bin/true"), to: macOS.appendingPathComponent("QuotaCanary"))
    let info: [String: Any] = [
      "CFBundleIdentifier": identifier, "CFBundleExecutable": "QuotaCanary", "CFBundlePackageType": "APPL",
      "CFBundleShortVersionString": version, "CFBundleVersion": "1",
    ]
    try PropertyListSerialization.data(fromPropertyList: info, format: .xml, options: 0)
      .write(to: app.appendingPathComponent("Contents/Info.plist"))
    try SystemUpdateInstaller.run("/usr/bin/codesign", ["-s", "-", "--force", app.path])
    return app
  }

  private func tempDir() throws -> URL {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("QuotaCanaryInstallerTests-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return dir
  }

  @Test func swapsTheBundleKeepsABackupAndRelaunchesTheSamePath() throws {
    let root = try tempDir()
    defer { try? FileManager.default.removeItem(at: root) }
    let apps = root.appendingPathComponent("Apps")
    let build = root.appendingPathComponent("Build")
    let support = root.appendingPathComponent("Application Support/QuotaCanary")
    try FileManager.default.createDirectory(at: apps, withIntermediateDirectories: true)
    try FileManager.default.createDirectory(at: build, withIntermediateDirectories: true)
    try FileManager.default.createDirectory(at: support, withIntermediateDirectories: true)
    let state = Data(#"{"version":1,"connections":[]}"#.utf8)
    try state.write(to: support.appendingPathComponent("connections.json"))

    let current = try makeApp(in: apps, version: "0.1.0")
    let next = try makeApp(in: build, version: "0.2.0")
    let archive = root.appendingPathComponent("QuotaCanary-0.2.0.zip")
    try SystemUpdateInstaller.run("/usr/bin/ditto", ["-c", "-k", "--keepParent", next.path, archive.path])

    var relaunched: [URL] = []
    var terminated = 0
    let installer = SystemUpdateInstaller(currentApp: current, relaunch: { relaunched.append($0) }, terminate: { terminated += 1 })
    try installer.checkInstallable()
    let unpacked = try installer.unpack(archive: archive)
    #expect(unpacked.facts.identifier == "com.quotacanary.mac")
    #expect(unpacked.facts.version == "0.2.0")
    #expect(unpacked.facts.sealIntact)
    #expect(unpacked.facts.architectures.contains(Diagnostics.architectureString()))
    try installer.install(unpacked)

    #expect(SystemUpdateInstaller.infoValue(current, "CFBundleShortVersionString") == "0.2.0")
    let backup = apps.appendingPathComponent(SystemUpdateInstaller.backupName)
    #expect(SystemUpdateInstaller.infoValue(backup, "CFBundleShortVersionString") == "0.1.0")
    #expect(relaunched == [current])
    #expect(terminated == 1)
    let left = try FileManager.default.contentsOfDirectory(atPath: apps.path).sorted()
    #expect(left == [SystemUpdateInstaller.backupName, "QuotaCanary.app"])
    #expect(try Data(contentsOf: support.appendingPathComponent("connections.json")) == state)
  }

  @Test func refusesAnythingThatIsNotTheQuotaCanaryBundle() throws {
    let root = try tempDir()
    defer { try? FileManager.default.removeItem(at: root) }
    let debug = root.appendingPathComponent("debug")
    try FileManager.default.createDirectory(at: debug, withIntermediateDirectories: true)
    #expect(throws: UpdateFailure.notInBundle) {
      try SystemUpdateInstaller(currentApp: debug, terminate: {}).checkInstallable()
    }
    let other = try makeApp(in: root, version: "0.1.0", identifier: "com.example.other")
    #expect(throws: UpdateFailure.notInBundle) {
      try SystemUpdateInstaller(currentApp: other, terminate: {}).checkInstallable()
    }
  }

  @Test func refusesAFolderItCannotWrite() throws {
    let root = try tempDir()
    let locked = root.appendingPathComponent("Locked")
    try FileManager.default.createDirectory(at: locked, withIntermediateDirectories: true)
    let app = try makeApp(in: locked, version: "0.1.0")
    try FileManager.default.setAttributes([.posixPermissions: 0o555], ofItemAtPath: locked.path)
    defer {
      try? FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: locked.path)
      try? FileManager.default.removeItem(at: root)
    }
    #expect(throws: UpdateFailure.readOnlyLocation) {
      try SystemUpdateInstaller(currentApp: app, terminate: {}).checkInstallable()
    }
    #expect(SystemUpdateInstaller.infoValue(app, "CFBundleShortVersionString") == "0.1.0")
  }

  @Test func aBundleEditedAfterSigningReadsAsBroken() throws {
    let root = try tempDir()
    defer { try? FileManager.default.removeItem(at: root) }
    let app = try makeApp(in: root, version: "0.2.0")
    #expect(SystemUpdateInstaller.facts(of: app).sealIntact)
    let handle = try FileHandle(forWritingTo: app.appendingPathComponent("Contents/MacOS/QuotaCanary"))
    handle.seekToEndOfFile()
    handle.write(Data([0]))
    try handle.close()
    #expect(!SystemUpdateInstaller.facts(of: app).sealIntact)
  }
}
