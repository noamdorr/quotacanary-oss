import Observation
import Foundation

// Start at login (QUO-132): an explicit first-run choice and a setting. macOS
// owns whether the app is registered; this only remembers that the first-run
// question was answered. Failure to enable is shown, never fatal.

public enum LoginItemStatus: String, Equatable, Sendable {
  case enabled
  case requiresApproval
  case notRegistered
  case notFound
}

/// The OS login-item registration. Real one: `SMAppService.mainApp`.
public protocol LoginItemService: AnyObject {
  var status: LoginItemStatus { get }
  func register() throws
  func unregister() throws
}

public struct LoginItemRefused: Error {}

/// Test and synthetic-mode stand-in. `refuses` makes register/unregister throw.
public final class FakeLoginItem: LoginItemService {
  public var status: LoginItemStatus
  public var refuses: Bool
  /// What a successful register leaves behind (`.requiresApproval` to simulate that path).
  public var statusAfterRegister: LoginItemStatus = .enabled
  public private(set) var registerCalls = 0

  public init(status: LoginItemStatus = .notRegistered, refuses: Bool = false) {
    self.status = status
    self.refuses = refuses
  }

  public func register() throws {
    registerCalls += 1
    if refuses { throw LoginItemRefused() }
    status = statusAfterRegister
  }

  public func unregister() throws {
    if refuses { throw LoginItemRefused() }
    status = .notRegistered
  }
}

// MARK: - Preferences

/// Small app preferences, stored next to connections.json. No secrets.
public struct Preferences: Codable, Equatable, Sendable {
  public var loginPromptAnswered: Bool
  /// Whether the "Turn on alerts?" row was answered (QUO-131).
  public var alertsPromptAnswered: Bool
  /// Opt-in daily update checks (QUO-139). Off until the user says yes.
  public var automaticUpdateChecks: Bool
  /// Whether the "Check for updates automatically?" row was answered.
  public var updatePromptAnswered: Bool
  /// Last update check that got a verified answer from the feed.
  public var lastUpdateCheckAt: Date?

  public init(
    loginPromptAnswered: Bool = false, alertsPromptAnswered: Bool = false, automaticUpdateChecks: Bool = false,
    updatePromptAnswered: Bool = false, lastUpdateCheckAt: Date? = nil
  ) {
    self.loginPromptAnswered = loginPromptAnswered
    self.alertsPromptAnswered = alertsPromptAnswered
    self.automaticUpdateChecks = automaticUpdateChecks
    self.updatePromptAnswered = updatePromptAnswered
    self.lastUpdateCheckAt = lastUpdateCheckAt
  }

  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    loginPromptAnswered = try c.decodeIfPresent(Bool.self, forKey: .loginPromptAnswered) ?? false
    alertsPromptAnswered = try c.decodeIfPresent(Bool.self, forKey: .alertsPromptAnswered) ?? false
    automaticUpdateChecks = try c.decodeIfPresent(Bool.self, forKey: .automaticUpdateChecks) ?? false
    updatePromptAnswered = try c.decodeIfPresent(Bool.self, forKey: .updatePromptAnswered) ?? false
    lastUpdateCheckAt = try c.decodeIfPresent(Date.self, forKey: .lastUpdateCheckAt)
  }
}

public protocol PreferencesStore: AnyObject {
  /// Missing or unreadable preferences load as defaults.
  func load() -> Preferences
  func save(_ preferences: Preferences) throws
  func erase() throws
}

public final class JSONFilePreferencesStore: PreferencesStore {
  public let url: URL

  public init(url: URL = JSONFileConnectionStore.defaultURL()
    .deletingLastPathComponent().appendingPathComponent("preferences.json"))
  {
    self.url = url
  }

  public func load() -> Preferences {
    guard let data = try? Data(contentsOf: url) else { return Preferences() }
    return (try? JSONDecoder().decode(Preferences.self, from: data)) ?? Preferences()
  }

  public func erase() throws {
    if FileManager.default.fileExists(atPath: url.path) { try FileManager.default.removeItem(at: url) }
  }

  public func save(_ preferences: Preferences) throws {
    try FileManager.default.createDirectory(
      at: url.deletingLastPathComponent(), withIntermediateDirectories: true
    )
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    try encoder.encode(preferences).write(to: url, options: .atomic)
  }
}

public final class InMemoryPreferencesStore: PreferencesStore {
  public private(set) var saved: Preferences

  public init(_ preferences: Preferences = Preferences()) {
    saved = preferences
  }

  public func erase() throws { saved = Preferences() }
  public func load() -> Preferences { saved }
  public func save(_ preferences: Preferences) throws { saved = preferences }
}

// MARK: - Controller

@MainActor
@Observable
public final class StartAtLogin {
  public private(set) var status: LoginItemStatus
  public private(set) var errorMessage: String?
  public private(set) var promptAnswered: Bool

  private let service: LoginItemService
  private let preferences: PreferencesStore

  public init(service: LoginItemService, preferences: PreferencesStore) {
    self.service = service
    self.preferences = preferences
    status = service.status
    promptAnswered = preferences.load().loginPromptAnswered
  }

  /// On, including "on but waiting for approval in System Settings".
  public var isOn: Bool { status == .enabled || status == .requiresApproval }
  public var needsApproval: Bool { status == .requiresApproval }

  /// Registers or unregisters. A refusal becomes `errorMessage`; nothing throws.
  public func setEnabled(_ on: Bool) {
    errorMessage = nil
    do {
      if on { try service.register() } else { try service.unregister() }
    } catch {
      errorMessage = on ? Copy.startAtLoginFailed : Copy.startAtLoginDisableFailed
    }
    status = service.status
    if on, errorMessage == nil, !isOn { errorMessage = Copy.startAtLoginFailed }
  }

  /// The first-run row. Enable only counts as answered once macOS accepts it,
  /// so a refusal stays visible next to the buttons.
  public func answerPrompt(enable: Bool) {
    if enable {
      setEnabled(true)
      guard errorMessage == nil else { return }
    } else {
      errorMessage = nil
    }
    promptAnswered = true
    var saved = preferences.load()
    saved.loginPromptAnswered = true
    try? preferences.save(saved) // worst case the question comes back next launch
  }

  /// Ask once, after something is connected, unless it is already on.
  public func showsPrompt(hasConnections: Bool) -> Bool {
    hasConnections && !promptAnswered && !isOn
  }

  /// Clears app-owned setup choices without changing OS registration.
  public func resetAfterErase() {
    promptAnswered = false
    errorMessage = nil
    reload()
  }

  /// Re-reads the OS status (the user may have changed it in System Settings).
  public func reload() {
    status = service.status
  }
}
