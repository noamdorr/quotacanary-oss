import Foundation
@testable import QuotaCanaryCore
import Testing

/// QUO-275: Settings reopens on the pane it was left on, and the window
/// title names that pane. Only the pane is kept, never field contents.
@MainActor @Suite struct SettingsNavigationTests {
  @Test func startsOnGeneralAndTitlesTheWindowForThePane() {
    let navigation = SettingsNavigation()
    #expect(navigation.pane == .general)
    #expect(navigation.windowTitle == Copy.settingsGeneral)
    navigation.pane = .balanceWarnings
    #expect(navigation.windowTitle == Copy.settingsBalances)
  }

  @Test func reportsEveryPaneChangeForTheTitle() async {
    let navigation = SettingsNavigation()
    var titles: [String] = []
    let watching = Task {
      for await title in Observations({ navigation.windowTitle }) { titles.append(title) }
    }
    defer { watching.cancel() }
    await yieldUntil { titles.count == 1 }
    navigation.pane = .balanceWarnings
    await yieldUntil { titles.count == 2 }
    navigation.pane = .general
    await yieldUntil { titles.count == 3 }
    #expect(titles == [Copy.settingsGeneral, Copy.settingsBalances, Copy.settingsGeneral])
  }

  @Test func paneTitlesAreDistinctAndPlain() {
    let titles = SettingsPane.allCases.map(\.title)
    #expect(Set(titles).count == SettingsPane.allCases.count)
    #expect(titles.allSatisfy { !$0.isEmpty && !$0.contains("\u{2014}") })
  }
}
