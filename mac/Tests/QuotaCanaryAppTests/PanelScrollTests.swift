import AppKit
@testable import QuotaCanary
import QuotaCanaryCore
import SwiftUI
import Testing

/// QUO-440: long lists scroll inside a capped height, so the panel stays on screen.
@Suite @MainActor struct PanelScrollTests {
  @Test func quietListShowsInFullUpToTenRowsThenScrolls() {
    #expect(PanelView.quietScrollHeight(quiet: 7, attention: 0) == nil)
    #expect(PanelView.quietScrollHeight(quiet: 10, attention: 0) == nil)
    #expect(PanelView.quietScrollHeight(quiet: 11, attention: 0) == 294)
    #expect(PanelView.quietScrollHeight(quiet: 30, attention: 0) == 294)
  }

  @Test func quietListTakesHalfTheRowsUnderNeedsAttention() {
    #expect(PanelView.quietScrollHeight(quiet: 5, attention: 1) == nil)
    #expect(PanelView.quietScrollHeight(quiet: 6, attention: 1) == 154)
    #expect(PanelView.quietScrollHeight(quiet: 45, attention: 11) == 154)
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
