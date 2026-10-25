import CryptoKit
import Foundation
import Security

// Update checks and user-chosen installs (QUO-139). Hand-rolled, no framework:
// the app is ad hoc signed for now, Sparkle's installer behaves differently for
// ad hoc bundles, and a binary dependency could not be audited here.
//
// Trust chain: a small JSON feed over HTTPS names one release. Its
// `feedSignature` (Ed25519, key compiled in below) covers the version, the
// minimum macOS and the archive's SHA-256, so a tampered feed cannot point at a
// different or older archive. The downloaded archive must match that SHA-256
// and carry its own Ed25519 signature over its raw bytes. Only then does the
// user see "Version X is ready". Installing unzips it, checks the new bundle's
// identifier, version, code seal and architectures, swaps it in place with a
// backup, relaunches it and quits. Nothing installs or restarts on its own.
//
// Privacy: the feed request carries exactly the app version, the macOS version
// and the CPU architecture (query parameters `app`, `os`, `arch`, plus a
// `User-Agent: QuotaCanary/<version>` header). The archive request carries the
// same header and nothing else. URLSession's own Accept and Accept-Encoding are
// constants; Accept-Language is pinned to "en" so the user's languages stay home. No provider, connection, credential or
// balance ever reaches this file: the updater holds no reference to the
// monitoring service, the Keychain or connections.json.

public enum UpdateFeed {
  /// The production feed. Not live until QUO-142 hosts it.
  public static let url = URL(string: "https://quotacanary.com/mac/updates.json")!
  /// Ed25519 public key (raw 32 bytes, base64) from scripts/update-keys.sh. The
  /// private half lives only at ~/.config/quotacanary-mac/update-signing.key.
  public static let publicKeyBase64 = "Aon2NmGXgAUpRyGXhQGDq4o6jRb2wHPazjuX8w2tDwY="
  public static var publicKey: Curve25519.Signing.PublicKey {
    // A bad constant is a build defect, caught by UpdaterTests.
    try! Curve25519.Signing.PublicKey(rawRepresentation: Data(base64Encoded: publicKeyBase64)!)
  }

  /// Same bundle id, so an upgrade keeps the Keychain service and the
  /// Application Support folder.
  public static let bundleIdentifier = "com.quotacanary.mac"
  /// Automatic checks run at most this often.
  public static let automaticInterval: TimeInterval = 24 * 60 * 60
  /// A feed larger than this is not a feed.
  static let maximumFeedBytes = 64 * 1024

  /// Development only: points the app at a local test feed. Honored in every
  /// build (the scripts build dev and release the same way), but only for
  /// https or for http to this Mac, and the compiled-in key still has to
  /// verify everything, so it cannot make the app install an unsigned update.
  public static let overrideVariable = "QUOTACANARY_UPDATE_FEED"

  public static func feedURL(environment: [String: String]) -> URL {
    guard let raw = environment[overrideVariable], let override = URL(string: raw), isAllowedSource(override)
    else { return url }
    return override
  }

  /// https anywhere; plain http only to loopback.
  public static func isAllowedSource(_ url: URL) -> Bool {
    switch url.scheme?.lowercased() {
    case "https": return !(url.host ?? "").isEmpty
    case "http": return ["127.0.0.1", "localhost", "::1"].contains(url.host ?? "")
    default: return false
    }
  }

  /// What `feedSignature` covers. scripts/update-tool.swift builds the same bytes.
  public static func entryMessage(version: String, minimumSystemVersion: String, sha256: String) -> Data {
    Data("quotacanary-mac-update\n\(version)\n\(minimumSystemVersion)\n\(sha256)".utf8)
  }

  /// The feed request: the base URL plus `app`, `os` and `arch`. Nothing else.
  public static func requestURL(base: URL, appVersion: String, osVersion: String, architecture: String) -> URL {
    var components = URLComponents(url: base, resolvingAgainstBaseURL: false)
    components?.queryItems = [
      URLQueryItem(name: "app", value: appVersion),
      URLQueryItem(name: "os", value: osVersion),
      URLQueryItem(name: "arch", value: architecture),
    ]
    return components?.url ?? base
  }

