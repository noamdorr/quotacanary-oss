import AppKit
import QuotaCanaryCore
import SwiftUI

/// Opt-in interaction smoke check for the real stack and Settings windows.
/// Drives them with synthesized in-process mouse and key events (no Accessibility
/// permission, no UI automation framework) and reads back the AppKit-backed
/// controls SwiftUI exposes: text fields, segmented filters, sheets.
/// Fixtures are in memory; no key is ever typed and no provider is called.
@MainActor
enum InteractionSmoke {
  private static var passed = true

  private static func check(_ condition: Bool, _ message: String) {
    print("\(condition ? "PASS" : "FAIL"): \(message)")
    passed = passed && condition
  }

  /// Polls instead of sleeping a fixed time: SwiftUI and sheet animations
  /// land at different speeds, and a fixed wait made this check flaky.
  private static func until(_ condition: () -> Bool) async -> Bool {
    for _ in 0..<60 {
      if condition() { return true }
      try? await Task.sleep(for: .milliseconds(50))
    }
    return condition()
  }

  private static func expect(_ message: @autoclosure () -> String, _ condition: () -> Bool) async {
    let result = await until(condition)
    check(result, message())
  }

  static func run(arguments: [String]) async {
    setvbuf(stdout, nil, _IOLBF, 0) // keep PASS/FAIL lines when a run is killed
    let count = arguments.compactMap(Int.init).first ?? 50
    let model = SnapshotStacks.model(count: count)
    await model.scheduler.settle()
    // NSAppearance(named:) returns plain Aqua for the high-contrast names, so real
    // increased contrast comes only from the system switch, which this never changes.
    let look = arguments.contains("contrast") ? "contrast" : arguments.contains("dark") ? "dark" : "light"
    if look == "contrast" && !NSWorkspace.shared.accessibilityDisplayShouldIncreaseContrast {
      print("NOT RUN: increased contrast needs System Settings > Accessibility > Display > Increase contrast")
      exit(2)
    }
    NSApp.appearance = NSAppearance(named: look == "dark" ? .darkAqua : .aqua)
    StackWindow.show(model: model)
    guard await until({ window(Copy.appName)?.isVisible == true }), let stack = window(Copy.appName) else {
      print("FAIL: the stack window did not open")
      exit(1)
    }
    if arguments.contains("--inject-defect") {
      // The reported class of defect: hosting resets the minimum size and sizes
      // the window to its root, so an empty root collapses it to a bare title bar.
      stack.contentMinSize = .zero
      stack.contentViewController = NSHostingController(rootView: EmptyView())
    }
    await expect("\(count) connections: stack content \(stack.contentLayoutRect.size)") {
      stack.contentLayoutRect.width >= 760 && stack.contentLayoutRect.height >= 480
    }
    await expect("stack shows its search field") { searchField(stack) != nil }
    await expect("stack shows its filter") { segment(stack, Copy.stackAll) != nil }
    guard let search = searchField(stack), passed else {
      // What the window does contain, so a failure on another machine is diagnosable.
      let controls = stack.contentView.map { views($0).filter { $0 is NSControl } } ?? []
      print("controls: \(controls.map { "\(Swift.type(of: $0))@\($0.convert($0.bounds, to: nil))" })")
      exit(1)
    }
    // The inspector checks need it beside the table; an autosaved narrow frame folds it away (QUO-269).
    if stack.contentLayoutRect.width < StackLayout.inspectorAutoMinWidth {
      stack.setContentSize(NSSize(width: 1000, height: max(480, stack.contentLayoutRect.height)))
    }
    let size = stack.contentLayoutRect.size

    let all = balances(model, .all)
    if all.isEmpty {
      check(inspectorName(stack, model) == nil, "an empty stack has nothing selected")
    } else {
      await selection(stack, model, all)
      await filtersAndSearch(stack, model, search)
      await rename(stack, model)
      await narrowWindow(stack, model, search)
    }
    await addConnection(stack, model, search, size: size)
    await settings(stack, model)
    await saveSettingsOnClose(stack, model)
    // Last before reopen: it closes and remounts the stack, staling `search`.
    await unsavedDrafts(stack, model, balances(model, .all))
    await reopen(stack, model)
    exactRow(model)
    if let flag = arguments.firstIndex(of: "--capture-dir"), arguments.count > flag + 1 {
      evidence(stack, look: look, into: arguments[flag + 1], count: count)
    }
    exit(passed ? 0 : 1)
  }

