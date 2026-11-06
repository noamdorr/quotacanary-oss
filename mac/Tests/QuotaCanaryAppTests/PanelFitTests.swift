import AppKit
@testable import QuotaCanary
import QuotaCanaryCore
import SwiftUI
import Testing

/// QUO-445: both popover lists show a cut row and a count when rows are
/// hidden, and the popover fits the smallest supported screen.
@Suite @MainActor struct PanelFitTests {
  // MARK: The fit, from row heights

  @Test func attentionListDoesNotEndOnARowBoundary() throws {
    for height: CGFloat in [28, 37, 46] {
      let fit = PanelView.fit(attention: Array(repeating: height, count: 25), quiet: [], chrome: 200)
      let scroll = try #require(fit.attention.scroll)
      #expect(Self.cutsARow(scroll, rowHeight: height), "\(height)-point rows")
    }
  }

  /// Rows of mixed heights, any room: the cut shows a third to two thirds of the row it crosses.
  @Test func theCutFollowsMeasuredRowsNotAFixedHeight() {
    let rows: [CGFloat] = [28, 37, 37, 28, 37, 46, 37, 28, 37, 37, 28, 37]
    for room in stride(from: CGFloat(60), through: 380, by: 1) {
      let fit = PanelView.fit(rows, in: room)
      var top: CGFloat = 0
      var cutsARow = false
      for row in rows {
        if let scroll = fit.scroll, scroll >= top + row / 3 - 0.001, scroll <= top + row * 2 / 3 + 0.001 { cutsARow = true }
        top += row
      }
      #expect(cutsARow, "room \(room)")
      #expect(fit.height == room && fit.scroll! <= room && room - fit.scroll! < 37, "room \(room)")
    }
  }

  @Test func listsInFullAreNotPadded() {
    #expect(PanelView.fit([28, 37], in: 294) == PanelView.ListFit(height: 65, scroll: nil))
  }

  /// Any mix of row heights and chrome: never past the cap, never shorter for one more row.
  @Test func heightsStayUnderTheCapAndNeverShrinkAsRowsAreAdded() {
    let heights: [CGFloat] = [28, 37, 28, 46, 37, 28, 28, 37]
    for chrome: CGFloat in [180, 260, 340, 420] {
      for quietCount in [0, 3, 12, 40] {
        let quiet = (0..<quietCount).map { heights[$0 % heights.count] }
        var previous: CGFloat = 0
        for count in 0...40 {
          let attention = (0..<count).map { heights[($0 * 3) % heights.count] }
          let fit = PanelView.fit(attention: attention, quiet: quiet, chrome: chrome)
          let total = chrome + fit.attention.height + fit.quiet.height
          #expect(total <= PanelView.maxHeight, "chrome \(chrome), quiet \(quietCount), at risk \(count)")
          #expect(total >= previous, "chrome \(chrome), quiet \(quietCount), at risk \(count)")
          previous = total
        }
      }
    }
  }

  // MARK: The rendered popover

  /// 25 at-risk balances: the visible part ends partway through a row, every row is scrollable.
  @Test func twentyFiveAtRiskBalancesShowACutRow() async throws {
    let (_, scroll) = await Self.render(.atRisk(25))
    let view = try #require(scroll)
    let content = view.documentView?.frame.height ?? 0
    #expect(content >= 25 * 28)
    #expect(view.frame.height < content) // rows are hidden, and scrollable
    // These short rows sit on the edge between one line (28) and two (37), and
    // some renders wrap only part of them. The average is a row height only
    // when they all agree; mixed heights are covered by `fit`'s own tests and
    // by the long-name renders below.
    let row = content / 25
    if [28.0, 37.0].contains(where: { abs(row - $0) < 0.5 }) {
      #expect(Self.cutsARow(view.frame.height, rowHeight: row))
    }
  }

  @Test(arguments: [11, 25, 100])
  func longAttentionListsScrollWithACut(count: Int) async throws {
    let (height, scroll) = await Self.render(.atRisk(count, longNames: true))
    let view = try #require(scroll)
    let content = view.documentView?.frame.height ?? 0
    #expect(view.frame.height < content)
    let row = content / CGFloat(count) // two-line rows, all one height
    #expect(Self.cutsARow(view.frame.height, rowHeight: row), "\(row)-point rows")
    #expect(height <= PanelView.maxHeight)
  }

  @Test func tenAtRiskAndTwelveHealthyFitTheSmallestScreen() async {
    let (height, _) = await Self.render(.atRisk(10, healthy: 12, longNames: true))
    #expect(height <= PanelView.maxHeight)
  }

