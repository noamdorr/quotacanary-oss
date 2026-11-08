@testable import QuotaCanary
import QuotaCanaryCore
import Testing

/// QUO-346: the menu panel and the stack window each own their connect flow.
/// One shared flag used to open both forms at once.
@MainActor @Suite struct ConnectSurfaceTests {
  private func connectedModel() async -> AppModel {
    await SnapshotStacks.model(.hunter, system: .preview())
  }

  @Test func addingFromThePanelLeavesTheWindowSheetClosed() async {
    let model = await connectedModel()
    model.beginAdding(on: .panel)
    #expect(model.showsConnectForm)
    #expect(!model.isAddingInWindow)
  }

  @Test func addingFromTheWindowLeavesThePanelQuiet() async {
    let model = await connectedModel()
    model.beginAdding(on: .window)
    #expect(model.isAddingInWindow)
    #expect(!model.showsConnectForm)
  }

  @Test(arguments: [ConnectSurface.panel, .window])
  func theBalanceChecklistLandsOnTheSurfaceThatStartedTheConnect(surface: ConnectSurface) async {
    let model = await connectedModel()
    model.beginAdding(on: surface)
    model.provider = .hunter
    model.keyInput = ScriptedScenario.key
    await model.connect()
    #expect(model.watchChoiceID != nil)
    #expect(model.showsConnectForm == (surface == .panel))
    #expect(model.isAddingInWindow == (surface == .window))
  }

  @Test func cancellingClosesWhicheverSurfaceWasAdding() async {
    let model = await connectedModel()
    model.beginAdding(on: .window)
    model.cancelAdding()
    #expect(!model.isAddingInWindow)
    #expect(!model.showsConnectForm)
  }

  /// QUO-352: Add tool in the menu closes the window sheet, and the sheet's
  /// dismiss handler used to cancel the panel's fresh form with it.
  @Test func theWindowSheetClosingForThePanelLeavesThePanelAdding() async {
    let model = await connectedModel()
    model.beginAdding(on: .window)
    model.beginAdding(on: .panel)
    model.windowSheetDismissed()
    #expect(model.isAddingInPanel)
    #expect(model.showsConnectForm)
  }

  /// QUO-362: taking the form to the other surface starts it fresh, so a
  /// half-typed key never moves between windows.
  @Test(arguments: [ConnectSurface.panel, .window])
  func movingTheFormToTheOtherSurfaceStartsItFresh(from surface: ConnectSurface) async {
    let model = await connectedModel()
    model.beginAdding(on: surface)
    model.provider = .hunter
    model.keyInput = "half-typed"
    model.providerSearch = "hun"
    model.beginAdding(on: surface == .panel ? .window : .panel)
    #expect(model.keyInput.isEmpty)
    #expect(model.providerSearch.isEmpty)
  }

  @Test func reopeningOnTheSameSurfaceKeepsTheDraft() async {
    let model = await connectedModel()
    model.beginAdding(on: .window)
    model.keyInput = "half-typed"
    model.beginAdding(on: .window)
    #expect(model.keyInput == "half-typed")
  }

  /// QUO-456: an open form names no tool until one is picked, so a second
  /// connection's "Hunter 2" appears only once Hunter is chosen (QUO-277).
  @Test func theSuggestedNameWaitsForAPick() async {
    let model = await connectedModel()
    model.beginAdding(on: .panel)
    #expect(model.provider == nil)
    #expect(model.nameInput.isEmpty)
    model.provider = .hunter
    #expect(model.nameInput == "Hunter 2")
  }

  /// QUO-456: every open starts clean, after Connect as after Cancel.
  @Test func connectAndCancelBothLeaveNothingPicked() async {
    let model = await connectedModel()
    model.beginAdding(on: .panel)
    model.provider = .hunter
    model.cancelAdding()
    #expect(model.provider == nil)
    model.beginAdding(on: .panel)
    model.provider = .hunter
    model.keyInput = ScriptedScenario.key
    await model.connect()
    #expect(model.connections.count == 2)
    #expect(model.provider == nil)
  }

  /// QUO-456: a picked tool is a touched form. Going to the browser for the
  /// key closes the popover, and the pick has to be there on the way back.
  @Test func closingThePanelKeepsAPickedTool() async {
    let model = await connectedModel()
    model.beginAdding(on: .panel)
    model.panelClosed()
    #expect(!model.isAddingInPanel)
    model.beginAdding(on: .panel)
    model.provider = .hunter
    model.panelClosed()
    #expect(model.isAddingInPanel)
    #expect(model.provider == .hunter)
  }

  /// With no connections the panel shows the first-run form without anyone
  /// calling `beginAdding`; + in the window still starts fresh.
  @Test func theWindowSheetDoesNotInheritTheFirstRunForm() async {
    let model = SnapshotStacks.model(count: 0)
    #expect(model.showsConnectForm)
    model.keyInput = "half-typed"
    model.beginAdding(on: .window)
    #expect(model.keyInput.isEmpty)
  }

  /// SwiftUI writes the binding false before `onDismiss` runs, so a sheet the
  /// user closed arrives here with nothing adding, and still resets the form.
  @Test func dismissingTheWindowSheetStillResetsTheForm() async {
    let model = await connectedModel()
    model.beginAdding(on: .window)
    model.keyInput = "half-typed"
    model.isAddingInWindow = false
    model.windowSheetDismissed()
    #expect(!model.isAddingInWindow)
    #expect(model.keyInput.isEmpty)
  }
}