  // MARK: Scenarios

  private static func selection(_ stack: NSWindow, _ model: AppModel, _ all: [PresentedBalance]) async {
    await expect("the first balance is selected on open") {
      inspectorName(stack, model) == all[0].connection.name
    }
    let target = min(2, all.count - 1)
    clickRow(stack, target)
    await expect("clicking row \(target + 1) shows \(all[target].connection.name) in the inspector") {
      inspectorName(stack, model) == all[target].connection.name
    }
    guard all.count > target + 1 else { return }
    key(stack, String(UnicodeScalar(NSDownArrowFunctionKey)!), code: 125)
    await expect("Down arrow moves the selection to \(all[target + 1].connection.name)") {
      inspectorName(stack, model) == all[target + 1].connection.name
    }
  }

  /// QUO-263: a Warn below draft survives selecting another balance, and closing
  /// with it asks Save / Don't Save / Cancel. Cancel keeps it; Don't Save writes nothing.
  private static func unsavedDrafts(_ stack: NSWindow, _ model: AppModel, _ all: [PresentedBalance]) async {
    guard all.count > 1 else { return }
    // Selected by key (the menu bar's path), not by click: a click lands on
    // whichever row is scrolled under it.
    let first = all[0], second = all[1]
    StackWindow.show(model: model, selecting: first.id)
    await expect("\(first.connection.name) shows its Warn below field") {
      inspectorName(stack, model) == first.connection.name && inspectorWarnField(stack) != nil
    }
    guard let field = inspectorWarnField(stack) else { return }
    let before = model.savedPoolSettings
    type("777", into: field)
    stack.makeFirstResponder(nil) // what leaving the field does
    StackWindow.show(model: model, selecting: second.id)
    await expect("selecting \(second.connection.name) shows its own Warn below") {
      inspectorName(stack, model) == second.connection.name && inspectorWarnField(stack)?.stringValue != "777"
    }
    StackWindow.show(model: model, selecting: first.id)
    await expect("returning to \(first.connection.name) keeps its unsaved Warn below") {
      inspectorName(stack, model) == first.connection.name && inspectorWarnField(stack)?.stringValue == "777"
    }
    key(stack, "w", code: 13, flags: .command)
    await expect("Cmd-W with an unsaved edit asks before closing") { stack.isVisible && stack.attachedSheet != nil }
    press(Copy.cancelButton, in: stack.attachedSheet)
    await expect("Cancel keeps the stack and the draft") {
      stack.isVisible && stack.attachedSheet == nil && inspectorWarnField(stack)?.stringValue == "777"
    }
    key(stack, "w", code: 13, flags: .command)
    await expect("asks again on the next Cmd-W") { stack.attachedSheet != nil }
    press(Copy.discardButton, in: stack.attachedSheet)
    await expect("Don't Save closes the stack without saving") { !stack.isVisible && model.savedPoolSettings == before }
    StackWindow.show(model: model)
    await expect("reopening shows the saved Warn below, not the discarded draft") {
      stack.isVisible && inspectorWarnField(stack).map { $0.stringValue != "777" } == true
    }
  }

  /// QUO-263: Save in the close prompt writes the Settings draft, then closes.
  private static func saveSettingsOnClose(_ stack: NSWindow, _ model: AppModel) async {
    guard !model.connections.isEmpty else { return }
    key(stack, ",", code: 43, flags: .command)
    guard await until({ settingsWindow()?.isVisible == true }), let settings = settingsWindow()
    else { return check(false, "Cmd-, reopens Settings") }
    segment(settings, Copy.settingsBalances)?.press()
    // General's token field also scrolls, so wait for the tab and skip secure fields.
    func warnFields() -> [NSTextField] {
      textFields(settings).filter { $0.enclosingScrollView != nil && !($0 is NSSecureTextField) }
    }
    await expect("Balance warnings shows a Warn below field to edit") {
      segment(settings, Copy.settingsBalances)?.isSelected == true && !warnFields().isEmpty
    }
    guard let field = warnFields().first else { return }
    type("4321", into: field)
    // Escape is the Close button's shortcut, so this covers the button too.
    key(settings, "\u{1b}", code: 53)
    await expect("Escape in Settings with an unsaved edit asks first") { settings.isVisible && settings.attachedSheet != nil }
    press(Copy.saveButton, in: settings.attachedSheet)
    await expect("Save in the prompt saves the edit and closes Settings") {
      !settings.isVisible && model.savedPoolSettings.values.contains { $0.low == 4321 }
    }
  }

