import AppKit
import QuotaCanaryCore
import SwiftUI

enum Brand {
  static let gold = Color(red: 1, green: 196 / 255, blue: 0)
  static let goldNS = NSColor(red: 1, green: 196 / 255, blue: 0, alpha: 1)
}

/// The menu bar mark: native monochrome unless a monitored balance is at risk.
struct BirdLabel: View {
  let active: Bool
  /// Worst monitored warning (QUO-131): changes the mark's color and badge.
  var severity: AlertSeverity = .none
  var poolsAtRisk: Int = 0

  var body: some View {
    HStack(spacing: 4) {
      Image(nsImage: Self.image(active: active, severity: severity))
      if poolsAtRisk > 0 {
        Text(Copy.menuBarCount(poolsAtRisk)).monospacedDigit()
      }
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(poolsAtRisk > 0
      ? Copy.menuBarCountAccessibility(poolsAtRisk, severity: severity)
      : Self.accessibility(severity))
  }

  /// Point height of the mark in the menu bar (QUO-171).
  static let menuBarHeight: CGFloat = 16

  static func image(active _: Bool, severity: AlertSeverity = .none) -> NSImage {
    if severity != .none { return alertImage(severity) }
    let base = LogoMark.image(height: menuBarHeight)
    base.accessibilityDescription = Copy.birdAccessibility
    return base
  }
}

struct PanelView: View {
  @ObservedObject var model: AppModel
  @Environment(\.referenceDate) private var referenceDate

  var body: some View {
    if model.showsConnectForm { connectPanel } else { quietPanel }
  }

  private var quietPanel: some View {
    let shown = model.shown
    let panel = shown.panel
    return VStack(alignment: .leading, spacing: 6) {
      HStack(spacing: 8) {
        LogoMarkImage(height: 14).foregroundStyle(Brand.gold)
        Text(Copy.appName).fontWeight(.semibold)
        Spacer(minLength: 0)
        if model.refreshProgress != .idle {
          RefreshProgressLabel(progress: model.refreshProgress)
        } else {
          TimelineView(.periodic(from: .now, by: 30)) { context in
            Text(shown.freshness(isBusy: model.isBusy).text { ConnectedView.relative($0, now: referenceDate ?? context.date) })
              .font(.caption).foregroundStyle(.secondary).lineLimit(1)
          }
        }
        Button { Task { await model.refresh() } } label: {
          Image(systemName: "arrow.clockwise")
        }
        .buttonStyle(.borderless).keyboardShortcut("r").disabled(model.isBusy || model.refreshProgress.isChecking)
        .help(Copy.refreshButton).accessibilityLabel(Copy.refreshButton)
      }
      .padding(.horizontal, 8).padding(.vertical, 6)
      if !panel.attention.isEmpty {
        section(Copy.attentionSection)
        if panel.attention.count > 10 {
          ScrollView { attentionRows(panel.attention) }.frame(height: 280)
        } else { attentionRows(panel.attention) }
      }
      if panel.quietCount > 0 {
        if !panel.attention.isEmpty { Divider().padding(.horizontal, 8) }
        section(panel.quietHeading)
        if panel.quietCount > 6 {
          menuAction(Copy.moreConnections(panel.quietCount)) { StackWindow.show(model: model) }
            .accessibilityLabel(Copy.moreConnectionsAccessibility(panel.quietCount))
        } else {
          ForEach(panel.quiet) { line($0, topUp: false) }
        }
      }
      AlertProblemLine(model: model, alerts: model.alerts, notifications: model.notifications)
      FirstRunPrompts(model: model, notifications: model.notifications, login: model.startAtLogin, updater: model.updater)
      UpdateReadyLine(updater: model.updater, model: model)
      Divider().padding(.horizontal, 8)
      menuAction(Copy.addConnectionMenu) { model.isAddingConnection = true }.disabled(model.isBusy)
      menuAction(Copy.settingsButton, shortcut: "⌘,") { SettingsWindow.show(model: model) }.keyboardShortcut(",")
      menuAction(Copy.openWindowButton) { StackWindow.show(model: model) }
      Divider().padding(.horizontal, 8)
      menuAction(Copy.quitButton, shortcut: "⌘Q") { NSApplication.shared.terminate(nil) }.keyboardShortcut("q")
    }
    .font(.body).padding(6).frame(width: 380)
  }

