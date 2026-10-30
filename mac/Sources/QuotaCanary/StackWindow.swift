import AppKit
import QuotaCanaryCore
import SwiftUI

/// Shared state lets the menu bar select a connection in the existing window.
@MainActor
@Observable
final class StackWindowState {
  var selection: PoolKey?
  var query = ""
  var filter: ConnectionFilter = .all
  var searchRequest = 0
  /// The toolbar toggle's choice; nil follows the window width (QUO-269).
  var inspectorOverride: Bool?
  /// Threshold drafts per balance, kept while the selection moves (QUO-263).
  let drafts = DraftStore()

  init(selection: PoolKey? = nil) { self.selection = selection }

  func select(_ key: PoolKey) {
    query = ""
    filter = .all
    selection = key
  }
}

/// A retained AppKit window gives this accessory app one predictable full window.
@MainActor
enum StackWindow {
  private static var window: StackNSWindow?
  private static let state = StackWindowState()

  static func show(model: AppModel, connectionID: String? = nil) {
    if let connectionID,
      let connection = model.connections.first(where: { $0.id == connectionID }),
      let row = ConnectionPresentation.rankedPools(connection.poolRows).first {
      state.select(row.key)
    }
    open(model: model)
  }

  /// The balance the window has selected; read by the interaction smoke.
  static var selection: PoolKey? { state.selection }

  /// Selects one balance row by key, by its stable pool identity.
  static func show(model: AppModel, selecting key: PoolKey) {
    state.select(key)
    open(model: model)
  }

  private static func open(model: AppModel) {
    if window == nil {
      let window = StackNSWindow(
        contentRect: NSRect(x: 0, y: 0, width: 1000, height: 680),
        styleMask: [.titled, .closable, .miniaturizable, .resizable],
        backing: .buffered, defer: false
      )
      window.title = Copy.appName
      window.isReleasedWhenClosed = false
      window.contentMinSize = NSSize(width: 760, height: 480)
      window.focusSearch = { state.searchRequest += 1 }
      window.unsavedGuard = UnsavedChangesGuard(model: model, store: state.drafts) { state.select($0) }
      window.delegate = window.unsavedGuard
      // Center only on first launch; a saved frame wins.
      if !window.setFrameUsingName("QuotaCanaryStack") { window.center() }
      window.setFrameAutosaveName("QuotaCanaryStack")
      self.window = window
    }
    if let window, window.contentViewController == nil {
      let contentSize = window.contentLayoutRect.size
      let controller = NSHostingController(rootView: StackView(model: model, state: state))
      controller.sizingOptions = [.minSize]
      window.contentViewController = controller
      window.contentMinSize = NSSize(width: 760, height: 480)
      window.setContentSize(contentSize)
    }
    NSApp.activate()
    window?.makeKeyAndOrderFront(nil)
  }
}

/// MenuBarExtra does not supply a standard Window scene's keyboard commands.
private final class StackNSWindow: NSWindow {
  var focusSearch: (() -> Void)?
  /// Retained here because `delegate` is weak.
  var unsavedGuard: UnsavedChangesGuard?

  override func close() {
    // Retain navigation, never abandoned keys, confirmations, or threshold drafts.
    makeFirstResponder(nil)
    contentViewController = nil
    super.close()
  }

  override func performKeyEquivalent(with event: NSEvent) -> Bool {
    if event.modifierFlags.intersection(.deviceIndependentFlagsMask) == .command {
      switch event.charactersIgnoringModifiers?.lowercased() {
      case "f":
        focusSearch?()
        return true
      case "w":
        performClose(nil)
        return true
      default: break
      }
    }
    return super.performKeyEquivalent(with: event)
  }
}

struct StackView: View {
  @Bindable var model: AppModel
  @Bindable var state: StackWindowState
  @FocusState private var searchFocused: Bool
  @FocusState private var tableFocused: Bool
  /// Mirrors the width rule for the toolbar toggle; the layout reads the width itself.
  @State private var inspectorByDefault = true