  private static func filtersAndSearch(_ stack: NSWindow, _ model: AppModel, _ search: NSTextField) async {
    segment(stack, Copy.stackAtRisk)?.press()
    let atRisk = balances(model, .atRisk).map(\.connection.name)
    await expect("At risk keeps the selection inside its \(atRisk.count) rows") {
      let shown = inspectorName(stack, model)
      return atRisk.isEmpty ? shown == nil : atRisk.contains(shown ?? "")
    }
    segment(stack, Copy.stackAll)?.press()

    let query = model.connections.last!.name
    type(query, into: search)
    await expect("searching for \(query) selects it") { inspectorName(stack, model) == query }
    type("no such balance", into: search)
    await expect("a search with no matches clears the inspector") { inspectorName(stack, model) == nil }
    type("", into: search)
    await expect("clearing the search restores the first balance") {
      inspectorName(stack, model) == balances(model, .all).first?.connection.name
    }
  }

  private static func rename(_ stack: NSWindow, _ model: AppModel) async {
    guard let field = inspectorNameField(stack, model),
      let id = model.connections.first(where: { $0.name == field.stringValue })?.id
    else { return check(false, "the inspector shows a name field") }
    let renamed = "Renamed balance"
    type(renamed, into: field)
    key(stack, "\r", code: 36)
    await expect("Return in the name field renames the selected connection") {
      model.connections.first { $0.id == id }?.name == renamed && inspectorName(stack, model) == renamed
    }
    // Names are unique per provider, so the clash must share a provider.
    let provider = model.connections.first { $0.id == id }?.provider
    guard let other = model.connections.first(where: { $0.id != id && $0.provider == provider })?.name,
      let field = inspectorNameField(stack, model) else { return }
    type(other, into: field)
    key(stack, "\r", code: 36)
    // A refusal is the absence of a change, so give a rename time to land first.
    try? await Task.sleep(for: .milliseconds(500))
    check(model.connections.first { $0.id == id }?.name == renamed, "a duplicate \(other) is refused")
    type(renamed, into: field)
  }

  /// QUO-269: at the 760-point minimum the inspector folds away so the table
  /// keeps every column; the toolbar toggle brings it back, and widening the
  /// window again returns to the automatic layout.
  private static func narrowWindow(_ stack: NSWindow, _ model: AppModel, _ search: NSTextField) async {
    let size = stack.contentLayoutRect.size
    stack.setContentSize(NSSize(width: 760, height: size.height))
    await expect("at 760 points the inspector folds away") {
      stack.contentLayoutRect.width == 760 && inspectorName(stack, model) == nil
    }
    toolbarButtons(stack, after: search).first?.performClick(nil)
    await expect("the toolbar toggle shows the inspector at 760 points") { inspectorName(stack, model) != nil }
    stack.setContentSize(size)
    await expect("back at \(Int(size.width)) points the inspector sits beside the table") {
      stack.contentLayoutRect.size == size && inspectorName(stack, model) != nil
    }
  }

  private static func addConnection(_ stack: NSWindow, _ model: AppModel, _ search: NSTextField, size: NSSize) async {
    let buttons = toolbarButtons(stack, after: search)
    check(buttons.count >= 3, "toolbar shows refresh, add and settings buttons (\(buttons.count) found)")
    guard buttons.count >= 3 else { return }
    // QUO-346: the menu's Add tool opens the form in the panel, never a sheet here.
    model.beginAdding(on: .panel)
    try? await Task.sleep(for: .milliseconds(400))
    check(stack.attachedSheet == nil && model.showsConnectForm, "Add tool in the menu leaves the stack without a sheet")
    model.cancelAdding()
    buttons[buttons.count - 2].performClick(nil)
    await expect("Add connection opens as a sheet with its key field") {
      model.isAddingInWindow && stack.attachedSheet.map { textFields($0).contains { $0 is NSSecureTextField } } == true
    }
    guard let sheet = stack.attachedSheet else { return }
    await toolList(sheet, model)
    key(sheet, "\u{1b}", code: 53)
    await expect("Escape dismisses Add connection and keeps no key") {
      stack.attachedSheet == nil && !model.isAddingInWindow && model.keyInput.isEmpty
    }
    check(stack.contentLayoutRect.size == size, "the stack keeps its size after the sheet")
    // QUO-352: Add tool in the menu closes this sheet and keeps the panel's form.
    buttons[buttons.count - 2].performClick(nil)
    await expect("Add connection opens again as a sheet") { stack.attachedSheet != nil }
    model.beginAdding(on: .panel)
    await expect("Add tool in the menu takes the form from the sheet and keeps it") {
      stack.attachedSheet == nil && model.isAddingInPanel
    }
    model.cancelAdding()
    let all = balances(model, .all)
    guard all.count > 1 else { return }
    clickRow(stack, 1)
    await expect("the stack still responds to clicks after the sheet") {
      inspectorName(stack, model) == all[1].connection.name
    }
  }