  /// Replaces URLSession's default User-Agent, which would add the build number.
  public static func requestHeaders(appVersion: String) -> [String: String] {
    ["User-Agent": "QuotaCanary/\(appVersion)"]
  }

  public static func sha256Hex(_ data: Data) -> String {
    SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
  }
}

/// MAJOR.MINOR.PATCH, numbers only; missing parts count as 0.
public struct SemanticVersion: Comparable, Sendable, CustomStringConvertible {
  public let parts: [Int]

  public init?(_ string: String) {
    let pieces = string.split(separator: ".", omittingEmptySubsequences: false)
    guard (1...3).contains(pieces.count) else { return nil }
    var parts: [Int] = []
    for piece in pieces {
      guard !piece.isEmpty, piece.count <= 6, piece.allSatisfy({ ("0"..."9").contains($0) }), let n = Int(piece)
      else { return nil }
      parts.append(n)
    }
    self.parts = parts + Array(repeating: 0, count: 3 - parts.count)
  }

  public static func < (lhs: SemanticVersion, rhs: SemanticVersion) -> Bool {
    lhs.parts.lexicographicallyPrecedes(rhs.parts)
  }

  public var description: String { parts.map(String.init).joined(separator: ".") }
}

/// One release, as the feed describes it.
public struct UpdateEntry: Codable, Equatable, Sendable {
  public var version: String
  public var minimumSystemVersion: String
  public var url: String
  /// Lowercase hex SHA-256 of the archive.
  public var sha256: String
  /// Base64 Ed25519 signature over the archive's raw bytes.
  public var signature: String
  /// Base64 Ed25519 signature over `UpdateFeed.entryMessage`.
  public var feedSignature: String
  /// Release notes for people reading the feed. Not signed, so never shown in the app.
  public var notes: String?

  public init(
    version: String, minimumSystemVersion: String, url: String, sha256: String, signature: String,
    feedSignature: String, notes: String? = nil
  ) {
    self.version = version
    self.minimumSystemVersion = minimumSystemVersion
    self.url = url
    self.sha256 = sha256
    self.signature = signature
    self.feedSignature = feedSignature
    self.notes = notes
  }

  /// Builds a signed entry. Tests and snapshots use it with a throwaway key;
  /// real releases go through scripts/sign-update.sh.
  public static func signed(
    version: String, minimumSystemVersion: String = "13.0", url: String, archive: Data,
    key: Curve25519.Signing.PrivateKey
  ) throws -> UpdateEntry {
    let sha = UpdateFeed.sha256Hex(archive)
    let message = UpdateFeed.entryMessage(version: version, minimumSystemVersion: minimumSystemVersion, sha256: sha)
    return try UpdateEntry(
      version: version, minimumSystemVersion: minimumSystemVersion, url: url, sha256: sha,
      signature: key.signature(for: archive).base64EncodedString(),
      feedSignature: key.signature(for: message).base64EncodedString()
    )
  }
}

/// Why a check or install stopped. Each maps to one plain sentence in Copy;
/// none carries text from the network.
public enum UpdateFailure: String, Error, Equatable, Sendable, CaseIterable {
  case unreachable
  case feedUnreadable
  case badSignature
  case checksumMismatch
  case downloadFailed
  case notInBundle
  case readOnlyLocation
  case bundleMismatch
  case unsupportedArchitecture
  case installFailed
  case relaunchFailed