  private func section(_ title: String) -> some View {
    Text(title).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
      .padding(.horizontal, 8).padding(.top, 4)
  }

  private func attentionRows(_ lines: [BalancesAsShown.PanelLine]) -> some View {
    VStack(spacing: 0) {
      ForEach(lines) { line($0, topUp: true) }
    }
  }

  /// `topUp` adds the visible "Top up" button (Needs attention rows only).
  @ViewBuilder
  private func line(_ line: BalancesAsShown.PanelLine, topUp: Bool) -> some View {
    switch line {
    case let .localFailure(failure): failureRow(failure)
    case let .local(connection, row, extra):
      balanceRow(connection, row: row, extra: extra, topUp: topUp)
    }
  }

  private func balanceRow(
    _ connection: Connection, row: PoolRow, extra: Int, topUp: Bool
  ) -> some View {
    HStack(spacing: 4) {
      balanceRowButton(connection, row: row, extra: extra)
      if topUp { TopUpButton(url: connection.provider.topupURL).buttonStyle(.bordered).controlSize(.small) }
    }
    .contextMenu { TopUpButton(url: connection.provider.topupURL) }
  }

  private func balanceRowButton(_ connection: Connection, row: PoolRow, extra: Int) -> some View {
    return Button { StackWindow.show(model: model, selecting: row.key) } label: {
      AdaptiveRowLine(name: connection.name, detail: row.pool.label) {
        StatusIndicator(status: row.status)
        ProviderLogo(provider: connection.provider)
      } trailing: {
        NotMonitoredCue(row: row, compact: true)
        Text(Self.compactAmount(row)).monospacedDigit().fixedSize()
        if extra > 0 { Text("+\(extra)").foregroundStyle(.secondary).fixedSize() }
      }
    }
    .buttonStyle(QuietMenuStyle())
    .help(connection.name + ", " + PoolRowView.summary(row))
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(connection.name + ", " + PoolRowView.summary(row)
      + (extra > 0 ? ", " + Copy.additionalBalances(extra) : ""))
  }

  private func failureRow(_ failure: BalancesAsShown.LocalFailure) -> some View {
    let connection = failure.connection
    return TimelineView(.periodic(from: .now, by: 30)) { context in
      let lastGood = HealthLine.text(connection: connection, health: failure.health, now: referenceDate ?? context.date)
      let reason = failure.reason
      Button { StackWindow.show(model: model, connectionID: connection.id) } label: {
        AdaptiveRowLine(name: connection.name, detail: failure.detail) {
          Image(systemName: "clock.badge.exclamationmark").frame(width: 14)
          ProviderLogo(provider: connection.provider)
        } trailing: {
          Text(connection.lastReading.map { Copy.lastGoodShort(ConnectedView.relative($0.checkedAt, now: referenceDate ?? context.date)) } ?? Copy.noGoodCheckYet)
            .font(.caption).foregroundStyle(.secondary).fixedSize()
        }
      }
      .buttonStyle(QuietMenuStyle())
      .help("\(connection.name), \(reason), \(lastGood)")
      .accessibilityElement(children: .ignore)
      .accessibilityLabel("\(connection.name), \(reason), \(lastGood)")
    }
  }

  private func menuAction(_ title: String, shortcut: String = "", action: @escaping () -> Void) -> some View {
    Button(action: action) {
      HStack { Text(title); Spacer(); Text(shortcut).foregroundStyle(.secondary) }
    }.buttonStyle(QuietMenuStyle())
  }

  static func compactAmount(_ row: PoolRow) -> String {
    PoolRowView.amount(row).replacingOccurrences(of: " of ", with: " / ")
  }

  private var connectPanel: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack(spacing: 8) {
        LogoMarkImage(height: 17).foregroundStyle(Brand.gold)
        Text(Copy.appName).font(.title3.weight(.semibold))
        Spacer()
        if model.hasAnyConnection {
          Button { StackWindow.show(model: model) } label: {
            Image(systemName: "arrow.up.forward.app")
          }
          .help(Copy.openWindowButton)
          .accessibilityLabel(Copy.openWindowButton)
          .buttonStyle(.borderless)
        }
      }

