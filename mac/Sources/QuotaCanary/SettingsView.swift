import AppKit
import Combine
import QuotaCanaryCore
import SwiftUI

/// A retained NSWindow gives this accessory app deterministic singleton
/// settings and activation, independent of SwiftUI scene routing.
@MainActor
enum SettingsWindow {
  private static var window: SettingsNSWindow?
  /// The last pane, kept across close and reopen for this session (QUO-275).
  static let navigation = SettingsNavigation()
  private static var titleUpdates: AnyCancellable?
  /// Found by this, not by title: the title follows the pane.
  static let identifier = NSUserInterfaceItemIdentifier("QuotaCanarySettings")

  static func show(model: AppModel) {
    if let window, window.isVisible {
      NSApp.activate(ignoringOtherApps: true)
      window.makeKeyAndOrderFront(nil)
      return
    }
    let window = self.window ?? SettingsNSWindow(
      contentRect: NSRect(x: 0, y: 0, width: 640, height: 640),
      styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false
    )
    window.identifier = identifier
    window.title = navigation.windowTitle
    titleUpdates = navigation.$pane.sink { [weak window] pane in window?.title = pane.title }
    window.isReleasedWhenClosed = false
    // The window owns its size. A ScrollView's intrinsic height can be zero;
    // installing a default hosting controller otherwise collapses the content.
    let contentSize = window.contentLayoutRect.size
    let store = DraftStore()
    // performClose, not close: the Close button and Escape get the same
    // unsaved-changes prompt as the title-bar button and Cmd-W.
    let controller = NSHostingController(rootView:
      SettingsView(model: model, store: store, navigation: navigation) { [weak window] in window?.performClose(nil) }
    )
    window.unsavedGuard = UnsavedChangesGuard(model: model, store: store)
    window.delegate = window.unsavedGuard
    controller.sizingOptions = [.minSize]
    window.contentViewController = controller
    window.contentMinSize = NSSize(width: 520, height: 480)
    window.setContentSize(contentSize)
    window.center()
    self.window = window
    NSApp.activate(ignoringOtherApps: true)
    window.makeKeyAndOrderFront(nil)
  }
}

/// Release abandoned drafts and controls when the native close button,
/// Escape, or Cmd-W closes Settings. Reopening starts from saved state on the
/// last pane (QUO-275).
private final class SettingsNSWindow: NSWindow {
  /// Retained here because `delegate` is weak.
  var unsavedGuard: UnsavedChangesGuard?

  override func close() {
    makeFirstResponder(nil)
    contentViewController = nil
    super.close()
  }

  override func performKeyEquivalent(with event: NSEvent) -> Bool {
    if event.modifierFlags.intersection(.deviceIndependentFlagsMask) == .command,
      event.charactersIgnoringModifiers == "w" {
      performClose(nil)
      return true
    }
    return super.performKeyEquivalent(with: event)
  }
}

/// Global preferences and balance warnings have independent scroll regions.
struct SettingsView: View {
  @ObservedObject var model: AppModel
  @ObservedObject private var navigation: SettingsNavigation
  private let query: String
  @StateObject private var store: DraftStore
  private let onClose: () -> Void

  init(
    model: AppModel, drafts: [PoolKey: PoolSettingsDraft] = [:], store: DraftStore? = nil,
    showBalances: Bool = false, query: String = "", navigation: SettingsNavigation? = nil,
    onClose: @escaping () -> Void = {}
  ) {
    self.model = model
    let navigation = navigation ?? SettingsNavigation()
    if showBalances || !drafts.isEmpty { navigation.pane = .balanceWarnings }
    self.navigation = navigation
    _store = StateObject(wrappedValue: store ?? DraftStore(drafts))
    self.query = query
    self.onClose = onClose
  }