  public var message: String {
    switch self {
    case .unreachable: return Copy.updateUnreachable
    case .feedUnreadable: return Copy.updateFeedUnreadable
    case .badSignature: return Copy.updateBadSignature
    case .checksumMismatch: return Copy.updateChecksumMismatch
    case .downloadFailed: return Copy.updateDownloadFailed
    case .notInBundle: return Copy.updateNotInBundle
    case .readOnlyLocation: return Copy.updateReadOnlyLocation
    case .bundleMismatch: return Copy.updateBundleMismatch
    case .unsupportedArchitecture: return Copy.updateUnsupportedArchitecture
    case .installFailed: return Copy.updateInstallFailed
    case .relaunchFailed: return Copy.updateRelaunchFailed
    }
  }
}

public enum UpdateStatus: Equatable, Sendable {
  case idle
  case checking
  case downloading(version: String)
  case upToDate(checkedAt: Date)
  case needsNewerMacOS(version: String, minimum: String)
  case ready(version: String)
  case installing(version: String)
  case failed(UpdateFailure)
}

/// A downloaded, verified archive waiting for the user.
public struct ReadyUpdate: Equatable, Sendable {
  public var version: String
  public var archive: URL
  public var sha256: String
}

// MARK: - Boundaries

/// The network, for the feed and the archive only. Real: `URLSessionUpdateTransport`.
public protocol UpdateTransport: AnyObject {
  func fetch(_ url: URL, headers: [String: String]) async throws -> HTTPResponse
  /// Writes the body of a 200 response to `destination`; throws otherwise.
  func download(_ url: URL, headers: [String: String], to destination: URL) async throws
}

/// What the installer read from an unpacked bundle.
public struct UpdateBundleFacts: Equatable, Sendable {
  public var identifier: String?
  public var version: String?
  /// "arm64", "x86_64".
  public var architectures: [String]
  /// The bundle's code signature seal verifies (ad hoc included).
  public var sealIntact: Bool

  public init(identifier: String?, version: String?, architectures: [String], sealIntact: Bool) {
    self.identifier = identifier
    self.version = version
    self.architectures = architectures
    self.sealIntact = sealIntact
  }
}

public struct UnpackedUpdate: Equatable, Sendable {
  public var app: URL
  public var facts: UpdateBundleFacts

  public init(app: URL, facts: UpdateBundleFacts) {
    self.app = app
    self.facts = facts
  }
}

/// Swaps the app and relaunches it. Real: `SystemUpdateInstaller`.
public protocol UpdateInstaller: AnyObject {
  /// Throws `notInBundle` or `readOnlyLocation` before anything is touched.
  func checkInstallable() throws
  /// Unzips a verified archive into a fresh temporary folder.
  func unpack(archive: URL) throws -> UnpackedUpdate
  /// Replaces the running bundle, keeping a backup, then relaunches. The real
  /// one quits the app afterwards; a fake just returns.
  func install(_ update: UnpackedUpdate) throws
}

// MARK: - Updater

@MainActor
public final class Updater: ObservableObject {
  @Published public private(set) var status: UpdateStatus = .idle
  @Published public private(set) var ready: ReadyUpdate?
  @Published public private(set) var automaticChecks: Bool
  @Published public private(set) var promptAnswered: Bool
  /// Last check that got a verified answer from the feed.
  @Published public private(set) var lastCheckAt: Date?
  /// The user chose Later for the ready update.
  @Published public private(set) var laterChosen = false

  public let currentVersion: String
  private let transport: UpdateTransport
  private let installer: UpdateInstaller
  private let clock: SchedulerClock
  private let preferences: PreferencesStore
  private let publicKey: Curve25519.Signing.PublicKey
  private let feedURL: URL
  private let osVersion: String
  private let architecture: String
  private let downloads: URL
  private var timer: ScheduledWork?
  private var inFlight: Task<Void, Never>?
  /// Any attempt, answered or not: automatic checks wait a full interval after it.
  private var lastAttemptAt: Date?
  private var started = false

