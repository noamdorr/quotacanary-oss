import Foundation
@testable import QuotaCanaryCore
import Testing

@MainActor @Suite struct StartAtLoginTests {
  @Test func enablingRegistersWithTheOS() {
    let item = FakeLoginItem()
    let login = StartAtLogin(service: item, preferences: InMemoryPreferencesStore())
    #expect(!login.isOn)
    login.setEnabled(true)
    #expect(item.registerCalls == 1)
    #expect(login.isOn)
    #expect(login.errorMessage == nil)
    login.setEnabled(false)
    #expect(!login.isOn)
  }

  @Test func refusalIsVisibleAndNotFatal() {
    let item = FakeLoginItem(refuses: true)
    let prefs = InMemoryPreferencesStore()
    let login = StartAtLogin(service: item, preferences: prefs)
    login.answerPrompt(enable: true)
    #expect(login.errorMessage == Copy.startAtLoginFailed)
    #expect(!login.isOn)
    // The question stays so the refusal is seen; nothing was recorded as answered.
    #expect(login.showsPrompt(hasConnections: true))
    #expect(!prefs.saved.loginPromptAnswered)
    login.answerPrompt(enable: false)
    #expect(!login.showsPrompt(hasConnections: true))
    #expect(login.errorMessage == nil)
  }

  @Test func registerThatLeavesItOffIsReportedAsRefused() {
    let item = FakeLoginItem()
    item.statusAfterRegister = .notFound
    let login = StartAtLogin(service: item, preferences: InMemoryPreferencesStore())
    login.setEnabled(true)
    #expect(login.errorMessage == Copy.startAtLoginFailed)
  }

  @Test func requiresApprovalCountsAsOnWithAHint() {
    let item = FakeLoginItem()
    item.statusAfterRegister = .requiresApproval
    let login = StartAtLogin(service: item, preferences: InMemoryPreferencesStore())
    login.answerPrompt(enable: true)
    #expect(login.isOn)
    #expect(login.needsApproval)
    #expect(login.errorMessage == nil)
    #expect(login.promptAnswered)
  }

  @Test func promptAsksOnceAfterAConnectionAndRemembersTheAnswer() {
    let prefs = InMemoryPreferencesStore()
    let login = StartAtLogin(service: FakeLoginItem(), preferences: prefs)
    #expect(!login.showsPrompt(hasConnections: false))
    #expect(login.showsPrompt(hasConnections: true))
    login.answerPrompt(enable: false)
    #expect(!login.showsPrompt(hasConnections: true))
    let relaunched = StartAtLogin(service: FakeLoginItem(), preferences: prefs)
    #expect(!relaunched.showsPrompt(hasConnections: true))
  }

  @Test func promptIsSkippedWhenAlreadyOn() {
    let login = StartAtLogin(service: FakeLoginItem(status: .enabled), preferences: InMemoryPreferencesStore())
    #expect(!login.showsPrompt(hasConnections: true))
  }

  @Test func preferencesFileRoundTripsAndToleratesGarbage() throws {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("qc-prefs-\(UUID().uuidString)")
    defer { try? FileManager.default.removeItem(at: dir) }
    let store = JSONFilePreferencesStore(url: dir.appendingPathComponent("preferences.json"))
    #expect(store.load() == Preferences())
    try store.save(Preferences(loginPromptAnswered: true))
    #expect(JSONFilePreferencesStore(url: store.url).load().loginPromptAnswered)
    try Data("not json".utf8).write(to: store.url)
    #expect(store.load() == Preferences())
  }

  @Test func defaultPreferencesLiveNextToConnections() {
    let prefs = JSONFilePreferencesStore().url
    #expect(prefs.lastPathComponent == "preferences.json")
    #expect(prefs.deletingLastPathComponent() == JSONFileConnectionStore.defaultURL().deletingLastPathComponent())
  }
}