  var body: some View {
    VStack(spacing: 0) {
      TabView(selection: $navigation.pane) {
        ScrollView {
          VStack(alignment: .leading, spacing: 20) {
            Hint(text: Copy.settingsGeneralNote)
            StartAtLoginSection(login: model.startAtLogin)
            Divider()
            AlertsSettingsSection(model: model, notifications: model.notifications)
            Divider()
            UpdatesSettingsSection(updater: model.updater)
            Divider()
            DiagnosticsExportRow(model: model)
            Divider()
            EraseSettingsSection(model: model) {
              store.drafts = BalanceDrafts() // nothing left to save, so no unsaved prompt on close
              onClose()
            }
          }
          .padding(24)
          .frame(maxWidth: .infinity, alignment: .leading)
        }
        .tabItem { Text(SettingsPane.general.title) }
        .tag(SettingsPane.general)

        PoolThresholdSettings(model: model, store: store, scrollable: true, query: query)
          .tabItem { Text(SettingsPane.balanceWarnings.title) }
          .tag(SettingsPane.balanceWarnings)
      }
      .padding([.top, .horizontal], 16)
      HStack {
        Spacer()
        Button(Copy.closeButton, action: onClose)
          .keyboardShortcut(.cancelAction)
      }
      .padding(16)
    }
    .frame(minWidth: 520, maxWidth: .infinity, minHeight: 480, maxHeight: .infinity)
    // A Save from the close prompt hit an invalid Warn below: show it.
    .onChange(of: store.attention) { _, key in if key != nil { navigation.pane = .balanceWarnings } }
  }
}

/// Reused in Settings and a selected connection's full-window detail.
/// Save writes only edited pools, preserving changes made in other surfaces.
/// Drafts live in the window's `DraftStore`, so they outlive this view (QUO-263).
struct PoolThresholdSettings: View {
  @ObservedObject var model: AppModel
  @ObservedObject var store: DraftStore
  let connectionID: String?
  let selectedBalance: PoolKey?
  @State private var saveError: String?
  @State private var saved = false
  @State private var query = ""
  /// Set by the "needs attention" summary: scroll to and focus this balance's field.
  @State private var revealed: PoolKey?
  @State private var revealToken = 0
  private let scrollable: Bool

  init(
    model: AppModel, store: DraftStore, connectionID: String? = nil, selectedBalance: PoolKey? = nil,
    scrollable: Bool = false, query: String = ""
  ) {
    self.model = model
    self.store = store
    self.connectionID = selectedBalance?.connectionID ?? connectionID
    self.selectedBalance = selectedBalance
    self.scrollable = scrollable
    _query = State(initialValue: query)
  }

  private var connections: [Connection] {
    model.connections.filter { connectionID == nil || $0.id == connectionID }
  }

  var body: some View {
    if scrollable {
      ScrollViewReader { proxy in
        VStack(alignment: .leading, spacing: 12) {
          intro
          Hint(text: Copy.settingsBalancesNote)
          TextField(Copy.settingsSearch, text: $query)
            .textFieldStyle(.roundedBorder)
          ScrollView {
            LazyVStack(alignment: .leading, spacing: 16) { editors }
              .padding(.vertical, 4)
          }
          Divider()
          saveRow(proxy)
        }
        .padding(20)
        .onChange(of: store.attention) { _, key in if let key { reveal(key, proxy) } }
      }
    } else {
      VStack(alignment: .leading, spacing: 14) {
        if selectedBalance == nil { intro }
        editors
        saveRow(nil)
      }
    }
  }

  /// Clears a search that hides the balance, scrolls to it and focuses Warn below.
  private func reveal(_ key: PoolKey, _ proxy: ScrollViewProxy?) {
    query = ""
    revealed = key
    revealToken += 1
    DispatchQueue.main.async { withAnimation { proxy?.scrollTo(key, anchor: .center) } }
  }

  private var intro: some View {
    Text(Copy.settingsIntro)
      .font(.callout)
      .foregroundStyle(.secondary)
      .fixedSize(horizontal: false, vertical: true)
  }

