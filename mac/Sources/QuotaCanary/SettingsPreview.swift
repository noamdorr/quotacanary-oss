import AppKit
import QuotaCanaryCore
import SwiftUI

/// Opt-in native-window regression probes for Settings and the stack.
/// Fixtures keep credentials, providers, notifications, login items, preferences
/// and updates entirely in memory.
@MainActor
enum SettingsPreview {
  /// `NSAppearance(named:)` returns plain Aqua for the high-contrast names, so
  /// `contrast` only means something with the system Increase contrast switch
  /// on, which this never changes; with it off, `contrast` prints NOT RUN and
  /// exits 2, as `InteractionSmoke` does (QUO-181).
  static func appearance(arguments: [String]) -> NSAppearance? {
    if arguments.contains("contrast") && !NSWorkspace.shared.accessibilityDisplayShouldIncreaseContrast {
      print("NOT RUN: increased contrast needs System Settings > Accessibility > Display > Increase contrast")
      exit(2)
    }
    return NSAppearance(named: arguments.contains("dark") ? .darkAqua : .aqua)
  }

  static func run(arguments: [String]) async {
    let count = arguments.compactMap(Int.init).first ?? 50
    let model = SnapshotStacks.model(count: count)
    await model.scheduler.settle()
    NSApp.appearance = appearance(arguments: arguments)
    let stack = arguments.contains("--check-stack-window")
    // Settings is found by identifier: its title follows the pane (QUO-275).
    let matches: (NSWindow) -> Bool = { stack ? $0.title == Copy.appName : $0.identifier == SettingsWindow.identifier }
    let minimum = NSSize(width: stack ? 760 : 520, height: 480)
    let resized = NSSize(width: stack ? 800 : 560, height: 500)
    let showWindow: () -> Void = {
      if stack { StackWindow.show(model: model) }
      else { SettingsWindow.show(model: model) }
    }
    showWindow()
    await settle()
    guard let window = NSApp.windows.first(where: matches) else { exit(1) }
    var passed = true
    func check(_ condition: Bool, _ message: String) {
      print("\(condition ? "PASS" : "FAIL"): \(message)")
      passed = passed && condition
    }
    check(window.isVisible && window.contentLayoutRect.width >= minimum.width
      && window.contentLayoutRect.height >= minimum.height, "\(count) connections: visible content \(window.contentLayoutRect.size)")
    if let flag = arguments.firstIndex(of: "--capture"), arguments.count > flag + 1 {
      check(capture(window, to: arguments[flag + 1]), "captured actual native window")
    }
    let controller = window.contentViewController
    showWindow()
    await settle()
    check(window.contentViewController === controller, "opening the visible window preserves its drafts")
    check(NSApp.windows.filter { matches($0) && $0.isVisible }.count == 1,
      "only one visible window")
    window.setContentSize(resized)
    await settle()
    check(window.contentLayoutRect.size == resized, "resize remains stable after layout")
    window.close()
    check(!window.isVisible && window.contentViewController == nil, "close releases hosted drafts")
    showWindow()
    await settle()
    check(window.isVisible && window.contentViewController !== controller,
      "reopen mounts fresh controls in the retained window")
    check(window.contentLayoutRect.size == resized, "reopen preserves usable size")
    check(window.contentMinSize.width >= minimum.width && window.contentMinSize.height >= minimum.height,
      "hosting cannot reset the minimum size: \(window.contentMinSize)")
    window.close()
    exit(passed ? 0 : 1)
  }

  private static func settle() async {
    try? await Task.sleep(for: .milliseconds(200))
  }

  private static func capture(_ window: NSWindow, to path: String) -> Bool {
    guard let view = window.contentView?.superview else { return false }
    view.layoutSubtreeIfNeeded()
    guard let rep = view.bitmapImageRepForCachingDisplay(in: view.bounds) else { return false }
    view.cacheDisplay(in: view.bounds, to: rep)
    guard let data = rep.representation(using: .png, properties: [:]) else { return false }
    do { try data.write(to: URL(fileURLWithPath: path)); return true }
    catch { return false }
  }
}
