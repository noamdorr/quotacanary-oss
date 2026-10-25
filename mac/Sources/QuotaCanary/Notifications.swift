import AppKit
import Foundation
import QuotaCanaryCore
import SwiftUI
import UserNotifications

/// The real macOS notification center (QUO-131). `UNUserNotificationCenter`
/// needs an app bundle: in `swift run` there is none, and touching it raises
/// an Objective-C exception, so outside a bundle this reports `.unavailable`
/// and every delivery fails visibly instead.
@MainActor
final class SystemNotificationCenter: NSObject, NotificationCenterLike, UNUserNotificationCenterDelegate {
  static var isBundled: Bool {
    Bundle.main.bundleIdentifier != nil && Bundle.main.bundleURL.pathExtension == "app"
  }

  private let center: UNUserNotificationCenter?
  /// Opens the window for a clicked notification (QUO-266). A click that
  /// launched the app can arrive before the model sets this, so it waits.
  private var pendingOpen: NotificationTarget??
  var onOpen: (@MainActor (NotificationTarget?) -> Void)? {
    didSet {
      guard let onOpen, let pending = pendingOpen else { return }
      pendingOpen = nil
      onOpen(pending)
    }
  }

  override init() {
    center = Self.isBundled ? UNUserNotificationCenter.current() : nil
    super.init()
    center?.delegate = self
  }

  func requestPermission() async -> Bool {
    guard let center else { return false }
    return (try? await center.requestAuthorization(options: [.alert, .sound])) ?? false
  }

  func status() async -> NotificationPermission {
    guard let center else { return .unavailable }
    return Self.map(await center.notificationSettings().authorizationStatus)
  }

  func deliver(title: String, body: String, id: String, target: NotificationTarget?) async throws {
    guard let center else { throw NotificationDeliveryError.notAllowed(.unavailable) }
    let state = await status()
    guard state == .allowed else { throw NotificationDeliveryError.notAllowed(state) }
    let content = UNMutableNotificationContent()
    content.title = title
    content.body = body
    content.sound = .default
    if let target { content.userInfo = target.userInfo }
    do {
      try await center.add(UNNotificationRequest(identifier: id, content: content, trigger: nil))
    } catch {
      throw NotificationDeliveryError.failed(code: (error as NSError).code)
    }
  }

  static func map(_ status: UNAuthorizationStatus) -> NotificationPermission {
    switch status {
    case .notDetermined: return .notAsked
    case .denied: return .denied
    case .authorized, .provisional: return .allowed
    @unknown default: return .allowed
    }
  }

  /// A menu bar app is often "active" while its panel is open; without this
  /// macOS would skip the banner. Whether it shows is still up to macOS.
  nonisolated func userNotificationCenter(
    _: UNUserNotificationCenter, willPresent _: UNNotification
  ) async -> UNNotificationPresentationOptions {
    [.banner, .list, .sound]
  }

  /// A click on the banner or in Notification Center. Only the default
  /// action opens anything; dismissing does not.
  nonisolated func userNotificationCenter(
    _: UNUserNotificationCenter, didReceive response: UNNotificationResponse
  ) async {
    guard response.actionIdentifier == UNNotificationDefaultActionIdentifier else { return }
    let target = NotificationTarget(userInfo: response.notification.request.content.userInfo)
    await MainActor.run {
      if let onOpen { onOpen(target) } else { pendingOpen = .some(target) }
    }
  }
}

extension AppModel {
  /// Opens the stack on the notification's balance, or plainly when it is gone.
  func openNotification(_ target: NotificationTarget?) {
    switch NotificationRoute.resolve(target, available: shown.notificationTargets) {
    case let .select(key): StackWindow.show(model: self, selecting: key)
    case .openOnly: StackWindow.show(model: self)
    }
  }
}

// MARK: - Headless check

enum NotifyTest {
  /// `QuotaCanary --notify-test`: from the bundled app, ask for permission
  /// (macOS may show its prompt; nobody has to answer it) and hand one
  /// synthetic notification to macOS, printing what the API returned.
  @MainActor
  static func run() async -> Int32 {
    print("bundle: \(Bundle.main.bundleIdentifier ?? "none") at \(Bundle.main.bundleURL.path)")
    let center = SystemNotificationCenter()
    print("status before: \(await center.status().rawValue)")
    let granted = await withTimeout(20) { await center.requestPermission() }
    switch granted {
    case .none: print("requestPermission: no answer within 20s (a macOS prompt is probably waiting)")
    case let .some(value): print("requestPermission: \(value)")
    }
    let state = await center.status()
    print("status after: \(state.rawValue)")
    do {
      try await center.deliver(
        title: Copy.testNotificationTitle, body: Copy.testNotificationBody, id: "quotacanary.test"
      )
      print("deliver: handed to macOS (accepted; whether it shows is up to macOS)")
      return 0
    } catch let NotificationDeliveryError.notAllowed(permission) {
      print("deliver: not submitted, permission \(permission.rawValue)")
    } catch let NotificationDeliveryError.failed(code) {
      print("deliver: macOS refused, code \(code.map(String.init) ?? "none")")
    } catch {
      print("deliver: failed")
    }
    return 1
  }

  /// Returns nil when `operation` has not finished within `seconds`. The
  /// operation keeps running (a permission request cannot be cancelled).
  @MainActor
  private static func withTimeout<T>(_ seconds: Double, _ operation: @escaping @MainActor () async -> T) async -> T? {
    await withCheckedContinuation { (continuation: CheckedContinuation<T?, Never>) in
      var done = false
      func finish(_ value: T?) {
        guard !done else { return }
        done = true
        continuation.resume(returning: value)
      }
      Task { @MainActor in finish(await operation()) }
      Task { @MainActor in
        try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
        finish(nil)
      }
    }
  }
}