  var body: some View {
    // Built once per body: each filter's rows feed the picker counts, and the
    // picked one is the table, the inspector and the selection rules.
    let shown = model.shown
    let rows = Dictionary(uniqueKeysWithValues: ConnectionFilter.allCases.map {
      ($0, shown.stackItems(query: state.query, filter: $0))
    })
    let presented = rows[state.filter] ?? []
    VStack(spacing: 0) {
      toolbar(counts: rows.mapValues(\.count))
      Divider()

      GeometryReader { geometry in
        let byDefault = StackLayout.showsInspectorByDefault(width: geometry.size.width)
        HStack(spacing: 0) {
          table(presented, shown: shown)
          // Folds away at narrow widths so every column stays in view (QUO-269).
          if state.inspectorOverride ?? byDefault {
            Divider()
            inspector(presented).frame(width: StackLayout.inspectorWidth)
          }
        }
        .onChange(of: byDefault, initial: true) { _, value in
          if inspectorByDefault != value { state.inspectorOverride = nil }
          inspectorByDefault = value
        }
      }
    }
    // Hosting otherwise replaces the AppKit minimum with the toolbar's intrinsic size.
    .frame(minWidth: 760, maxWidth: .infinity, minHeight: 480, maxHeight: .infinity)
    .background(Color(nsColor: .windowBackgroundColor))
    .onChange(of: state.searchRequest) { _, _ in searchFocused = true }
    .onChange(of: presented.map(\.id), initial: true) { _, ids in
      if let selected = state.selection, ids.contains(selected) { return }
      state.selection = ids.first
    }
    .sheet(isPresented: $model.isAddingInWindow, onDismiss: { model.windowSheetDismissed() }) {
      ConnectStep(model: model).padding(20).frame(width: 380)
    }
  }

  /// The count is the segment's value, so VoiceOver reads "All, 3" and not one glued string.
  private func filterSegment(_ title: String, count: Int) -> some View {
    Text("\(title) \(count)").accessibilityLabel(title).accessibilityValue("\(count)")
  }

  private func toolbar(counts: [ConnectionFilter: Int]) -> some View {
    HStack(spacing: 12) {
      Text(Copy.stackTitle).font(.headline)
      Picker(Copy.stackFilter, selection: $state.filter) {
        filterSegment(Copy.stackAll, count: counts[.all] ?? 0).tag(ConnectionFilter.all)
        filterSegment(Copy.stackAtRisk, count: counts[.atRisk] ?? 0).tag(ConnectionFilter.atRisk)
        filterSegment(Copy.stackFailing, count: counts[.failing] ?? 0).tag(ConnectionFilter.failing)
      }
      .pickerStyle(.segmented).labelsHidden().fixedSize()
      Spacer(minLength: 0)
      HStack(spacing: 4) {
        Image(systemName: "magnifyingglass").foregroundStyle(.secondary).accessibilityHidden(true)
        TextField(Copy.stackSearch, text: $state.query)
          .textFieldStyle(.plain).focused($searchFocused)
      }
      .padding(6)
      .background(Color(nsColor: .textBackgroundColor), in: RoundedRectangle(cornerRadius: 6))
      .frame(minWidth: 110, idealWidth: 210, maxWidth: 240)
      let showsInspector = state.inspectorOverride ?? inspectorByDefault
      Button { state.inspectorOverride = !showsInspector } label: { Image(systemName: "sidebar.right") }
        .help(showsInspector ? Copy.stackHideDetails : Copy.stackShowDetails)
        .accessibilityLabel(showsInspector ? Copy.stackHideDetails : Copy.stackShowDetails)
      RefreshProgressLabel(progress: model.refreshProgress)
      Button { Task { await model.refresh() } } label: {
        Image(systemName: "arrow.clockwise")
      }
      .disabled(model.isBusy || model.refreshProgress.isChecking).keyboardShortcut("r")
      .help(Copy.refreshButton).accessibilityLabel(Copy.refreshButton)
      Button { model.beginAdding(on: .window) } label: { Image(systemName: "plus") }
        .disabled(model.isBusy).help(Copy.addConnectionButton).accessibilityLabel(Copy.addConnectionButton)
      Button { SettingsWindow.show(model: model) } label: { Image(systemName: "gearshape") }
        .keyboardShortcut(",").help(Copy.settingsButton).accessibilityLabel(Copy.settingsButton)
    }
    .buttonStyle(.borderless)
    .padding(.horizontal, 16).padding(.vertical, 12)
  }