  private var matchingConnections: [Connection] {
    let search = query.trimmingCharacters(in: .whitespacesAndNewlines)
    return connections.filter { connection in
      search.isEmpty || ([connection.name, connection.provider.displayName]
        + connection.poolRows.map { $0.pool.label }).contains {
          $0.localizedStandardContains(search)
        }
    }
  }

  @ViewBuilder private var editors: some View {
    if connections.isEmpty {
      Text(Copy.settingsEmpty).foregroundStyle(.secondary)
    } else if matchingConnections.isEmpty {
      Text(Copy.stackNoMatchesNote).foregroundStyle(.secondary)
    }
    ForEach(matchingConnections) { connection in
      VStack(alignment: .leading, spacing: 8) {
        if connectionID == nil { ConnectionTitle(connection: connection, font: .headline) }
        ForEach(ConnectionPresentation.rankedPools(connection.poolRows).filter { selectedBalance == nil || $0.key == selectedBalance }) { row in
          PoolSettingsEditor(
            row: row, draft: binding(for: row), compact: selectedBalance != nil,
            focusToken: revealed == row.key ? revealToken : nil
          )
          .id(row.key)
        }
      }
    }
  }

  private func saveRow(_ proxy: ScrollViewProxy?) -> some View {
    HStack {
      if let error = saveError ?? store.closeError {
        ErrorLine(message: error)
      } else if let first = store.drafts.firstInvalid(savedSettings) {
        // Search can hide the invalid editor; this stays beside the disabled Save.
        Button { reveal(first, proxy) } label: {
          Label(Copy.balancesNeedAttention(invalidCount), systemImage: "exclamationmark.triangle.fill")
            .font(.caption.weight(.medium))
            .foregroundStyle(.red)
        }
        .buttonStyle(.plain)
        .help(Copy.balancesNeedAttentionHint)
      } else if !dirty.isEmpty {
        Text(Copy.unsavedChanges(dirty.count)).font(.caption.weight(.medium))
      } else if saved {
        Text(Copy.saved).font(.caption).foregroundStyle(.secondary)
      }
      Spacer()
      Button(Copy.saveButton, action: save)
        .disabled(!canSave)
    }
  }

  private var rows: [PoolRow] {
    connections.flatMap(\.poolRows).filter { selectedBalance == nil || $0.key == selectedBalance }
  }

  /// Saved settings of the balances this editor shows; Save writes only these.
  private var savedSettings: [PoolKey: PoolSettings] {
    Dictionary(rows.map { ($0.key, $0.settings) }) { first, _ in first }
  }

  private func draft(for row: PoolRow) -> PoolSettingsDraft {
    store.drafts.draft(for: row.key, saved: row.settings)
  }

  private func binding(for row: PoolRow) -> Binding<PoolSettingsDraft> {
    Binding(
      get: { draft(for: row) },
      set: {
        guard store.drafts.set($0, for: row.key, saved: row.settings) else { return }
        store.attention = nil
        revealed = nil
        saved = false
        saveError = nil
        store.closeError = nil
      }
    )
  }

  private var dirty: Set<PoolKey> { store.drafts.dirtyKeys(savedSettings) }

  private var invalidCount: Int { store.drafts.invalidKeys(savedSettings).count }

  private var canSave: Bool {
    !dirty.isEmpty && rows.filter { dirty.contains($0.key) }.allSatisfy { draft(for: $0).error == nil }
  }

  private func save() {
    switch store.drafts.save(saved: savedSettings, write: { model.saveSettings($0) }) {
    case .saved:
      saveError = nil
      store.closeError = nil
      saved = true
    case let .failed(message):
      saveError = message
    case .invalid:
      return
    }
  }
}

struct PoolSettingsEditor: View {
  let row: PoolRow
  @Binding var draft: PoolSettingsDraft
  var compact = false
  /// Changes each time the "needs attention" summary asks to focus this editor.
  var focusToken: Int?
  @FocusState private var focused: Bool

