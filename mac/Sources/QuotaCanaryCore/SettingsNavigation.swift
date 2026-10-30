import Observation
import Foundation

/// The Settings window's panes (QUO-275).
public enum SettingsPane: String, CaseIterable, Sendable {
  case general
  case balanceWarnings

  /// The tab label, and the window title while the pane is showing.
  public var title: String {
    switch self {
    case .general: return Copy.settingsGeneral
    case .balanceWarnings: return Copy.settingsBalances
    }
  }
}

/// Which pane Settings shows. The Settings window keeps one for the whole
/// session, so reopening (menu action or Command-comma) lands on the last
/// pane. Navigation only: field contents and drafts are not kept here.
@MainActor
@Observable
public final class SettingsNavigation {
  public var pane: SettingsPane

  public init(pane: SettingsPane = .general) {
    self.pane = pane
  }

  public var windowTitle: String { pane.title }
}