  /// QUO-241: typing in the tool search narrows the list without picking or
  /// dropping a typed key; Down then Return picks the next tool, which does.
  private static func toolList(_ sheet: NSWindow, _ model: AppModel) async {
    guard let toolSearch = textFields(sheet).first(where: { !($0 is NSSecureTextField) }),
      let keyField = textFields(sheet).first(where: { $0 is NSSecureTextField })
    else { return check(false, "Add connection shows a tool search and a key field") }
    // QUO-270: the first useful action is choosing a tool.
    await expect("Add connection focuses the tool search first") { editing(sheet) === toolSearch }
    let before = model.provider
    type("typed-key", into: keyField)
    type("no such tool", into: toolSearch)
    await expect("searching tools keeps the pick and the typed key") {
      model.providerSearch == "no such tool" && model.provider == before && model.keyInput == "typed-key"
    }
    type("", into: toolSearch)
    let next = ProviderPicker.move(before, by: 1, in: model.availableProviders)
    key(sheet, "\u{F701}", code: 125)
    key(sheet, "\r", code: 36)
    await expect("Down then Return in the tool search picks \(next?.displayName ?? "-") and drops the key") {
      model.provider == next && model.keyInput.isEmpty && model.isAddingInWindow && !model.isBusy
    }
    await expect("picking a tool moves focus to its key field") {
      editing(sheet).map { $0 is NSSecureTextField } == true
    }
    // QUO-277: the Name field holds the suggestion as text, not a placeholder.
    await expect("the Name field reads \(model.suggestedName) as text") {
      textFields(sheet).filter { !($0 is NSSecureTextField) }.dropFirst().first?.stringValue == model.suggestedName
    }
    // Return outside the tool search is Connect: a blank key is refused, nothing is added.
    let count = model.connections.count
    if let keyField = textFields(sheet).first(where: { $0 is NSSecureTextField }) {
      type("", into: keyField)
      key(sheet, "\r", code: 36)
    }
    await expect("Return in the key field runs Connect") {
      model.errorMessage != nil && !model.isBusy && model.connections.count == count
    }
  }