      AlertProblemLine(model: model, alerts: model.alerts, notifications: model.notifications)
      if model.hasAnyConnection { PanelActions(model: model) }
      FirstRunPrompts(
        model: model, notifications: model.notifications, login: model.startAtLogin, updater: model.updater
      )
      UpdateReadyLine(updater: model.updater, model: model)
      if model.showsConnectForm { ConnectStep(model: model) }

      Divider()
      HStack {
        if model.hasAnyConnection {
          Button(Copy.openWindowButton) { StackWindow.show(model: model) }.buttonStyle(.borderless)
        } else {
          // Diagnostics live in Settings, out of the setup flow (QUO-270).
          Button(Copy.settingsButton) { SettingsWindow.show(model: model) }.buttonStyle(.borderless)
        }
        Spacer()
        Button(Copy.quitButton) { NSApplication.shared.terminate(nil) }
          .keyboardShortcut("q")
          .buttonStyle(.borderless)
      }
      .font(.callout)
    }
    .padding(16)
    .frame(width: 380)
  }

}

private struct QuietMenuStyle: ButtonStyle {
  @Environment(\.isEnabled) private var isEnabled
  @State private var hovered = false

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .frame(maxWidth: .infinity, minHeight: 28, alignment: .leading)
      .padding(.horizontal, 8)
      .contentShape(Rectangle())
      .background((hovered || configuration.isPressed) && isEnabled
        ? Color(nsColor: .selectedContentBackgroundColor).opacity(0.18) : .clear,
        in: RoundedRectangle(cornerRadius: 5))
      .onHover { hovered = $0 }
  }
}

struct ConnectForm: View {
  @ObservedObject var model: AppModel
  /// Tool search first, then the picked tool's first credential (QUO-270).
  @FocusState private var searchFocused: Bool
  @FocusState private var keyFocused: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(Copy.connectTitle(model.provider.displayName)).font(.subheadline.weight(.semibold))
      ProviderList(model: model, searchFocused: $searchFocused)
        .disabled(model.isBusy)
      ErrorLine(message: model.catalogDiagnostic)
      // Every field keeps a visible label once filled (QUO-270).
      VStack(alignment: .leading, spacing: 3) {
        Text(Copy.nameField).font(.callout)
        TextField(Copy.nameField, text: $model.nameInput, prompt: Text(model.suggestedName))
          .labelsHidden()
          .textFieldStyle(.roundedBorder)
          .onSubmit(submit)
          .disabled(model.isBusy)
      }
      ErrorLine(message: model.connectNameError)
      if model.provider.credentialFields.isEmpty {
        VStack(alignment: .leading, spacing: 3) {
          Text(Copy.keyLabel(model.provider.displayName)).font(.callout)
          SecureField(Copy.keyLabel(model.provider.displayName), text: $model.keyInput, prompt: Text(""))
            .labelsHidden()
            .textFieldStyle(.roundedBorder)
            .focused($keyFocused)
            .onSubmit(submit)
            .disabled(model.isBusy)
        }
      } else {
        CredentialInputs(
          fields: model.provider.credentialFields, values: $model.credentialInputs, firstFocused: $keyFocused,
          onSubmit: submit
        )
        .disabled(model.isBusy)
      }
      if let requirement = Copy.keyRequirement(model.provider.rawValue) {
        Text(requirement)
          .font(.caption)
          .foregroundStyle(.secondary)
          .fixedSize(horizontal: false, vertical: true)
      }
      Text(Copy.keyStorageNote(model.provider.displayName))
        .font(.caption)
        .foregroundStyle(.secondary)
        .fixedSize(horizontal: false, vertical: true)
      HStack {
        Button(Copy.connectButton, action: submit)
          .buttonStyle(.borderedProminent)
          .keyboardShortcut(.defaultAction)
          .disabled(model.isBusy || model.connectNameError != nil)
        if model.isBusy {
          ProgressView().controlSize(.small)
          Text(Copy.connecting).font(.caption).foregroundStyle(.secondary)
        }
        Spacer()
        if model.hasAnyConnection {
          Button(Copy.cancelButton) { model.cancelAdding() }
            .keyboardShortcut(.cancelAction)
            .disabled(model.isBusy)
        }
      }
      ErrorLine(message: model.errorMessage)
    }
    .onAppear { searchFocused = true }
    .onChange(of: model.provider) { keyFocused = true }
  }

  private func submit() {
    Task { await model.connect() }
  }
}