  private var pendingCritical: String? {
    guard case let .success(settings) = draft.validated(),
      settings.critical != row.settings.critical else { return nil }
    return "\(Thresholds.text(settings.critical)) \(Format.unitName(row.pool.unit))"
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      if !compact {
        HStack(spacing: 8) {
          StatusIndicator(status: row.status)
          Text(row.pool.label).fontWeight(.medium)
          Spacer(minLength: 8)
          Text(PoolRowView.amount(row))
            .font(.callout.monospacedDigit())
            .foregroundStyle(.secondary)
        }
      }
      Toggle(Copy.monitorToggle, isOn: $draft.monitored)
      Grid(alignment: .leading, horizontalSpacing: 8, verticalSpacing: 6) {
        ThresholdRow(
          title: Copy.warnBelowField, text: $draft.low, unit: row.pool.unit, compact: compact,
          focused: $focused
        )
      }
      Hint(text: Copy.criticalHint(
        "\(Thresholds.text(row.settings.critical)) \(Format.unitName(row.pool.unit))",
        afterSave: pendingCritical
      ))
      if row.status == .unavailable {
        Hint(text: Copy.unavailableHint)
      } else if row.status == .unknown {
        Hint(text: Copy.unknownHint)
      }
      // Always takes a line, so the window does not jump as you type.
      ErrorLine(message: draft.error?.message ?? " ")
        .opacity(draft.error == nil ? 0 : 1)
        .accessibilityHidden(draft.error == nil)
    }
    .task(id: focusToken) { if focusToken != nil { focused = true } }
    .padding(compact ? 0 : 12)
    .overlay {
      if !compact { RoundedRectangle(cornerRadius: 8).strokeBorder(Color(nsColor: .separatorColor)) }
    }
  }
}

private struct ThresholdRow: View {
  let title: String
  @Binding var text: String
  let unit: CreditUnit
  var compact = false
  var focused: FocusState<Bool>.Binding

  var body: some View {
    GridRow {
      Text(title).fixedSize().frame(minWidth: compact ? 76 : 56, alignment: .leading)
      TextField(title, text: $text)
        .labelsHidden()
        .focused(focused)
        .textFieldStyle(.roundedBorder)
        .multilineTextAlignment(.trailing)
        .font(.body.monospacedDigit())
        .frame(width: compact ? 70 : 96)
      Text(Format.unitName(unit))
        .font(.caption)
        .foregroundStyle(.secondary)
    }
  }
}

private struct Hint: View {
  let text: String

  var body: some View {
    Text(text)
      .font(.caption)
      .foregroundStyle(.secondary)
      .fixedSize(horizontal: false, vertical: true)
  }
}

// MARK: - Start at login and monitoring limits (QUO-132)

/// Applies immediately (not via Save): it is an OS registration, not a draft.
struct StartAtLoginSection: View {
  @ObservedObject var login: StartAtLogin

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Toggle(Copy.startAtLoginToggle, isOn: Binding(
        get: { login.isOn },
        set: { login.setEnabled($0) }
      ))
      if login.needsApproval {
        Hint(text: Copy.startAtLoginNeedsApproval)
      }
      ErrorLine(message: login.errorMessage)
      Hint(text: Copy.monitoringLimits)
    }
    .onAppear { login.reload() }
  }
}

// MARK: - Alerts (QUO-131)