  public init(
    transport: UpdateTransport, installer: UpdateInstaller, clock: SchedulerClock,
    preferences: PreferencesStore, currentVersion: String, feedURL: URL = UpdateFeed.url,
    publicKey: Curve25519.Signing.PublicKey = UpdateFeed.publicKey,
    osVersion: String = Diagnostics.macOSVersionString(), architecture: String = Diagnostics.architectureString(),
    downloads: URL = FileManager.default.temporaryDirectory.appendingPathComponent("QuotaCanaryUpdates", isDirectory: true)
  ) {
    self.transport = transport
    self.installer = installer
    self.clock = clock
    self.preferences = preferences
    self.currentVersion = currentVersion
    self.feedURL = feedURL
    self.publicKey = publicKey
    self.osVersion = osVersion
    self.architecture = architecture
    self.downloads = downloads
    let saved = preferences.load()
    automaticChecks = saved.automaticUpdateChecks
    promptAnswered = saved.updatePromptAnswered
    lastCheckAt = saved.lastUpdateCheckAt
  }

  /// Arms automatic checks if the user opted in. Never checks otherwise.
  /// Downloads left by an earlier run are deleted: a fresh check re-verifies.
  public func start() {
    guard !started else { return }
    started = true
    let stale = (try? FileManager.default.contentsOfDirectory(at: downloads, includingPropertiesForKeys: nil)) ?? []
    for file in stale where file != ready?.archive {
      try? FileManager.default.removeItem(at: file)
    }
    rescheduleAutomatic()
  }

  /// The Settings toggle. Also settles the first-run question.
  public func setAutomaticChecks(_ on: Bool) {
    automaticChecks = on
    promptAnswered = true
    var saved = preferences.load()
    saved.automaticUpdateChecks = on
    saved.updatePromptAnswered = true
    try? preferences.save(saved) // worst case the choice comes back next launch
    rescheduleAutomatic()
  }

  /// The first-run row: Enable turns automatic checks on; either answer settles it.
  public func answerPrompt(enable: Bool) {
    if enable {
      setAutomaticChecks(true)
    } else {
      promptAnswered = true
      var saved = preferences.load()
      saved.updatePromptAnswered = true
      try? preferences.save(saved)
    }
  }

  /// Ask once, after something is connected, unless already on.
  public func showsPrompt(hasConnections: Bool) -> Bool {
    hasConnections && !promptAnswered && !automaticChecks
  }

  /// "Check for updates": ignores the automatic interval. Joins a check in flight.
  public func checkNow() async {
    await beginCheck().value
  }

  /// Waits for a check in flight, if any.
  public func settle() async {
    await inFlight?.value
  }

  public var isBusy: Bool {
    switch status {
    case .checking, .downloading, .installing: return true
    default: return false
    }
  }

  /// The Settings status line. Never carries text from the network.
  public var statusLine: String {
    switch status {
    case .idle: return lastCheckAt.map { Copy.updatesLastChecked(Self.format($0)) } ?? Copy.updatesNotChecked
    case .checking: return Copy.updatesChecking
    case let .downloading(version): return Copy.updatesDownloading(version)
    case let .upToDate(at): return Copy.updatesUpToDate(Self.format(at))
    case let .needsNewerMacOS(version, minimum): return Copy.updatesNeedsNewerMacOS(version, minimum)
    case let .ready(version): return laterChosen ? Copy.updatesReadyLater(version) : Copy.updatesReady(version)
    case let .installing(version): return Copy.updatesInstalling(version)
    case let .failed(reason): return reason.message
    }
  }

  public var statusIsError: Bool {
    if case .failed = status { return true }
    return false
  }

  /// The panel's one line, only while a verified download is waiting.
  public var panelLine: String? {
    guard let ready, !isBusy else { return nil }
    return Copy.updatesPanelReady(ready.version)
  }

  static func format(_ date: Date) -> String {
    date.formatted(date: .abbreviated, time: .shortened)
  }

  /// Later: the download stays, the panel keeps its one line.
  public func later() {
    guard ready != nil else { return }
    laterChosen = true
  }