/// The connect form's tool picker (QUO-241): a search field over a scrolling
/// list of logo rows. Typing only narrows the list (QUO-267); a click, or
/// Return on the row the arrow keys highlight, picks.
struct ProviderList: View {
  @ObservedObject var model: AppModel
  var searchFocused: FocusState<Bool>.Binding
  @State private var highlighted: ProviderID?

  private var rows: [ProviderID] { ProviderSearch.filter(model.providerSearch, among: model.availableProviders) }

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      TextField(Copy.providerSearchPlaceholder, text: $model.providerSearch)
        .textFieldStyle(.roundedBorder)
        .focused(searchFocused)
        .onKeyPress(.downArrow) { highlighted = ProviderPicker.move(highlighted, by: 1, in: rows); return .handled }
        .onKeyPress(.upArrow) { highlighted = ProviderPicker.move(highlighted, by: -1, in: rows); return .handled }
        // Return picks here rather than submitting the form.
        .onKeyPress(.return) {
          if let highlighted { model.provider = highlighted }
          return .handled
        }
      ScrollViewReader { proxy in
        ScrollView {
          LazyVStack(spacing: 1) {
            ForEach(rows) { row($0).id($0) }
          }
          .padding(4)
        }
        .frame(height: 166)
        .overlay { if rows.isEmpty { noMatches } }
        .background(Color(nsColor: .textBackgroundColor), in: RoundedRectangle(cornerRadius: 6))
        .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Color(nsColor: .separatorColor)))
        .onChange(of: highlighted) { _, id in if let id { proxy.scrollTo(id) } }
        .onAppear { proxy.scrollTo(model.provider, anchor: .center) }
      }
      .accessibilityElement(children: .contain)
      .accessibilityLabel(Copy.providerPicker)
    }
    .onChange(of: rows, initial: true) { _, rows in
      highlighted = ProviderPicker.highlight(current: model.provider, in: rows)
    }
    .onChange(of: model.provider) { _, provider in highlighted = provider }
  }

  private func row(_ provider: ProviderID) -> some View {
    let selected = provider == model.provider
    return Button { model.provider = provider } label: {
      HStack(spacing: 8) {
        ProviderLogo(provider: provider)
        Text(provider.displayName).lineLimit(1)
        Spacer(minLength: 4)
        if selected {
          Image(systemName: "checkmark").font(.caption.weight(.semibold)).foregroundStyle(Color.accentColor)
        }
      }
      .padding(.horizontal, 6)
      .frame(height: 26)
      .contentShape(Rectangle())
      .background(
        selected ? Color.accentColor.opacity(0.18) : provider == highlighted ? Color.primary.opacity(0.07) : .clear,
        in: RoundedRectangle(cornerRadius: 5)
      )
    }
    .buttonStyle(.plain)
    .onHover { if $0 { highlighted = provider } }
    .accessibilityAddTraits(selected ? .isSelected : [])
  }

  private var noMatches: some View {
    VStack(spacing: 6) {
      Text(Copy.noMatchingTools).foregroundStyle(.secondary)
      Button(Copy.clearSearch) { model.providerSearch = "" }
    }
    .font(.callout)
  }
}

/// One input per value of a multi-value credential (QUO-251): plain text for
/// ids, secure for secrets, each under a label that stays once filled (QUO-270).
struct CredentialInputs: View {
  let fields: [CredentialField]
  @Binding var values: [String: String]
  /// Focus for the first field, when the form moves there after a pick.
  var firstFocused: FocusState<Bool>.Binding?
  let onSubmit: () -> Void

  var body: some View {
    ForEach(fields, id: \.name) { field in
      let text = Binding(get: { values[field.name, default: ""] }, set: { values[field.name] = $0 })
      VStack(alignment: .leading, spacing: 3) {
        Text(field.label).font(.callout)
        Group {
          if field.isSecret {
            SecureField(field.label, text: text, prompt: Text(""))
          } else {
            TextField(field.label, text: text, prompt: Text(""))
          }
        }
        .labelsHidden()
        .textFieldStyle(.roundedBorder)
        .onSubmit(onSubmit)
        .focused(field.name == fields.first?.name ? firstFocused : nil)
      }
    }
  }
}

private extension View {
  @ViewBuilder func focused(_ binding: FocusState<Bool>.Binding?) -> some View {
    if let binding { focused(binding) } else { self }
  }
}

