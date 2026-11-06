import AppKit
@testable import QuotaCanary
import QuotaCanaryCore
import SwiftUI
import Testing

/// QUO-440: long lists scroll inside a capped height, so the panel stays on screen.
@Suite @MainActor struct PanelScrollTests {
  @Test func quietListShowsInFullUpToTenRowsThenScrolls() {
    let rows = { (count: Int) in [CGFloat](repeating: 28, count: count) }
    #expect(PanelView.fit(attention: [], quiet: rows(7), chrome: 200).quiet.scroll == nil)
    #expect(PanelView.fit(attention: [], quiet: rows(10), chrome: 200).quiet.scroll == nil)
    #expect(PanelView.fit(attention: [], quiet: rows(11), chrome: 200).quiet.scroll == 294)
    #expect(PanelView.fit(attention: [], quiet: rows(30), chrome: 200).quiet.scroll == 294)
  }

  /// QUO-445: under Needs attention the quiet list takes what the popover has
  /// left, no longer a fixed half.
  @Test func quietListTakesTheRoomLeftUnderNeedsAttention() {
    let rows = { (count: Int) in [CGFloat](repeating: 28, count: count) }
    #expect(PanelView.fit(attention: rows(1), quiet: rows(5), chrome: 250).quiet.scroll == nil)
    let long = PanelView.fit(attention: rows(11), quiet: rows(45), chrome: 250)
    #expect(long.attention.height + long.quiet.height == PanelView.maxHeight - 250)
  }

  @Test func thirtyToolsScrollInsideAPanelThatFitsTheSmallestScreen() async throws {
    let model = await SnapshotStacks.model(.stack(count: 30))
    let controller = NSHostingController(rootView: PanelView(model: model))
    let host = controller.view
    host.frame = NSRect(origin: .zero, size: host.fittingSize)
    let window = NSWindow(contentRect: host.frame, styleMask: [.borderless], backing: .buffered, defer: false)
    window.contentViewController = controller
    defer { window.isReleasedWhenClosed = false; window.close() }
    try? await Task.sleep(for: .milliseconds(150))
    host.layoutSubtreeIfNeeded()

    #expect(host.fittingSize.height < 700)
    let scroll = try #require(Self.scrollView(in: host))
    #expect(scroll.frame.height == 294)
    // Every row is in the scrolled content, not just the visible ten and a half.
    #expect((scroll.documentView?.frame.height ?? 0) >= 30 * 28)
  }

  private static func scrollView(in view: NSView) -> NSScrollView? {
    if let scroll = view as? NSScrollView { return scroll }
    return view.subviews.lazy.compactMap { scrollView(in: $0) }.first
  }
}