  /// Install and relaunch, only ever from a user action. Re-hashes the archive
  /// first, so a file swapped after verification is refused.
  public func install() {
    guard let ready else { return }
    status = .installing(version: ready.version)
    do {
      try installer.checkInstallable()
      guard let data = try? Data(contentsOf: ready.archive), UpdateFeed.sha256Hex(data) == ready.sha256 else {
        discardReady()
        status = .failed(.checksumMismatch)
        return
      }
      let unpacked = try installer.unpack(archive: ready.archive)
      if let problem = Self.validate(unpacked.facts, expectedVersion: ready.version, runningArchitecture: architecture) {
        discardReady()
        status = .failed(problem)
        return
      }
      try installer.install(unpacked)
    } catch let failure as UpdateFailure {
      status = .failed(failure)
    } catch {
      status = .failed(.installFailed)
    }
  }

  /// The new bundle must be QuotaCanary (same id, so Keychain and settings
  /// carry over), exactly the version the signed feed named, intact, and
  /// runnable on this Mac's CPU.
  public static func validate(
    _ facts: UpdateBundleFacts, expectedVersion: String, runningArchitecture: String
  ) -> UpdateFailure? {
    guard facts.identifier == UpdateFeed.bundleIdentifier, facts.sealIntact,
          let version = facts.version.flatMap(SemanticVersion.init),
          let expected = SemanticVersion(expectedVersion), version == expected
    else { return .bundleMismatch }
    guard facts.architectures.contains(runningArchitecture) else { return .unsupportedArchitecture }
    return nil
  }

  // MARK: Checking

  private func beginCheck() -> Task<Void, Never> {
    if let inFlight { return inFlight }
    lastAttemptAt = clock.now
    let task = Task { [weak self] in
      guard let self else { return }
      await self.performCheck()
      self.inFlight = nil
      self.rescheduleAutomatic()
    }
    inFlight = task
    return task
  }

  private func rescheduleAutomatic() {
    timer?.cancel()
    timer = nil
    guard started, automaticChecks else { return }
    let wait: TimeInterval
    if let last = [lastCheckAt, lastAttemptAt].compactMap({ $0 }).max() {
      let due = last.addingTimeInterval(UpdateFeed.automaticInterval).timeIntervalSince(clock.now)
      wait = min(max(0, due), UpdateFeed.automaticInterval)
    } else {
      wait = 0
    }
    timer = clock.schedule(after: wait) { [weak self] in
      guard let self else { return }
      self.timer = nil
      guard self.automaticChecks else { return }
      _ = self.beginCheck()
    }
  }

  private func performCheck() async {
    status = .checking
    let headers = UpdateFeed.requestHeaders(appVersion: currentVersion)
    let request = UpdateFeed.requestURL(
      base: feedURL, appVersion: currentVersion, osVersion: osVersion, architecture: architecture
    )
    let response: HTTPResponse
    do {
      response = try await transport.fetch(request, headers: headers)
    } catch {
      status = .failed(.unreachable)
      return
    }
    guard response.status == 200, response.body.count <= UpdateFeed.maximumFeedBytes,
          let entry = try? JSONDecoder().decode(UpdateEntry.self, from: response.body),
          let version = SemanticVersion(entry.version),
          let minimum = SemanticVersion(entry.minimumSystemVersion),
          let archiveURL = URL(string: entry.url), UpdateFeed.isAllowedSource(archiveURL),
          entry.sha256.count == 64, entry.sha256.allSatisfy({ $0.isHexDigit && !$0.isUppercase })
    else {
      status = .failed(.feedUnreadable)
      return
    }
    let message = UpdateFeed.entryMessage(
      version: entry.version, minimumSystemVersion: entry.minimumSystemVersion, sha256: entry.sha256
    )
    guard verify(entry.feedSignature, over: message) else {
      status = .failed(.badSignature)
      return
    }

    // A verified answer from here on.
    markChecked()
    guard let current = SemanticVersion(currentVersion), version > current else {
      status = .upToDate(checkedAt: clock.now)
      return
    }
    guard let running = SemanticVersion(osVersion), running >= minimum else {
      status = .needsNewerMacOS(version: entry.version, minimum: entry.minimumSystemVersion)
      return
    }
    if let ready, ready.version == entry.version, ready.sha256 == entry.sha256,
       FileManager.default.fileExists(atPath: ready.archive.path)
    {
      status = .ready(version: ready.version)
      return
    }

    status = .downloading(version: entry.version)
    let destination = downloads.appendingPathComponent("QuotaCanary-\(entry.version)-\(UUID().uuidString).zip")
    do {
      try FileManager.default.createDirectory(at: downloads, withIntermediateDirectories: true)
      try await transport.download(archiveURL, headers: headers, to: destination)
    } catch {
      try? FileManager.default.removeItem(at: destination)
      status = .failed(.downloadFailed)
      return
    }
    guard let archive = try? Data(contentsOf: destination) else {
      try? FileManager.default.removeItem(at: destination)
      status = .failed(.downloadFailed)
      return
    }
    guard UpdateFeed.sha256Hex(archive) == entry.sha256 else {
      try? FileManager.default.removeItem(at: destination)
      status = .failed(.checksumMismatch)
      return
    }
    guard verify(entry.signature, over: archive) else {
      try? FileManager.default.removeItem(at: destination)
      status = .failed(.badSignature)
      return
    }
    discardReady()
    ready = ReadyUpdate(version: entry.version, archive: destination, sha256: entry.sha256)
    status = .ready(version: entry.version)
  }