/// One connection: its pools (one row each), when it was checked, and any
/// error from its last refresh.
struct ConnectedView: View {
  @ObservedObject var model: AppModel
  let connection: Connection
  var onlyAtRisk = false

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack(alignment: .firstTextBaseline) {
        ConnectionTitle(connection: connection)
        Spacer(minLength: 8)
        Button(Copy.manageButton) { StackWindow.show(model: model, connectionID: connection.id) }
          .buttonStyle(.borderless)
          .font(.caption)
          .accessibilityLabel(Copy.manageAccessibility(connection.name))
      }

      ForEach(ConnectionPresentation.rankedPools(connection.poolRows).filter { !onlyAtRisk || $0.alerts }) { PoolRowView(row: $0) }

      let record = model.monitor.record(for: connection.id)
      HealthLine(connection: connection, health: record.health)
      // Why the last check failed sits with its health line (QUO-133).
      ErrorLine(message: record.message)
      FailureStreakNote(connection: connection)
    }
  }

  static func note(_ provider: ProviderID) -> String? { provider.note }

  static func relative(_ date: Date, now: Date) -> String {
    if now.timeIntervalSince(date) < 60 { return Copy.justNow }
    let formatter = RelativeDateTimeFormatter()
    formatter.unitsStyle = .full
    return formatter.localizedString(for: date, relativeTo: now)
  }
}

/// Refresh, Settings, and Add connection, below the connections.
struct PanelActions: View {
  @ObservedObject var model: AppModel

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack {
        Button(Copy.refreshButton) { Task { await model.refresh() } }
          .keyboardShortcut("r")
          .disabled(model.isBusy || model.refreshProgress.isChecking)
        if model.isBusy {
          ProgressView().controlSize(.small)
          Text(Copy.refreshing).font(.caption).foregroundStyle(.secondary)
        } else {
          RefreshProgressLabel(progress: model.refreshProgress)
        }
        Spacer()
        Button(Copy.settingsButton) { SettingsWindow.show(model: model) }
          .keyboardShortcut(",")
      }
      if !model.isAddingConnection {
        Button {
          model.isAddingConnection = true
        } label: {
          Label(Copy.addConnectionButton, systemImage: "plus")
        }
        .buttonStyle(.borderless)
        .disabled(model.isBusy)
      }
      DiagnosticsExportRow(model: model)
    }
    .padding(10)
    .modifier(PanelControlMaterial())
  }
}

struct ErrorLine: View {
  let message: String?

  var body: some View {
    if let message {
      Label(message, systemImage: "exclamationmark.triangle.fill")
        .font(.caption)
        .foregroundStyle(.red)
        .fixedSize(horizontal: false, vertical: true)
    }
  }
}

// MARK: - Freshness and start at login (QUO-132)

/// One caption per connection: checking, when it was last read, or why not.
struct HealthLine: View {
  let connection: Connection
  let health: ConnectionHealth?
  @Environment(\.referenceDate) private var referenceDate

  var body: some View {
    TimelineView(.periodic(from: .now, by: 30)) { context in
      Label {
        Text(Self.text(connection: connection, health: health, now: referenceDate ?? context.date))
      } icon: {
        if let symbol = Self.symbol(health) { Image(systemName: symbol) }
      }
      .labelStyle(HealthLabelStyle())
      .font(.caption)
      .foregroundStyle(.secondary)
      .fixedSize(horizontal: false, vertical: true)
    }
  }

  static func text(connection: Connection, health: ConnectionHealth?, now: Date) -> String {
    let lastRead = connection.lastReading?.checkedAt
    func ago(_ date: Date) -> String { ConnectedView.relative(date, now: now) }
    switch health {
    case .checking:
      return Copy.checkingNow
    case let .offline(lastSuccess):
      return (lastSuccess ?? lastRead).map { Copy.offlineLastGoodCheck(ago($0)) } ?? Copy.offlineNotCheckedYet
    case let .failed(lastSuccess, _):
      return (lastSuccess ?? lastRead).map { Copy.lastGoodCheck(ago($0)) } ?? Copy.noGoodCheckYet
    case let .ok(lastSuccess):
      return Copy.checked(ago(lastSuccess))
    case nil where connection.monitoring.consecutiveFailures > 0:
      // Relaunched mid-incident: the saved reading is the last good one, not a fresh check.
      return lastRead.map { Copy.lastGoodCheck(ago($0)) } ?? Copy.noGoodCheckYet
    case nil:
      return lastRead.map { Copy.checked(ago($0)) } ?? Copy.notCheckedYet
    }
  }