  private func table(_ presented: [StackItem], shown: BalancesAsShown) -> some View {
    GeometryReader { geometry in
      // Preserve numeric columns at the minimum window width. Header and rows
      // share horizontal scrolling; only the rows scroll vertically.
      ScrollView(.horizontal) {
        VStack(spacing: 0) {
          BalanceTableHeader().padding(.trailing, 16)
          Divider()
          ScrollViewReader { scroll in
            ScrollView(.vertical) {
              LazyVStack(spacing: 0) {
                ForEach(presented) { item in
                  // Sorts the pool's history: once per row, shared with its label.
                  let eta = model.eta(for: item.row)
                  Button {
                    state.selection = item.id
                    tableFocused = true
                  } label: {
                    switch item {
                    case let .local(balance):
                      BalanceTableRow(
                        item: balance, eta: eta, failing: shown.isFailing(balance.connection),
                        selected: state.selection == item.id
                      )
                    }
                  }
                  .buttonStyle(.plain)
                  .accessibilityElement(children: .ignore)
                  .accessibilityLabel(rowLabel(item, eta: eta, shown: shown))
                  .accessibilityAddTraits(.isButton)
                  .accessibilityAddTraits(state.selection == item.id ? .isSelected : [])
                  .contextMenu {
                    TopUpButton(url: item.topupURL)
                    MuteButton(model: model, row: item.row)
                  }
                  .id(item.id)
                }
              }
              .frame(width: max(StackLayout.tableMinWidth, geometry.size.width) - 16)
              .frame(maxWidth: .infinity, alignment: .leading)
            }
            .focusable().focusEffectDisabled().focused($tableFocused)
            .onKeyPress(.downArrow) { moveSelection(1, in: presented); return .handled }
            .onKeyPress(.upArrow) { moveSelection(-1, in: presented); return .handled }
            // Initial too: `show` selects before a fresh hosting controller mounts (QUO-180).
            .onChange(of: state.selection, initial: true) { _, key in
              if let key { scroll.scrollTo(key) }
            }
            .overlay {
              if presented.isEmpty {
                ContentUnavailableView {
                  Label {
                    Text(model.hasAnyConnection ? Copy.noMatchingBalances : Copy.notConnected)
                  } icon: {
                    if model.hasAnyConnection {
                      Image(systemName: "magnifyingglass")
                    } else {
                      LogoMarkImage(height: 40)
                    }
                  }
                } description: {
                  Text(model.hasAnyConnection ? Copy.stackNoMatchesNote : Copy.stackEmptyNote)
                }
              }
            }
          }
        }
        .frame(width: max(StackLayout.tableMinWidth, geometry.size.width), height: geometry.size.height)
      }
    }
  }

  /// Name, balance, monitoring health and last success, then the ETA (QUO-262).
  private func rowLabel(_ item: StackItem, eta: BurnEta?, shown: BalancesAsShown) -> String {
    let relative = { (date: Date) in ConnectedView.relative(date, now: Date()) }
    switch item {
    case let .local(balance):
      return shown.health(of: item).rowAccessibilityLabel(
        name: balance.connection.name,
        summary: PoolRowView.summary(balance.row),
        extra: eta.map { [$0.long] } ?? [], relative: relative
      )
    }
  }

