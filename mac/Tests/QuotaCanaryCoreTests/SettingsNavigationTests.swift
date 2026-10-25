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

  @Test func publishesEveryPaneChangeForTheTitle() {
    let navigation = SettingsNavigation()
    var titles: [String] = []
    let sink = navigation.$pane.dropFirst().sink { titles.append($0.title) }
    navigation.pane = .balanceWarnings
    navigation.pane = .general
    #expect(titles == [Copy.settingsBalances, Copy.settingsGeneral])
    sink.cancel()
  }

  @Test func paneTitlesAreDistinctAndPlain() {
    let titles = SettingsPane.allCases.map(\.title)
    #expect(Set(titles).count == SettingsPane.allCases.count)
    #expect(titles.allSatisfy { !$0.isEmpty && !$0.contains("\u{2014}") })
  }
}