/// Permission status, a way to ask if macOS never asked, and a test
/// notification whose result says what macOS did with it, never that it was seen.
struct AlertsSettingsSection: View {
  @ObservedObject var model: AppModel
  @ObservedObject var notifications: NotificationSettings
  @State private var working = false

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(Copy.alertsSection).font(.headline)
      Text(notifications.statusLine)
        .font(.callout)
        .fixedSize(horizontal: false, vertical: true)
      HStack {
        if notifications.permission == .notAsked {
          Button(Copy.alertsTurnOn) { act { await model.answerAlertsPrompt(enable: true) } }
        }
        if NotificationControl.forPermission(notifications.permission) == .openSettings {
          Button(Copy.alertsOpenSettings) {
            NSWorkspace.shared.open(NotificationControl.settingsURL(bundleID: Bundle.main.bundleIdentifier))
          }
        }
        Button(Copy.alertsSendTest) { act { await model.sendTestNotification() } }
      }
      .disabled(working)
      if let result = notifications.testResult {
        if result.isError {
          ErrorLine(message: result.message)
        } else {
          Text(result.message)
            .font(.caption)
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
        }
      }
      Hint(text: Copy.alertsPanelNote)
    }
    .task { await notifications.reload() }
  }

  private func act(_ work: @escaping @MainActor () async -> Void) {
    working = true
    Task {
      await work()
      working = false
    }
  }
}

// MARK: - Updates (QUO-139)

/// Opt-in toggle (applies at once), a manual check that always works, the
/// outcome in one line, and Install / Later once a verified update is waiting.
struct UpdatesSettingsSection: View {
  @ObservedObject var updater: Updater

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(Copy.updatesSection).font(.headline)
      Toggle(Copy.updatesAutomaticToggle, isOn: Binding(
        get: { updater.automaticChecks },
        set: { updater.setAutomaticChecks($0) }
      ))
      Hint(text: Copy.updatesPrivacyNote)
      HStack(spacing: 8) {
        Button(Copy.updatesCheckButton) { Task { await updater.checkNow() } }
          .disabled(updater.isBusy)
        if updater.isBusy { ProgressView().controlSize(.small) }
        Spacer(minLength: 0)
      }
      if updater.statusIsError {
        ErrorLine(message: updater.statusLine)
      } else {
        Text(updater.statusLine)
          .font(.callout)
          .fixedSize(horizontal: false, vertical: true)
      }
      if let ready = updater.ready, !updater.isBusy {
        if updater.statusIsError {
          // A later check failed; the verified download is still here.
          Text(Copy.updatesReadyLater(ready.version))
            .font(.callout)
            .fixedSize(horizontal: false, vertical: true)
        }
        HStack {
          if updater.laterChosen || updater.statusIsError {
            Button(Copy.updatesInstallRelaunchButton) { updater.install() }
          } else {
            Button(Copy.updatesInstallButton) { updater.install() }
            Button(Copy.updatesLaterButton) { updater.later() }
          }
        }
      }
      Text(Copy.updatesInstalledVersion(updater.currentVersion))
        .font(.caption)
        .foregroundStyle(.secondary)
    }
  }
}

/// Erase everything from this Mac (QUO-297). Inline confirm, as removing a connection.
struct EraseSettingsSection: View {
  @ObservedObject var model: AppModel
  var confirming = false
  let onErased: () -> Void
  @State private var isConfirming: Bool
  @State private var error: String?

  init(model: AppModel, confirming: Bool = false, onErased: @escaping () -> Void = {}) {
    self.model = model
    self.confirming = confirming
    self.onErased = onErased
    _isConfirming = State(initialValue: confirming)
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(Copy.eraseSection).font(.headline)
      Hint(text: Copy.eraseIntro)
      if isConfirming {
        let summary = model.eraseSummary
        Text(Copy.eraseGoes(summary)).font(.callout).fixedSize(horizontal: false, vertical: true)
        Hint(text: Copy.eraseStays)
        HStack {
          Spacer()
          Button(Copy.cancelButton) { isConfirming = false }
            .keyboardShortcut(.cancelAction)
          Button(Copy.eraseConfirmButton, role: .destructive, action: erase)
            .disabled(model.isBusy)
        }
      } else {
        Button(Copy.eraseButton, role: .destructive) {
          error = nil
          isConfirming = true
        }
        .disabled(model.isBusy)
      }
      ErrorLine(message: error)
    }
  }

  private func erase() {
    isConfirming = false
    error = model.eraseLocalData()
    if error == nil { onErased() }
  }
}