  private static func settings(_ stack: NSWindow, _ model: AppModel) async {
    key(stack, ",", code: 43, flags: .command)
    guard await until({ settingsWindow()?.isVisible == true }), let settings = settingsWindow()
    else { return check(false, "Cmd-, opens Settings") }
    await expect("Cmd-, opens Settings beside the stack: \(settings.contentLayoutRect.size)") {
      stack.isVisible && settings.contentLayoutRect.width >= 520 && settings.contentLayoutRect.height >= 480
    }
    key(stack, ",", code: 43, flags: .command)
    try? await Task.sleep(for: .milliseconds(300))
    check(NSApp.windows.filter { $0.identifier == SettingsWindow.identifier && $0.isVisible }.count == 1, "a second Cmd-, reuses the one Settings window")

    segment(settings, Copy.settingsBalances)?.press()
    let connections = model.connections
    func warnFields() -> [NSTextField] { textFields(settings).filter { $0.enclosingScrollView != nil } }
    await expect("Balance warnings shows \(warnFields().count) Warn below fields") {
      segment(settings, Copy.settingsBalances)?.isSelected == true
        && (connections.isEmpty ? warnFields().isEmpty : !warnFields().isEmpty)
    }
    if let first = connections.first,
      let query = textFields(settings).first(where: { $0.enclosingScrollView == nil }) {
      type(first.name, into: query)
      await expect("searching Settings for \(first.name) shows \(warnFields().count) of its \(first.poolRows.count) balances") {
        warnFields().count == first.poolRows.count
      }
    }
    await expect("the Settings title names Balance warnings") { settings.title == Copy.settingsBalances }
    key(settings, "w", code: 13, flags: .command)
    await expect("closing Settings leaves the stack open") { !settings.isVisible && stack.isVisible }
    // QUO-275: both routes back land on the last pane, with fresh fields.
    key(stack, ",", code: 43, flags: .command)
    await expect("Cmd-, reopens Settings on Balance warnings, its search cleared") {
      settings.isVisible && segment(settings, Copy.settingsBalances)?.isSelected == true
        && settings.title == Copy.settingsBalances
        && textFields(settings).first(where: { $0.enclosingScrollView == nil })?.stringValue.isEmpty == true
    }
    key(settings, "w", code: 13, flags: .command)
    await expect("closing Settings once more") { !settings.isVisible }
    SettingsWindow.show(model: model) // the menu's Settings... action
    await expect("the menu action reopens Settings on Balance warnings") {
      settings.isVisible && segment(settings, Copy.settingsBalances)?.isSelected == true
    }
    segment(settings, Copy.settingsGeneral)?.press()
    await expect("switching to General retitles the window") {
      segment(settings, Copy.settingsGeneral)?.isSelected == true && settings.title == Copy.settingsGeneral
    }
    key(settings, "w", code: 13, flags: .command)
    await expect("closing Settings again") { !settings.isVisible }
  }

  private static func reopen(_ stack: NSWindow, _ model: AppModel) async {
    key(stack, "w", code: 13, flags: .command)
    await expect("Cmd-W closes the stack") { !stack.isVisible }
    let target = model.connections.last
    // The menu bar's path into the window for one connection.
    if let target { ManageConnectionWindow.show(model: model, connectionID: target.id) }
    else { StackWindow.show(model: model) }
    await expect("reopening reuses one usable stack window: \(stack.contentLayoutRect.size)") {
      window(Copy.appName) === stack && visible(Copy.appName) == 1
        && stack.contentLayoutRect.width >= 760 && stack.contentLayoutRect.height >= 480
    }
    if let target {
      await expect("opening \(target.name) from the menu bar selects it") { inspectorName(stack, model) == target.name }
      // QUO-180: the selection made before the table mounts must still scroll into view.
      if let index = balances(model, .all).firstIndex(where: { $0.connection.id == target.id }) {
        await expect("\(target.name)'s row (\(index + 1)) is scrolled into view") { rowIsVisible(stack, index) }
      }
    }
  }

  /// QUO-265: a panel row opens its own balance, not its connection's top-ranked one.
  private static func exactRow(_ model: AppModel) {
    let connection = StackScenario.twoBalanceHunter(checkedAt: Date())
    let ranked = ConnectionPresentation.rankedPools(connection.poolRows)
    check(ranked.count == 2, "the two-balance fixture has two rows")
    for row in ranked {
      StackWindow.show(model: model, selecting: row.key)
      check(StackWindow.selection == row.key, "a panel row for \(row.key.creditType) opens that balance, not the connection's top one")
    }
  }

  /// Actual-window pixels, not file existence: the capture must show content
  /// and its brightness must match the requested appearance.
  private static func evidence(_ stack: NSWindow, look: String, into dir: String, count: Int) {
    let dark = stack.effectiveAppearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua
    check(dark == (look == "dark"), "stack renders in \(look): \(stack.effectiveAppearance.name.rawValue)")
    guard let view = stack.contentView?.superview, let rep = bitmap(view) else {
      return check(false, "captured the \(look) stack window")
    }
    var sum = 0.0, squares = 0.0, samples = 0.0
    for y in stride(from: 0, to: rep.pixelsHigh, by: 6) {
      for x in stride(from: 0, to: rep.pixelsWide, by: 6) {
        guard let color = rep.colorAt(x: x, y: y)?.usingColorSpace(.sRGB) else { continue }
        let luminance = 0.2126 * color.redComponent + 0.7152 * color.greenComponent + 0.0722 * color.blueComponent
        sum += luminance
        squares += luminance * luminance
        samples += 1
      }
    }
    let mean = sum / max(samples, 1)
    let spread = (squares / max(samples, 1) - mean * mean).squareRoot()
    check(spread > 0.05 && (look == "dark" ? mean < 0.4 : mean > 0.6),
      "\(look) capture has content (spread \(round(spread * 100) / 100)) at the expected brightness (\(round(mean * 100) / 100))")
    let url = URL(fileURLWithPath: dir).appendingPathComponent("stack-\(count)-\(look).png")
    let data = rep.representation(using: .png, properties: [:])
    check((try? data?.write(to: url)) != nil, "saved \(url.path)")
  }

