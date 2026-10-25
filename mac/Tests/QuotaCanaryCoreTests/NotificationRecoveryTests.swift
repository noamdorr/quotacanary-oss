import Foundation
import Testing

@testable import QuotaCanaryCore

@MainActor @Suite struct NotificationRecoveryTests {
  @Test func eachPermissionMapsToItsControl() {
    #expect(NotificationControl.forPermission(.denied) == .openSettings)
    #expect(NotificationControl.forPermission(.notAsked) == .turnOn)
    #expect(NotificationControl.forPermission(.allowed) == .none)
    #expect(NotificationControl.forPermission(.unavailable) == .none)
  }

  @Test func settingsURLTargetsTheNotificationsPaneForThisApp() {
    #expect(NotificationControl.settingsURL(bundleID: "com.example.App").absoluteString
      == "x-apple.systempreferences:com.apple.Notifications-Settings.extension?id=com.example.App")
    #expect(NotificationControl.settingsURL(bundleID: nil).absoluteString
      == "x-apple.systempreferences:com.apple.Notifications-Settings.extension")
  }

  @Test func reloadOnReturnPicksUpAChangeMadeInSystemSettings() async {
    let center = FakeNotificationCenter(permission: .denied)
    let settings = NotificationSettings(center: center, preferences: InMemoryPreferencesStore())
    await settings.reload()
    #expect(NotificationControl.forPermission(settings.permission) == .openSettings)
    center.permission = .allowed // user flipped it in System Settings
    await settings.reload()
    #expect(settings.permission == .allowed)
    #expect(settings.statusLine == Copy.alertsAllowed)
    #expect(NotificationControl.forPermission(settings.permission) == .none)
  }

  @Test func loginItemReloadPicksUpApprovalGrantedInSystemSettings() {
    let item = FakeLoginItem(status: .requiresApproval)
    let login = StartAtLogin(service: item, preferences: InMemoryPreferencesStore())
    #expect(login.needsApproval)
    item.status = .enabled
    login.reload()
    #expect(!login.needsApproval)
    #expect(login.isOn)
  }
}