  private func verify(_ signature: String, over data: Data) -> Bool {
    guard let raw = Data(base64Encoded: signature) else { return false }
    return publicKey.isValidSignature(raw, for: data)
  }

  private func markChecked() {
    let now = clock.now
    lastCheckAt = now
    var saved = preferences.load()
    saved.lastUpdateCheckAt = now
    try? preferences.save(saved)
  }

  private func discardReady() {
    if let ready { try? FileManager.default.removeItem(at: ready.archive) }
    ready = nil
    laterChosen = false
  }
}

// MARK: - Real boundaries

/// Ephemeral session: no cookies, no cache, bounded timeouts.
public final class URLSessionUpdateTransport: UpdateTransport {
  private let session: URLSession

  public init(requestTimeout: TimeInterval = 15, downloadTimeout: TimeInterval = 120) {
    let config = URLSessionConfiguration.ephemeral
    config.timeoutIntervalForRequest = requestTimeout
    config.timeoutIntervalForResource = downloadTimeout
    config.urlCache = nil
    config.httpShouldSetCookies = false
    config.httpCookieAcceptPolicy = .never
    session = URLSession(configuration: config)
  }

  /// URLSession would add the user's preferred languages as Accept-Language;
  /// pin it to a constant so the request says nothing about this Mac's user.
  static func request(_ url: URL, _ headers: [String: String]) -> URLRequest {
    var request = URLRequest(url: url)
    request.httpShouldHandleCookies = false
    request.setValue("en", forHTTPHeaderField: "Accept-Language")
    for (name, value) in headers { request.setValue(value, forHTTPHeaderField: name) }
    return request
  }

  public func fetch(_ url: URL, headers: [String: String]) async throws -> HTTPResponse {
    let (data, response) = try await session.data(for: Self.request(url, headers))
    guard let http = response as? HTTPURLResponse else { throw TransportFailure() }
    return HTTPResponse(status: http.statusCode, body: data)
  }

  public func download(_ url: URL, headers: [String: String], to destination: URL) async throws {
    let (file, response) = try await session.download(for: Self.request(url, headers))
    defer { try? FileManager.default.removeItem(at: file) }
    guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw TransportFailure() }
    try FileManager.default.moveItem(at: file, to: destination)
  }
}