  // MARK: Reading the window

  private static func balances(_ model: AppModel, _ filter: ConnectionFilter) -> [PresentedBalance] {
    ConnectionPresentation.balances(model.connections, query: "", filter: filter, failingIDs: model.shown.failingIDs)
  }

  private static func window(_ title: String) -> NSWindow? { NSApp.windows.first { $0.title == title } }
  /// Its title follows the pane (QUO-275), so Settings is found by identifier.
  private static func settingsWindow() -> NSWindow? { NSApp.windows.first { $0.identifier == SettingsWindow.identifier } }
  private static func visible(_ title: String) -> Int { NSApp.windows.filter { $0.title == title && $0.isVisible }.count }

  private static func views(_ view: NSView) -> [NSView] { [view] + view.subviews.flatMap(views) }

  /// SwiftUI keeps removed rows' fields around hidden, so count only visible ones.
  private static func textFields(_ window: NSWindow) -> [NSTextField] {
    window.contentView.map { views($0).compactMap { $0 as? NSTextField } }?
      .filter { !$0.isHiddenOrHasHiddenAncestor } ?? []
  }

  /// The text field whose field editor has focus.
  private static func editing(_ window: NSWindow) -> NSTextField? {
    (window.firstResponder as? NSTextView)?.delegate as? NSTextField
  }

  /// The toolbar search is the one text field outside every scroll view.
  private static func searchField(_ window: NSWindow) -> NSTextField? {
    textFields(window).first { $0.enclosingScrollView == nil && !($0 is NSSecureTextField) }
  }

  /// The inspector is the 260pt column on the right; its rename field holds the name.
  private static func inspectorNameField(_ window: NSWindow, _ model: AppModel) -> NSTextField? {
    let width = window.contentLayoutRect.width
    let names = Set(model.connections.map(\.name))
    return textFields(window).first {
      !($0 is NSSecureTextField) && $0.enclosingScrollView != nil
        && $0.convert($0.bounds, to: nil).minX > width - 260 && names.contains($0.stringValue)
    }
  }

  private static func inspectorName(_ window: NSWindow, _ model: AppModel) -> String? {
    inspectorNameField(window, model)?.stringValue
  }

  /// The inspector's Warn below field: the numeric text field in its column.
  private static func inspectorWarnField(_ window: NSWindow) -> NSTextField? {
    let width = window.contentLayoutRect.width
    return textFields(window).first {
      !($0 is NSSecureTextField) && $0.enclosingScrollView != nil
        && $0.convert($0.bounds, to: nil).minX > width - 260 && Double($0.stringValue) != nil
    }
  }

  /// Clicks an alert sheet's button by title.
  private static func press(_ title: String, in sheet: NSWindow?) {
    guard let root = sheet?.contentView else { return }
    views(root).compactMap { $0 as? NSButton }.first { $0.title == title }?.performClick(nil)
  }

  /// A segmented control's segment, found by its label in the AppKit view tree.
  /// Not through accessibility: SwiftUI fills its in-process accessibility tree
  /// only once an assistive client is attached, which a CI runner never has.
  @MainActor
  private struct Segment {
    let control: NSSegmentedControl
    let index: Int
    var isSelected: Bool { control.selectedSegment == index }
    /// What a click does once tracking ends: select, then send the action.
    func press() {
      control.selectedSegment = index
      control.sendAction(control.action, to: control.target)
    }
  }

  /// Searched from the frame view, since the Settings tabs are a toolbar item.
  private static func segment(_ window: NSWindow, _ prefix: String) -> Segment? {
    guard let root = window.contentView?.superview ?? window.contentView else { return nil }
    for case let control as NSSegmentedControl in views(root) where !control.isHiddenOrHasHiddenAncestor {
      if let index = (0..<control.segmentCount).first(where: { control.label(forSegment: $0)?.hasPrefix(prefix) == true }) {
        return Segment(control: control, index: index)
      }
    }
    return nil
  }