  private func moveSelection(_ offset: Int, in presented: [StackItem]) {
    guard !presented.isEmpty else { return }
    let current = presented.firstIndex { $0.id == state.selection } ?? (offset > 0 ? -1 : presented.count)
    state.selection = presented[min(presented.count - 1, max(0, current + offset))].id
  }

  @ViewBuilder private func inspector(_ presented: [StackItem]) -> some View {
    if let item = presented.first(where: { $0.id == state.selection }) {
      switch item {
      case let .local(balance): BalanceInspector(model: model, item: balance, drafts: state.drafts).id(item.id)
      }
    } else {
      Text(Copy.selectBalance).foregroundStyle(.secondary).frame(maxHeight: .infinity)
    }
  }
}

/// Fixed columns mirror the approved table; the connection column takes spare width.
private struct BalanceTableHeader: View {
  /// Wide enough for labels like "Pay-as-you-go Credits" (QUO-269; was 90).
  static let balanceWidth: CGFloat = 150

  var body: some View {
    HStack(spacing: 12) {
      Color.clear.frame(width: 14, height: 1)
      Text(Copy.connectionColumn).frame(maxWidth: .infinity, alignment: .leading)
      Text(Copy.balanceColumn).frame(width: BalanceTableHeader.balanceWidth, alignment: .leading)
      Text(Copy.remainingColumn).frame(width: 154, alignment: .trailing)
      Text(Copy.warnBelowField).frame(width: 74, alignment: .trailing)
      Text(Copy.checkedColumn).frame(width: 96, alignment: .leading)
    }
    .font(.caption).foregroundStyle(.secondary)
    .padding(.horizontal, 16).frame(height: 30)
  }
}

private struct BalanceTableRow: View {
  let item: PresentedBalance
  let eta: BurnEta?
  let failing: Bool
  let selected: Bool
  @Environment(\.referenceDate) private var referenceDate

  var body: some View {
    HStack(spacing: 12) {
      StatusIndicator(status: item.row.status)
      HStack(spacing: 6) {
        ProviderLogo(provider: item.connection.provider)
        VStack(alignment: .leading, spacing: 1) {
          Text(item.connection.name).lineLimit(1).truncationMode(.middle) // keeps a distinguishing suffix (QUO-269)
          // Beside the name, so it shows without scrolling to Checked (QUO-262).
          CheckCue(health: .local(item.connection, failing: failing))
          NotMonitoredCue(row: item.row)
          MutedCue(row: item.row)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading).help(item.connection.name)
      VStack(alignment: .leading, spacing: 2) {
        Text(item.row.pool.label).foregroundStyle(.secondary).lineLimit(1).help(item.row.pool.label)
        if let eta {
          Text(eta.short).font(.caption).monospacedDigit().lineLimit(1)
            .foregroundStyle(item.row.alerts ? StatusIndicator.textColor(item.row.status) : Color.secondary)
            .help(eta.long)
        }
      }
      .frame(width: BalanceTableHeader.balanceWidth, alignment: .leading)
      VStack(alignment: .trailing, spacing: 5) {
        Text(PoolRowView.amount(item.row).replacingOccurrences(of: " of ", with: " / "))
          .monospacedDigit().fixedSize()
        BalanceMeter(row: item.row)
      }.frame(width: 154)
      Text(item.row.status == .unavailable ? "" : Format.balance(item.row.settings.low, unit: item.row.pool.unit))
        .monospacedDigit().fixedSize().frame(width: 74, alignment: .trailing)
      TimelineView(.periodic(from: .now, by: 30)) { context in
        let time = item.connection.lastReading.map {
          ConnectedView.relative($0.checkedAt, now: referenceDate ?? context.date)
        } ?? Copy.notCheckedYet
        Text(failing ? Copy.failingChecked(time) : time)
          .font(.caption).foregroundStyle(.secondary)
          .frame(width: 96, alignment: .leading)
      }
    }
    .font(.callout)
    .opacity(item.row.muted ? MutedCue.dimming : 1)
    .padding(.horizontal, 16).frame(minHeight: 40)
    .background(selected ? Color(nsColor: .selectedContentBackgroundColor).opacity(0.18) : Color.clear)
    .contentShape(Rectangle())
    .overlay(alignment: .bottom) { Color(nsColor: .separatorColor).opacity(0.4).frame(height: 0.5) }
  }
}

struct BalanceMeter: View {
  let row: PoolRow
  @Environment(\.colorSchemeContrast) private var contrast

