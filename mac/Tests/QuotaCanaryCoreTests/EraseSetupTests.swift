import Foundation
import QuotaCanaryCore
import Testing

@MainActor @Suite struct EraseSetupTests {
  @Test func inMemoryPreferencesAreErasedToo() throws {
    let prefs = InMemoryPreferencesStore(Preferences(loginPromptAnswered: true, alertsPromptAnswered: true,
      automaticUpdateChecks: true, updatePromptAnswered: true, lastUpdateCheckAt: Date()))
    let service = MonitoringService(credentials: InMemoryCredentialStore(), store: InMemoryConnectionStore(),
      transport: ScriptedTransport([]))
    try EraseLocalData(service: service, preferences: prefs).run()
    #expect(prefs.load() == Preferences())
  }

  @Test func preferencesRefusalIsReported() {
    let service = MonitoringService(credentials: InMemoryCredentialStore(), store: InMemoryConnectionStore(),
      transport: ScriptedTransport([]))
    var storesErased = false
    #expect(throws: EraseError.failed) {
      try EraseLocalData(service: service, preferences: RefusingPreferences()).run(onStoresErased: { storesErased = true })
    }
    #expect(!storesErased)
  }

  @Test func latePermissionAnswerCannotSaveAnErasedSetupChoice() async throws {
    let folder = FileManager.default.temporaryDirectory.appendingPathComponent("qc-erase-setup-\(UUID())")
    defer { try? FileManager.default.removeItem(at: folder) }
    let prefs = JSONFilePreferencesStore(url: folder.appendingPathComponent("preferences.json"))
    let center = HeldPermissionCenter()
    let settings = NotificationSettings(center: center, preferences: prefs)
    let answer = Task { await settings.answerPrompt(enable: true) }
    for _ in 0..<1000 where center.held == nil { await Task.yield() }
    #expect(center.held != nil)
    try prefs.erase()
    settings.resetAfterErase()
    center.held?.resume(returning: true)
    #expect(await answer.value == false)
    await settings.reload()
    #expect(!settings.promptAnswered)
    #expect(settings.permission == .allowed)
    #expect(!FileManager.default.fileExists(atPath: folder.path))
  }
}

private final class RefusingPreferences: PreferencesStore {
  func load() -> Preferences { Preferences() }
  func save(_ preferences: Preferences) throws {}
  func erase() throws { throw EraseError.failed }
}

@MainActor private final class HeldPermissionCenter: NotificationCenterLike {
  var held: CheckedContinuation<Bool, Never>?
  func requestPermission() async -> Bool { await withCheckedContinuation { held = $0 } }
  func status() async -> NotificationPermission { .allowed }
  func deliver(title: String, body: String, id: String, target: NotificationTarget?) async throws {}
}