/// Unzips with ditto, swaps with `FileManager.replaceItemAt`, relaunches with
/// `open -n`. Touches only the running bundle, its folder (staging and backup
/// entries next to it) and temporary folders.
public final class SystemUpdateInstaller: UpdateInstaller {
  /// Next to the app, hidden, replaced on each update.
  public static let backupName = ".QuotaCanary-previous.app"
  /// Development variables forwarded to the relaunched app, so a test run
  /// stays in the mode it started in. Nothing else is forwarded.
  static let forwardedVariables = ["QUOTACANARY_SYNTHETIC", UpdateFeed.overrideVariable]

  public let currentApp: URL
  private let relaunch: (URL) throws -> Void
  private let terminate: () -> Void

  public init(
    currentApp: URL = Bundle.main.bundleURL,
    relaunch: @escaping (URL) throws -> Void = SystemUpdateInstaller.openNewInstance,
    terminate: @escaping () -> Void
  ) {
    self.currentApp = currentApp
    self.relaunch = relaunch
    self.terminate = terminate
  }

  public func checkInstallable() throws {
    guard currentApp.pathExtension == "app",
          Self.infoValue(currentApp, "CFBundleIdentifier") == UpdateFeed.bundleIdentifier
    else { throw UpdateFailure.notInBundle }
    let parent = currentApp.deletingLastPathComponent()
    let readOnlyVolume = (try? currentApp.resourceValues(forKeys: [.volumeIsReadOnlyKey]))?.volumeIsReadOnly ?? false
    guard !readOnlyVolume, !currentApp.path.contains("/AppTranslocation/"),
          FileManager.default.isWritableFile(atPath: parent.path),
          FileManager.default.isWritableFile(atPath: currentApp.path)
    else { throw UpdateFailure.readOnlyLocation }
  }

  public func unpack(archive: URL) throws -> UnpackedUpdate {
    let dir = FileManager.default.temporaryDirectory
      .appendingPathComponent("QuotaCanaryUnpack-\(UUID().uuidString)", isDirectory: true)
    do {
      try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
      try Self.run("/usr/bin/ditto", ["-x", "-k", archive.path, dir.path])
    } catch {
      throw UpdateFailure.bundleMismatch
    }
    let apps = ((try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? [])
      .filter { $0.pathExtension == "app" }
    guard apps.count == 1 else { throw UpdateFailure.bundleMismatch }
    return UnpackedUpdate(app: apps[0], facts: Self.facts(of: apps[0]))
  }

  public func install(_ update: UnpackedUpdate) throws {
    try checkInstallable()
    let fm = FileManager.default
    let parent = currentApp.deletingLastPathComponent()
    // Stage on the same volume, so the swap is a rename, not a copy.
    let staged = parent.appendingPathComponent(".QuotaCanary-update-\(UUID().uuidString).app")
    do {
      try Self.run("/usr/bin/ditto", [update.app.path, staged.path])
      try? fm.removeItem(at: parent.appendingPathComponent(Self.backupName))
      _ = try fm.replaceItemAt(
        currentApp, withItemAt: staged, backupItemName: Self.backupName, options: [.withoutDeletingBackupItem]
      )
    } catch {
      try? fm.removeItem(at: staged)
      throw UpdateFailure.installFailed
    }
    try? fm.removeItem(at: update.app.deletingLastPathComponent())
    do {
      try relaunch(currentApp)
    } catch {
      throw UpdateFailure.relaunchFailed
    }
    terminate()
  }

  /// `open -n` starts a second instance of the new bundle; the caller quits this one.
  public static func openNewInstance(_ app: URL) throws {
    var arguments = ["-n"]
    let environment = ProcessInfo.processInfo.environment
    for name in forwardedVariables {
      if let value = environment[name] { arguments += ["--env", "\(name)=\(value)"] }
    }
    try run("/usr/bin/open", arguments + [app.path])
  }

  static func facts(of app: URL) -> UpdateBundleFacts {
    UpdateBundleFacts(
      identifier: infoValue(app, "CFBundleIdentifier"),
      version: infoValue(app, "CFBundleShortVersionString"),
      architectures: architectures(of: app),
      sealIntact: sealIntact(app)
    )
  }

  /// Read from the plist file, not `Bundle(url:)`, which caches per path.
  static func infoValue(_ app: URL, _ key: String) -> String? {
    let plist = app.appendingPathComponent("Contents/Info.plist")
    guard let data = try? Data(contentsOf: plist),
          let info = try? PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any]
    else { return nil }
    return info[key] as? String
  }