  /// Rows are 40pt tall below the table header; the table is the leftmost
  /// vertical scroll view.
  /// The balance table: the leftmost vertically scrolling view.
  private static func rowsTable(_ window: NSWindow) -> NSScrollView? {
    views(window.contentView!).compactMap { $0 as? NSScrollView }
      .filter(\.hasVerticalScroller)
      .min(by: { $0.convert($0.bounds, to: nil).minX < $1.convert($1.bounds, to: nil).minX })
  }

  private static func clickRow(_ window: NSWindow, _ index: Int) {
    guard let table = rowsTable(window) else { return }
    let frame = table.convert(table.bounds, to: nil)
    click(window, NSPoint(x: frame.minX + 120, y: frame.maxY - CGFloat(index) * 40 - 20))
  }

  /// Whether the table row at `index` (40pt rows, as `clickRow` assumes) lies
  /// fully inside the table's visible rect.
  private static func rowIsVisible(_ window: NSWindow, _ index: Int) -> Bool {
    guard let table = rowsTable(window), let document = table.documentView else { return false }
    let visible = table.documentVisibleRect
    let top = CGFloat(index) * 40
    let row = document.isFlipped
      ? NSRect(x: visible.minX, y: top, width: 1, height: 40)
      : NSRect(x: visible.minX, y: document.bounds.height - top - 40, width: 1, height: 40)
    return row.minY >= visible.minY - 1 && row.maxY <= visible.maxY + 1
  }

  /// The toolbar buttons right of the search field, left to right. Pressed, not
  /// clicked: a click on a window that is not key only activates it, and whether
  /// this process is frontmost depends on the machine running the check.
  private static func toolbarButtons(_ window: NSWindow, after field: NSTextField) -> [NSButton] {
    let edge = field.convert(field.bounds, to: nil).maxX
    return views(window.contentView!).compactMap { $0 as? NSButton }
      .filter { !$0.isHiddenOrHasHiddenAncestor && $0.convert($0.bounds, to: nil).minX > edge }
      .sorted { $0.convert($0.bounds, to: nil).minX < $1.convert($1.bounds, to: nil).minX }
  }

  private static func bitmap(_ view: NSView) -> NSBitmapImageRep? {
    view.layoutSubtreeIfNeeded()
    guard let rep = view.bitmapImageRepForCachingDisplay(in: view.bounds) else { return nil }
    view.cacheDisplay(in: view.bounds, to: rep)
    return rep
  }

  // MARK: Driving the window

  private static func click(_ window: NSWindow, _ point: NSPoint) {
    for type in [NSEvent.EventType.leftMouseDown, .leftMouseUp] {
      guard let event = NSEvent.mouseEvent(
        with: type, location: point, modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime,
        windowNumber: window.windowNumber, context: nil, eventNumber: 0, clickCount: 1, pressure: 1
      ) else { continue }
      // Queued, not sent: a button's tracking loop on mouse-down waits for the up.
      NSApp.postEvent(event, atStart: false)
    }
  }

  private static func key(_ window: NSWindow, _ characters: String, code: UInt16, flags: NSEvent.ModifierFlags = []) {
    guard let event = NSEvent.keyEvent(
      with: .keyDown, location: .zero, modifierFlags: flags, timestamp: ProcessInfo.processInfo.systemUptime,
      windowNumber: window.windowNumber, context: nil, characters: characters,
      charactersIgnoringModifiers: characters, isARepeat: false, keyCode: code
    ) else { return }
    // Delivered to this window, not the key window: the check must not depend on
    // which app is frontmost. Shortcuts take AppKit's key-equivalent path.
    if flags.isEmpty { window.sendEvent(event) } else { _ = window.performKeyEquivalent(with: event) }
  }

  /// Types through the field editor so SwiftUI's binding sees the edit.
  private static func type(_ text: String, into field: NSTextField) {
    field.window?.makeFirstResponder(field)
    guard let editor = field.currentEditor() as? NSTextView else { return }
    editor.selectAll(nil)
    if text.isEmpty { editor.deleteBackward(nil) } else { editor.insertText(text, replacementRange: editor.selectedRange()) }
  }
}