  static func symbol(_ health: ConnectionHealth?) -> String? {
    switch health {
    case .checking: return "arrow.triangle.2.circlepath"
    case .offline: return "wifi.slash"
    // Stale on purpose: never mistaken for a fresh "Checked" line (QUO-133).
    case .failed: return "clock.badge.exclamationmark"
    default: return nil
    }
  }
}

private struct HealthLabelStyle: LabelStyle {
  func makeBody(configuration: Configuration) -> some View {
    HStack(spacing: 4) {
      configuration.icon
      configuration.title
    }
  }
}

/// First-run question, shown once something is connected. Disappears once
/// answered; a refusal from macOS stays visible next to the buttons.
struct LoginPromptRow: View {
  @ObservedObject var login: StartAtLogin

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(Copy.startAtLoginPromptTitle).font(.subheadline.weight(.semibold))
      Text(Copy.startAtLoginPromptBody)
        .font(.caption)
        .foregroundStyle(.secondary)
        .fixedSize(horizontal: false, vertical: true)
      HStack {
        Button(Copy.startAtLoginEnable) { login.answerPrompt(enable: true) }
        Button(Copy.startAtLoginNotNow) { login.answerPrompt(enable: false) }
      }
      ErrorLine(message: login.errorMessage)
    }
    .padding(10)
    .frame(maxWidth: .infinity, alignment: .leading)
    .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Color(nsColor: .separatorColor)))
  }
}

// MARK: - Notifications (QUO-131)

extension BirdLabel {
  static func accessibility(_ severity: AlertSeverity) -> String {
    switch severity {
    case .none: return Copy.birdAccessibility
    case .low: return Copy.birdLowAccessibility
    case .critical: return Copy.birdCriticalAccessibility
    case .empty: return Copy.birdEmptyAccessibility
    }
  }

  /// Shape, not only color: low carries a gold dot badge, critical an
  /// exclamation badge, empty a cross badge. Gold for low, red for critical/empty.
  static func alertImage(_ severity: AlertSeverity) -> NSImage {
    let color: NSColor = severity == .low ? Brand.goldNS : .systemRed
    let badgeName: String
    switch severity {
    case .low: badgeName = "circle.fill"
    case .critical: badgeName = "exclamationmark.circle.fill"
    case .empty, .none: badgeName = "xmark.circle.fill"
    }
    let palette = NSImage.SymbolConfiguration(paletteColors: [color])
    let bird = LogoMark.image(height: menuBarHeight, color: color)
    // Circle badges draw their glyph in white so the ! and the x stay visible.
    let badgePalette = severity == .low ? palette : NSImage.SymbolConfiguration(paletteColors: [.white, color])
    let badge = NSImage(systemSymbolName: badgeName, accessibilityDescription: nil)?
      .withSymbolConfiguration(NSImage.SymbolConfiguration(pointSize: 9, weight: .bold).applying(badgePalette))
      ?? NSImage()
    // The badge overlaps the mark only slightly, so the ring and its opening stay readable.
    let size = NSSize(width: ceil(bird.size.width + badge.size.width * 0.8), height: max(ceil(bird.size.height), 16))
    let image = NSImage(size: size, flipped: false) { rect in
      bird.draw(in: NSRect(
        x: 0, y: (rect.height - bird.size.height) / 2, width: bird.size.width, height: bird.size.height
      ))
      // Top right: the mark's beak is bottom right, and the badge must not cover it.
      let badgeRect = NSRect(
        x: rect.width - badge.size.width, y: rect.height - badge.size.height,
        width: badge.size.width, height: badge.size.height
      )
      // Clear a ring around the badge so it reads as its own shape.
      NSGraphicsContext.current?.compositingOperation = .destinationOut
      NSBezierPath(ovalIn: badgeRect.insetBy(dx: -1, dy: -1)).fill()
      NSGraphicsContext.current?.compositingOperation = .sourceOver
      badge.draw(in: badgeRect)
      return true
    }
    image.isTemplate = false
    image.accessibilityDescription = accessibility(severity)
    return image
  }
}