  static func architectures(of app: URL) -> [String] {
    guard let name = infoValue(app, "CFBundleExecutable") else { return [] }
    let binary = app.appendingPathComponent("Contents/MacOS/\(name)")
    guard let bundle = Bundle(path: app.path), bundle.executableURL?.standardizedFileURL == binary.standardizedFileURL
    else { return [] }
    return (bundle.executableArchitectures ?? []).compactMap {
      switch $0.intValue {
      case NSBundleExecutableArchitectureARM64: return "arm64"
      case NSBundleExecutableArchitectureX86_64: return "x86_64"
      default: return nil
      }
    }
  }

  static func sealIntact(_ app: URL) -> Bool {
    var code: SecStaticCode?
    guard SecStaticCodeCreateWithPath(app as CFURL, [], &code) == errSecSuccess, let code else { return false }
    let flags = SecCSFlags(rawValue: kSecCSCheckAllArchitectures | kSecCSStrictValidate)
    return SecStaticCodeCheckValidity(code, flags, nil) == errSecSuccess
  }

  static func run(_ tool: String, _ arguments: [String]) throws {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: tool)
    process.arguments = arguments
    process.standardOutput = FileHandle.nullDevice
    process.standardError = FileHandle.nullDevice
    try process.run()
    process.waitUntilExit()
    guard process.terminationStatus == 0 else { throw UpdateFailure.installFailed }
  }
}

// MARK: - Fakes (tests, synthetic previews, snapshots)

/// Scripted feed bytes and archive bytes; records every request.
public final class FakeUpdateTransport: UpdateTransport {
  public enum Answer {
    case respond(status: Int, body: Data)
    case fail
  }

  public var feed: Answer
  public var archive: Answer
  public private(set) var requests: [(url: URL, headers: [String: String])] = []
  public var feedRequests: Int { requests.filter { !$0.url.path.hasSuffix(".zip") }.count }

  public init(feed: Answer = .fail, archive: Answer = .fail) {
    self.feed = feed
    self.archive = archive
  }

  public func fetch(_ url: URL, headers: [String: String]) async throws -> HTTPResponse {
    requests.append((url, headers))
    switch feed {
    case let .respond(status, body): return HTTPResponse(status: status, body: body)
    case .fail: throw TransportFailure()
    }
  }

  public func download(_ url: URL, headers: [String: String], to destination: URL) async throws {
    requests.append((url, headers))
    switch archive {
    case let .respond(status, body):
      guard status == 200 else { throw TransportFailure() }
      try body.write(to: destination)
    case .fail: throw TransportFailure()
    }
  }
}

/// Records what the updater asked for; `facts` is what "unpacking" reports.
public final class FakeUpdateInstaller: UpdateInstaller {
  public var installable: UpdateFailure?
  public var facts: UpdateBundleFacts
  public var installError: UpdateFailure?
  public private(set) var unpacked: [URL] = []
  public private(set) var installed: [UnpackedUpdate] = []

  public init(facts: UpdateBundleFacts = UpdateBundleFacts(
    identifier: UpdateFeed.bundleIdentifier, version: nil, architectures: ["arm64", "x86_64"], sealIntact: true
  )) {
    self.facts = facts
  }

  public func checkInstallable() throws {
    if let installable { throw installable }
  }

  public func unpack(archive: URL) throws -> UnpackedUpdate {
    unpacked.append(archive)
    return UnpackedUpdate(app: archive.deletingPathExtension().appendingPathExtension("app"), facts: facts)
  }

  public func install(_ update: UnpackedUpdate) throws {
    installed.append(update)
    if let installError { throw installError }
  }
}
