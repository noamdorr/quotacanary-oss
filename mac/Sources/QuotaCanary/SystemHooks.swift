import AppKit
import Foundation
import Network
import QuotaCanaryCore
import ServiceManagement

/// Real sleep/wake (NSWorkspace) and reachability (NWPathMonitor) for the
/// poll scheduler. Observes only; never keeps the Mac awake.
@MainActor
final class SystemLifecycle: LifecycleSource, ReachabilityProbe {
  /// Optimistic until the first path update, so a launch check is not
  /// skipped on a race; a failure while actually offline is still classified
  /// as offline once the monitor reports it.
  private(set) var isOnline = true
  private var handler: (@MainActor (LifecycleEvent) -> Void)?
  private var observers: [NSObjectProtocol] = []
  private let monitor = NWPathMonitor()

  func start(_ handler: @escaping @MainActor (LifecycleEvent) -> Void) {
    self.handler = handler
    let center = NSWorkspace.shared.notificationCenter
    observers.append(center.addObserver(
      forName: NSWorkspace.willSleepNotification, object: nil, queue: .main
    ) { [weak self] _ in MainActor.assumeIsolated { self?.handler?(.willSleep) } })
    observers.append(center.addObserver(
      forName: NSWorkspace.didWakeNotification, object: nil, queue: .main
    ) { [weak self] _ in MainActor.assumeIsolated { self?.handler?(.didWake) } })
    monitor.pathUpdateHandler = { [weak self] path in
      let online = path.status == .satisfied
      MainActor.assumeIsolated { self?.update(online: online) }
    }
    monitor.start(queue: .main)
  }

  private func update(online: Bool) {
    guard online != isOnline else { return }
    isOnline = online
    handler?(.reachabilityChanged(online: online))
  }
}

/// `SMAppService.mainApp`. Fails (visibly) for a binary outside a real bundle.
final class SMAppLoginItem: LoginItemService {
  var status: LoginItemStatus { Self.map(SMAppService.mainApp.status) }

  func register() throws { try SMAppService.mainApp.register() }
  func unregister() throws { try SMAppService.mainApp.unregister() }

  static func map(_ status: SMAppService.Status) -> LoginItemStatus {
    switch status {
    case .enabled: return .enabled
    case .requiresApproval: return .requiresApproval
    case .notRegistered: return .notRegistered
    case .notFound: return .notFound
    @unknown default: return .notFound
    }
  }

  /// `QuotaCanary --login-item-status`: prints the real status. Read-only;
  /// never registers or unregisters anything.
  static func printStatus() -> Int32 {
    let raw = SMAppService.mainApp.status
    print("SMAppService.mainApp.status: \(map(raw).rawValue) (raw \(raw.rawValue))")
    print("bundle: \(Bundle.main.bundleIdentifier ?? "none") at \(Bundle.main.bundleURL.path)")
    return 0
  }
}

/// Everything the scheduler and start-at-login need from the system, so the
/// app, synthetic mode and snapshots can each pick their own.
@MainActor
struct SystemHooks {
  var clock: SchedulerClock
  var lifecycle: LifecycleSource
  var reachability: ReachabilityProbe
  var loginItem: LoginItemService
  var preferences: PreferencesStore
  /// macOS notifications (QUO-131): the real center, or a fake.
  var notifier: NotificationCenterLike
  /// Update checks and installs (QUO-139). Shares `clock` and `preferences`.
  var updater: Updater
  /// What `AppModel(service:)` uses. Snapshots swap in `preview()`.
  static var makeDefault: () -> SystemHooks = { fromEnvironment() }

  /// Real clock and lifecycle always. Synthetic mode keeps login item and
  /// preferences in memory so it touches nothing on disk or in the OS.
  /// Updates are real in synthetic mode too (they never touch providers or
  /// Keychain), with the in-memory preferences, so automatic checks start off.
  static func fromEnvironment() -> SystemHooks {
    let system = SystemLifecycle()
    let clock = SystemClock()
    if ProcessInfo.processInfo.environment["QUOTACANARY_SYNTHETIC"] != nil {
      let preferences = InMemoryPreferencesStore()
      return SystemHooks(
        clock: clock, lifecycle: system, reachability: system,
        loginItem: FakeLoginItem(), preferences: preferences,
        notifier: FakeNotificationCenter(), updater: realUpdater(clock: clock, preferences: preferences)
      )
    }
    let preferences = JSONFilePreferencesStore()
    return SystemHooks(
      clock: clock, lifecycle: system, reachability: system,
      loginItem: SMAppLoginItem(), preferences: preferences,
      notifier: SystemNotificationCenter(), updater: realUpdater(clock: clock, preferences: preferences)
    )
  }

  /// The production feed unless QUOTACANARY_UPDATE_FEED points at a local test feed.
  static func realUpdater(
    clock: SchedulerClock, preferences: PreferencesStore,
    terminate: @escaping () -> Void = { MainActor.assumeIsolated { NSApp.terminate(nil) } }
  ) -> Updater {
    Updater(
      transport: URLSessionUpdateTransport(),
      installer: SystemUpdateInstaller(terminate: terminate),
      clock: clock, preferences: preferences, currentVersion: AppVersionInfo.short,
      feedURL: UpdateFeed.feedURL(environment: ProcessInfo.processInfo.environment)
    )
  }

  /// Frozen clock, scripted network, fake login item. Prompt answered by
  /// default so it only shows where a snapshot asks for it.
  static func preview(
    online: Bool = true, promptAnswered: Bool = true, loginRefuses: Bool = false,
    alertsPromptAnswered: Bool = true, notifier: NotificationCenterLike? = nil,
    updatePromptAnswered: Bool = true, updater: Updater? = nil
  ) -> SystemHooks {
    let clock = ManualClock(now: Date())
    let preferences = InMemoryPreferencesStore(Preferences(
      loginPromptAnswered: promptAnswered, alertsPromptAnswered: alertsPromptAnswered,
      updatePromptAnswered: updatePromptAnswered
    ))
    return SystemHooks(
      clock: clock, lifecycle: ManualLifecycle(),
      reachability: ScriptedReachability(online: online),
      loginItem: FakeLoginItem(refuses: loginRefuses),
      preferences: preferences,
      notifier: notifier ?? FakeNotificationCenter(permission: .allowed),
      updater: updater ?? Updater(
        transport: FakeUpdateTransport(), installer: FakeUpdateInstaller(), clock: clock,
        preferences: preferences, currentVersion: "0.1.0"
      )
    )
  }
}