/// One first-run question at a time: alerts, then start at login, then updates.
struct FirstRunPrompts: View {
  @ObservedObject var model: AppModel
  @ObservedObject var notifications: NotificationSettings
  @ObservedObject var login: StartAtLogin
  @ObservedObject var updater: Updater

  var body: some View {
    if notifications.showsPrompt(hasConnections: model.hasAnyConnection) {
      AlertsPromptRow(model: model, notifications: notifications)
    } else if login.showsPrompt(hasConnections: model.hasAnyConnection) {
      LoginPromptRow(login: login)
    } else if updater.showsPrompt(hasConnections: model.hasAnyConnection) {
      UpdatePromptRow(updater: updater)
    }
  }
}

// MARK: - Updates (QUO-139)

/// "Check for updates automatically?" Either answer settles it; Settings can change it later.
struct UpdatePromptRow: View {
  @ObservedObject var updater: Updater

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(Copy.updatesPromptTitle).font(.subheadline.weight(.semibold))
      Text(Copy.updatesPromptBody)
        .font(.caption)
        .foregroundStyle(.secondary)
        .fixedSize(horizontal: false, vertical: true)
      HStack {
        Button(Copy.updatesEnable) { updater.answerPrompt(enable: true) }
        Button(Copy.updatesNotNow) { updater.answerPrompt(enable: false) }
      }
    }
    .padding(10)
    .frame(maxWidth: .infinity, alignment: .leading)
    .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Color(nsColor: .separatorColor)))
  }
}

/// The panel's only update line: a verified download is waiting. Opens Settings.
struct UpdateReadyLine: View {
  @ObservedObject var updater: Updater
  let model: AppModel

  var body: some View {
    if let line = updater.panelLine {
      Button { SettingsWindow.show(model: model) } label: {
        Label(line, systemImage: "arrow.down.circle")
          .font(.caption)
          .fixedSize(horizontal: false, vertical: true)
      }
      .buttonStyle(.borderless)
    }
  }
}

/// "Turn on alerts?" after the first successful connection. Either answer
/// keeps the connection and the panel warnings exactly as they are.
struct AlertsPromptRow: View {
  @ObservedObject var model: AppModel
  @ObservedObject var notifications: NotificationSettings

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(Copy.alertsPromptTitle).font(.subheadline.weight(.semibold))
      Text(Copy.alertsPromptBody)
        .font(.caption)
        .foregroundStyle(.secondary)
        .fixedSize(horizontal: false, vertical: true)
      HStack {
        Button(Copy.alertsEnable) { Task { await model.answerAlertsPrompt(enable: true) } }
        Button(Copy.alertsNotNow) { Task { await model.answerAlertsPrompt(enable: false) } }
      }
      ErrorLine(message: notifications.promptError)
    }
    .padding(10)
    .frame(maxWidth: .infinity, alignment: .leading)
    .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Color(nsColor: .separatorColor)))
  }
}

/// Says truthfully when a due warning did not reach macOS. Hidden while the
/// first-run question is on screen (that row is the fix).
struct AlertProblemLine: View {
  @ObservedObject var model: AppModel
  /// Balances and monitoring (QUO-133): one evaluator.
  @ObservedObject var alerts: AlertEvaluator
  @ObservedObject var notifications: NotificationSettings

  var body: some View {
    if let problem = alerts.problem,
       !notifications.showsPrompt(hasConnections: model.hasAnyConnection)
    {
      Label(problem.message, systemImage: "bell.slash")
        .font(.caption)
        .foregroundStyle(problem == .failed ? Color.red : Color.secondary)
        .fixedSize(horizontal: false, vertical: true)
    }
  }
}

// MARK: - Monitoring health (QUO-133)

/// Shown once a connection has failed enough checks in a row to notify, and
/// until a check succeeds: the balances above it are old.
struct FailureStreakNote: View {
  let connection: Connection

  var body: some View {
    let count = connection.monitoring.consecutiveFailures
    if count >= MonitoringDecider.failureThreshold {
      Label(Copy.failuresInARow(count), systemImage: "exclamationmark.arrow.triangle.2.circlepath")
        .font(.caption)
        .foregroundStyle(StatusIndicator.checkFailedTextColor)
        .fixedSize(horizontal: false, vertical: true)
    }
  }
}