  /// Every count from 0 to 30, with and without the first-run prompts and an update waiting.
  @Test(arguments: [false, true])
  func popoverHeightIsCappedAndNeverShrinksAsBalancesFallAtRisk(prompts: Bool) async {
    let updaters = prompts
      ? await Scenarios.checkedUpdaters(downloads: FileManager.default.temporaryDirectory.appendingPathComponent("QuotaCanaryFitUpdates"))
      : nil
    var previous: CGFloat = 0
    for count in 0...30 {
      let system: SystemHooks? = prompts ? .preview(
        promptAnswered: false, loginRefuses: true, alertsPromptAnswered: false,
        notifier: FakeNotificationCenter(permission: .denied), updatePromptAnswered: false, updater: updaters?.ready
      ) : nil
      let (height, _) = await Self.render(.atRisk(count, healthy: 12, longNames: true), system: system)
      #expect(height <= PanelView.maxHeight, "\(count) at risk")
      #expect(height >= previous - 0.5, "\(count) at risk: \(height) after \(previous)")
      previous = height
    }
  }

  // MARK: Closing the popover

  @Test func closingThePopoverOnAnUntouchedFormReturnsToTheBalances() async {
    let model = await SnapshotStacks.model(.atRisk(3, healthy: 2))
    model.beginAdding(on: .panel)
    #expect(model.showsConnectForm)
    model.panelClosed()
    #expect(!model.showsConnectForm)
    #expect(model.shown.panel.attention.count == 3)
  }

  @Test func typedInputStaysWithItsCancelOneClickAway() async {
    let model = await SnapshotStacks.model(.atRisk(3, healthy: 2))
    model.beginAdding(on: .panel)
    model.keyInput = "half-typed"
    model.panelClosed()
    #expect(model.showsConnectForm && model.keyInput == "half-typed")
    model.cancelAdding()
    #expect(!model.showsConnectForm)

    model.beginAdding(on: .panel)
    model.providerSearch = "hun"
    model.panelClosed()
    #expect(model.showsConnectForm)
  }

  @Test func firstRunStillOpensOnTheConnectForm() {
    let model = AppModel(service: Scenarios.syntheticService())
    model.panelClosed()
    #expect(model.showsConnectForm)
  }

  // MARK: Helpers

  /// The panel's settled height (its measured rows fed back in) and its first scroll view.
  private static func render(_ stack: StackScenario, system: SystemHooks? = nil) async -> (CGFloat, NSScrollView?) {
    let model: AppModel
    if var hooks = system {
      hooks.clock = ManualClock(now: Scenarios.checkedAt)
      model = AppModel(service: stack.service(), system: hooks)
      await model.scheduler.settle()
      await model.notifications.reload()
    } else {
      model = await SnapshotStacks.model(stack)
    }
    let controller = NSHostingController(rootView: PanelView(model: model))
    let host = controller.view
    host.frame = NSRect(origin: .zero, size: host.fittingSize)
    let window = NSWindow(contentRect: host.frame, styleMask: [.borderless], backing: .buffered, defer: false)
    window.contentViewController = controller
    window.isReleasedWhenClosed = false
    defer { window.close() }
    // A scrolling list holds the total height still while the measured rows
    // are fed back in, so an unchanged size alone is not settled: the list's
    // own frame and content must hold still too, for four passes.
    var size = CGSize.zero
    var list: [CGFloat] = []
    var stable = 0
    for _ in 0..<50 where stable < 4 {
      try? await Task.sleep(for: .milliseconds(40))
      host.layoutSubtreeIfNeeded()
      let next = host.fittingSize
      let scroll = scrollView(in: host)
      let nextList = [scroll?.frame.height ?? 0, scroll?.documentView?.frame.height ?? 0]
      stable = next == size && nextList == list ? stable + 1 : 0
      size = next
      list = nextList
      window.setContentSize(next)
    }
    return (size.height, scrollView(in: host))
  }

  /// With rows all one height: a third to two thirds of a row shows at the bottom.
  private static func cutsARow(_ height: CGFloat, rowHeight: CGFloat) -> Bool {
    let shown = height.truncatingRemainder(dividingBy: rowHeight)
    return shown >= rowHeight / 3 - 0.5 && shown <= rowHeight * 2 / 3 + 0.5
  }

  private static func scrollView(in view: NSView) -> NSScrollView? {
    if let scroll = view as? NSScrollView { return scroll }
    return view.subviews.lazy.compactMap { scrollView(in: $0) }.first
  }
}
