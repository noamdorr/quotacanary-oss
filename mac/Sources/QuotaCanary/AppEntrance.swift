import AppKit

/// What the app brings up by itself (QUO-443). A launch with nothing connected
/// opens the popover on its connect form; opening the app again while it runs
/// shows the stack window, which works even when macOS hides the bird.
enum Entrance: Equatable {
  case nothing, popover, stackWindow

  /// Modes that set up their own windows, or none, and stay as they were.
  static let ownModes = ["--demo", "--design-preview", "--settings-preview"]

  static func atLaunch(arguments: [String], hasConnections: Bool) -> Entrance {
    hasConnections || arguments.contains(where: ownModes.contains) ? .nothing : .popover
  }

  /// The popover hangs off the bird; without it the window is the way in.
  func resolved(statusItemFound: Bool) -> Entrance {
    self == .popover && !statusItemFound ? .stackWindow : self
  }

  static func onReopen(arguments: [String]) -> Entrance {
    arguments.contains(where: ownModes.contains) ? .nothing : .stackWindow
  }
}

@MainActor
final class AppEntranceDelegate: NSObject, NSApplicationDelegate {
  /// Set by QuotaCanaryApp.init, before launching finishes.
  static var model: AppModel?

  func applicationDidFinishLaunching(_: Notification) {
    guard let model = Self.model,
      Entrance.atLaunch(arguments: CommandLine.arguments, hasConnections: model.hasAnyConnection) == .popover
    else { return }
    Task { @MainActor in
      let button = await Self.statusButton()
      if Entrance.popover.resolved(statusItemFound: button != nil) == .popover {
        button?.performClick(nil)
      } else {
        StackWindow.show(model: model)
      }
    }
  }

  func applicationShouldHandleReopen(_: NSApplication, hasVisibleWindows _: Bool) -> Bool {
    if let model = Self.model, Entrance.onReopen(arguments: CommandLine.arguments) == .stackWindow {
      StackWindow.show(model: model)
    }
    return false
  }

  /// The MenuBarExtra's button, polled for up to two seconds while SwiftUI places it.
  private static func statusButton() async -> NSStatusBarButton? {
    func find(_ view: NSView?) -> NSStatusBarButton? {
      guard let view else { return nil }
      if let button = view as? NSStatusBarButton { return button }
      return view.subviews.lazy.compactMap(find).first
    }
    for _ in 0..<40 {
      if let button = NSApp.windows.lazy.compactMap({ find($0.contentView) }).first(where: { $0.window?.isVisible == true }) {
        return button
      }
      try? await Task.sleep(for: .milliseconds(50))
    }
    return nil
  }
}