  private var fill: Color {
    switch row.status {
    case .low: return Brand.gold
    case .critical, .empty: return .red
    default: return .secondary
    }
  }

  var body: some View {
    GeometryReader { geometry in
      if let scale = BalanceMeterScale(row) {
        ZStack(alignment: .leading) {
          Capsule().fill(Color.primary.opacity(contrast == .increased ? 0.2 : 0.08))
          Capsule().fill(fill).frame(width: geometry.size.width * scale.remaining)
          ForEach(0..<2) { index in
            let tick = index == 0 ? scale.critical : scale.low
            Rectangle().fill(Color.primary.opacity(0.65))
              .frame(width: 1, height: 7).offset(x: min(geometry.size.width - 1, geometry.size.width * tick))
          }
        }
      } else {
        Capsule().strokeBorder(Color.secondary, style: StrokeStyle(lineWidth: 1, dash: [2, 2]))
      }
    }
    .frame(height: 4).accessibilityHidden(true)
  }
}

private struct BalanceInspector: View {
  var model: AppModel
  let item: PresentedBalance
  let drafts: DraftStore

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 20) {
        VStack(alignment: .leading, spacing: 8) {
          ConnectionTitle(connection: item.connection, font: .headline)
          let record = model.monitor.record(for: item.connection.id)
          HealthLine(connection: item.connection, health: record.health)
          ErrorLine(message: record.message)
          LastCheckNote(record: record.message == nil ? nil : record.lastCheck)
          FailureStreakNote(connection: item.connection)
        }
        VStack(alignment: .leading, spacing: 8) {
          Text(item.row.pool.label).foregroundStyle(.secondary)
          Text(PoolRowView.amount(item.row)).font(.title2.monospacedDigit()).fixedSize(horizontal: false, vertical: true)
          BalanceMeter(row: item.row)
          BalanceSparkline(points: model.sparkline(for: item.id), status: item.row.status)
          // One headline (QUO-271): the long ETA sentence, its measured rate and
          // the history span it rests on. "Collecting history" and "No
          // consumption observed" are different statements and stay distinct.
          if let eta = model.eta(for: item.row) {
            Text(eta.long).font(.callout.weight(.semibold).monospacedDigit())
            switch model.assessment(for: item.id) {
            case let .burning(burn, spanDays):
              Text(Copy.burningPerDay(Format.balance(burn.perDay, unit: item.row.pool.unit))
                + " · " + Copy.historyRange(days: spanDays))
                .font(.caption).foregroundStyle(.secondary)
            case let .noConsumption(spanDays):
              Text(Copy.historyRange(days: spanDays)).font(.caption).foregroundStyle(.secondary)
            case .collecting:
              EmptyView()
            }
          }
          TopUpButton(url: item.connection.provider.topupURL)
        }
        VStack(alignment: .leading, spacing: 12) {
          Text(Copy.stackThresholds).font(.headline)
          if item.row.status == .unavailable {
            Text(Copy.unavailableHint).font(.caption).foregroundStyle(.secondary)
          } else {
            PoolThresholdSettings(model: model, store: drafts, selectedBalance: item.id)
          }
        }
        Divider()
        VStack(alignment: .leading, spacing: 12) {
          Text(Copy.connectionColumn).font(.headline)
          ManageConnectionView(model: model, connectionID: item.connection.id, embedded: true)
        }
        if let note = ConnectedView.note(item.connection.provider) {
          Text(note).font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
        }
      }
      .padding(16).frame(maxWidth: .infinity, alignment: .leading)
    }
  }
}
