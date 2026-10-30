import AppKit
import Combine
import Foundation
import QuotaCanaryCore

@MainActor
@Observable
final class AppModel {
  private(set) var connections: [Connection] = [] {
    didSet {
      alertOnNewReadings(since: oldValue) // QUO-131
    }
  }
  private(set) var isBusy = false
  /// Connect and load failures (not tied to one connection). Refresh and
  /// remove failures live on each connection's monitoring record (QUO-310).
  private(set) var errorMessage: String?
  /// The typed error behind `errorMessage`. Diagnostics export reads it to
  /// report the enum case name only, never the message.
  private(set) var lastError: MonitorError?
  /// The connect form's pick and credential (QUO-241: only a deliberate pick
  /// of another provider clears the credential).
  private var draft = ConnectDraft()
  var keyInput: String {
    get { draft.key }
    set { draft.key = newValue }
  }
  /// The connect form's values for a multi-value credential, by field name.
  var credentialInputs: [String: String] {
    get { draft.credentialInputs }
    set { draft.credentialInputs = newValue }
  }
  var provider: ProviderID {
    get { draft.provider }
    set { if draft.choose(newValue) { errorMessage = nil } }
  }
  /// The connect form's tool search: narrows the list, never picks.
  var providerSearch = ""
  /// Which surface is running the connect form, if any (QUO-346). The panel
  /// and the stack window each show it on their own; one flag opened both.
  private(set) var addingOn: ConnectSurface?
  /// Taking the form to the other surface starts it fresh, so a half-typed
  /// key never moves between windows (QUO-362). With no connections the
  /// panel shows the form unasked.
  func beginAdding(on surface: ConnectSurface) {
    if let showing = addingOn ?? (connections.isEmpty ? .panel : nil), showing != surface { cancelAdding() }
    addingOn = surface
  }
  var isAddingInPanel: Bool { addingOn == .panel }
  var isAddingInWindow: Bool {
    get { addingOn == .window }
    set { addingOn = newValue ? .window : (addingOn == .window ? nil : addingOn) }
  }
  /// The connect form's Name field: prefilled with `suggestedName`, which it
  /// follows across tool changes until edited (QUO-277); blank uses it too.
  var nameInput: String {
    get { draft.name(suggested: suggestedName) }
    set { draft.setName(newValue, suggested: suggestedName) }
  }
  /// A connection just added whose balances are up for choosing (QUO-283).
  private(set) var watchChoiceID: String?
  /// Each connection's monitoring record: freshness, last failure, streak,
  /// last check (QUO-310).
  let monitor: ConnectionMonitor
  let scheduler: PollScheduler
  let startAtLogin: StartAtLogin

  private let service: MonitoringService
  private let preferences: PreferencesStore
  /// The Application Support folder to remove on erase; nil unless the real
  /// stores are in use (QUO-297).
  var eraseFolder: URL?
  /// Every notification: balances, and monitoring (QUO-310).
  let alerts: AlertEvaluator
  let notifications: NotificationSettings
  /// Update checks and installs (QUO-139). Holds no reference to `service`.
  let updater: Updater
  /// Manual Refresh progress for the panel header and the stack toolbar (QUO-268).
  let manualRefresh: ManualRefresh
  @ObservationIgnored private var observations: Set<AnyCancellable> = []

  init(service: MonitoringService, system: SystemHooks? = nil) {
    self.service = service
    let system = system ?? SystemHooks.makeDefault()
    preferences = system.preferences
    alerts = AlertEvaluator(
      service: service, center: system.notifier
    )
    monitor = ConnectionMonitor(service: service, alerts: alerts)
    scheduler = PollScheduler(
      service: service, monitor: monitor, clock: system.clock, lifecycle: system.lifecycle,
      reachability: system.reachability
    )
    startAtLogin = StartAtLogin(service: system.loginItem, preferences: system.preferences)
    notifications = NotificationSettings(center: system.notifier, preferences: system.preferences)
    updater = system.updater
    manualRefresh = .checking(scheduler: scheduler)
    (system.notifier as? SystemNotificationCenter)?.onOpen = { [weak self] target in self?.openNotification(target) }
    do {
      connections = try service.restore()
    } catch {
      lastError = error as? MonitorError
      errorMessage = lastError?.message ?? Copy.loadFailed
    }
    service.connectionsChanged.sink { [weak self] in self?.connections = $0 }.store(in: &observations)
    scheduler.start() // launch check (if anything is connected) and the 15-minute timer
    updater.start() // automatic update checks only if the user opted in
    Task { await self.notifications.reload() }
    // Back from System Settings: re-read notification permission and the
    // login-item status so neither shows a stale answer (QUO-273).
    activeObserver = NotificationCenter.default.addObserver(
      forName: NSApplication.didBecomeActiveNotification, object: nil, queue: .main
    ) { [weak self] _ in MainActor.assumeIsolated { self?.refreshSystemPermissions() } }
  }

  private var activeObserver: NSObjectProtocol?

  func refreshSystemPermissions() {
    startAtLogin.reload()
    Task { await notifications.reload() }
  }

  /// Real stores by default; QUOTACANARY_SYNTHETIC=1 (or =fail) swaps in
  /// in-memory stores and a scripted transport so the UI runs with no key.
  static func fromEnvironment() -> AppModel {
    switch ProcessInfo.processInfo.environment["QUOTACANARY_SYNTHETIC"] {
    case "1":
      return AppModel(service: Scenarios.syntheticService())
    case "fail":
      return AppModel(service: Scenarios.rejectingService())
    default:
      let model = AppModel(service: MonitoringService(
        credentials: KeychainCredentialStore(),
        store: JSONFileConnectionStore(),
        history: JSONFileReadingHistoryStore(),
        transport: URLSessionTransport()
      ))
      model.eraseFolder = EraseLocalData.defaultFolder()
      return model
    }
  }

  /// Every provider (the catalog plus the hand-written ones), alphabetical;
  /// a provider can have several named connections.
  var availableProviders: [ProviderID] { ProviderID.allCases }

  /// One line under the picker when the bundled catalog could not be read.
  var catalogDiagnostic: String? { ProviderRegistry.current.catalogFailure == nil ? nil : Copy.catalogUnavailable }

  var showsConnectForm: Bool {
    connections.isEmpty || isAddingInPanel
  }

  /// Something to go back to from the connect form, local.
  var hasAnyConnection: Bool { !connections.isEmpty }

  func connect() async {
    await run {
      let key = self.provider.credential(key: self.keyInput, inputs: self.credentialInputs)
      let fresh = try await self.service.connect(provider: self.provider, key: key, name: self.nameInput)
      self.draft.reset()
      self.providerSearch = ""
      // More than one balance: the form stays up as the checklist (QUO-283).
      if WatchedBalances.offersChoice(fresh) {
        self.watchChoiceID = fresh.id
        // A first-run connect has no surface yet: the panel is the one showing it.
        self.addingOn = self.addingOn ?? .panel
      } else {
        self.addingOn = nil
      }
    }
  }

  /// Saves which balances a connection shows. Returns an error message, or nil.
  @discardableResult
  func setWatched(id: String, creditTypes: [String]) -> String? {
    do {
      try service.updateWatched(id: id, creditTypes: creditTypes)
      alerts.schedule([id]) // a balance shown again alerts on its current reading
      return nil
    } catch {
      return (error as? MonitorError)?.message ?? Copy.saveFailed
    }
  }

  /// The connect checklist's button: saves the choice and closes the form.
  func finishWatchChoice(creditTypes: [String]) -> String? {
    guard let id = watchChoiceID else { return nil }
    if let error = setWatched(id: id, creditTypes: creditTypes) { return error }
    watchChoiceID = nil
    addingOn = nil
    return nil
  }

  func cancelAdding() {
    watchChoiceID = nil // the defaults saved at connect stand
    addingOn = nil
    draft.reset()
    providerSearch = ""
    errorMessage = nil
  }

  /// The stack window's sheet closed. When the panel took the form over, its
  /// fresh form stands; any other close cancels (QUO-352).
  func windowSheetDismissed() {
    if addingOn != .panel { cancelAdding() }
  }

  /// Manual refresh of every connection, through the scheduler so it
  /// coalesces with timer, launch and wake checks. One failing does not
  /// block the others. Progress shows in `refreshProgress` (QUO-268).
  func refresh() async {
    await manualRefresh.run()
  }

  var refreshProgress: RefreshProgress { manualRefresh.progress }

  /// Returns an error message, or nil once the connection is gone.
  @discardableResult
  func remove(id: String) -> String? {
    do {
      try service.remove(id: id)
      return nil
    } catch {
      monitor.removeFailed(id: id, error: error)
      return monitor.messages[id]
    }
  }

  /// What an erase would remove, for the confirm (QUO-297).
  var eraseSummary: EraseSummary { EraseLocalData(service: service, folder: eraseFolder).summary }

  /// Erases every key, history and settings from this Mac,
  /// then shows first run. Returns an error message, or nil once it is done.
  func eraseLocalData(
    removeFolder: (URL) throws -> Void = { try FileManager.default.removeItem(at: $0) }
  ) -> String? {
    guard !isBusy else { return Copy.busyTryAgain }
    do {
      try EraseLocalData(service: service, folder: eraseFolder, preferences: preferences).run(removeFolder: removeFolder) {
        updater.resetAfterErase()
        startAtLogin.resetAfterErase()
        notifications.resetAfterErase()
        Task { await notifications.reload() }
      }
    } catch {
      return Copy.eraseFailed
    }
    monitor.forgetAll()
    errorMessage = nil
    lastError = nil
    draft = ConnectDraft()
    providerSearch = ""
    addingOn = nil
    watchChoiceID = nil
    alerts.schedule()
    return nil
  }

  /// Mutes a balance until its reading changes, or unmutes it (QUO-351).
  /// Evaluating right away clears its alert mark while muted and lets an
  /// unmuted balance alert on its current reading. Returns an error message, or nil.
  @discardableResult
  func setMuted(_ key: PoolKey, _ muted: Bool) -> String? {
    do {
      try service.setMuted(key, muted)
      alerts.schedule([key.connectionID])
      return nil
    } catch {
      return (error as? MonitorError)?.message ?? Copy.saveFailed
    }
  }

  /// Validates and saves settings. Returns an error message, or nil on success.
  func saveSettings(_ changes: [PoolKey: PoolSettings]) -> String? {
    do {
      try service.updatePoolSettings(changes)
      return nil
    } catch {
      return (error as? MonitorError)?.message ?? Copy.saveFailed
    }
  }

  // MARK: Named connections (QUO-129)

  /// What a blank Name field in the connect form becomes.
  var suggestedName: String { ConnectionNames.suggested(for: provider, among: connections) }

  /// Live check for the connect form's Name field; nil when blank or free.
  var connectNameError: String? {
    guard !ConnectionNames.normalized(nameInput).isEmpty else { return nil }
    return ConnectionNames.validate(nameInput, provider: provider, among: connections)?.message
  }

  /// Live check for a rename draft; nil when valid or unchanged.
  func renameError(id: String, draft: String) -> String? {
    guard let connection = connections.first(where: { $0.id == id }) else { return nil }
    return ConnectionNames.validate(draft, provider: connection.provider, among: connections, excluding: id)?.message
  }

  /// Returns an error message, or nil once the new name is saved.
  func rename(id: String, to name: String) -> String? {
    do {
      try service.rename(id: id, to: name)
      return nil
    } catch {
      return (error as? MonitorError)?.message ?? Copy.saveFailed
    }
  }

  /// Checks the new key with the provider, then swaps it in. Returns an error
  /// message, or nil once the new key and its reading are saved.
  func replaceKey(id: String, key: String) async -> String? {
    guard !isBusy else { return Copy.busyTryAgain }
    isBusy = true
    defer { isBusy = false }
    do {
      try await service.replaceKey(id: id, key: key)
      monitor.keyReplaced(id: id) // the last failure belonged to the old key
      return nil
    } catch {
      return (error as? MonitorError)?.message ?? Copy.saveFailed
    }
  }

  private func run(_ work: @escaping () async throws -> Void) async {
    guard !isBusy else { return }
    isBusy = true
    errorMessage = nil
    lastError = nil
    defer { isBusy = false }
    do {
      try await work()
    } catch {
      lastError = error as? MonitorError
      errorMessage = lastError?.message ?? Copy.saveFailed
    }
  }
}

// MARK: - Freshness and start at login (QUO-132)

extension AppModel {
  var showsLoginPrompt: Bool { startAtLogin.showsPrompt(hasConnections: hasAnyConnection) }
}

// MARK: - Burn rate, ETA and sparkline (QUO-186)

extension AppModel {
  /// Views re-read local history whenever `connections` publishes.
  func burn(for key: PoolKey) -> BurnRate? { BurnRate.of(service.history(for: key)) }

  func assessment(for key: PoolKey) -> BurnAssessment { BurnRate.assess(service.history(for: key)) }

  func eta(for row: PoolRow) -> BurnEta? { PoolEta.of(row, history: service.history(for: row.key)) }

  func sparkline(for key: PoolKey) -> [HistoryPoint] { service.sparkline(for: key) }
}

// MARK: - Presented balances

extension AppModel {
  var shown: BalancesAsShown {
    BalancesAsShown(
      local: connections, health: monitor.health, errors: monitor.messages,
      lastErrors: monitor.errors
    )
  }
}

// MARK: - Notifications (QUO-131)

extension AppModel {
  /// Third first-run question, after alerts and start at login (QUO-139).
  var showsUpdatePrompt: Bool { updater.showsPrompt(hasConnections: hasAnyConnection) }

  /// Asked once after the first successful connection, before start at login.
  var showsAlertsPrompt: Bool { notifications.showsPrompt(hasConnections: hasAnyConnection) }

  /// Every new reading (connect, scheduled or manual refresh) is evaluated
  /// once. Settings edits and mark updates carry no new reading, so they
  /// never trigger a notification on their own.
  func alertOnNewReadings(since old: [Connection]) {
    var before: [String: Date?] = [:]
    for connection in old { before[connection.id] = connection.lastReading?.checkedAt }
    let changed = connections.filter { connection in
      guard let at = connection.lastReading?.checkedAt else { return false }
      guard let previous = before[connection.id] else { return true }
      return previous != at
    }.map(\.id)
    if !changed.isEmpty { alerts.schedule(changed) }
  }

  /// The first-run row and the Settings button. Once allowed, warnings that
  /// were waiting on permission go out.
  func answerAlertsPrompt(enable: Bool) async {
    if await notifications.answerPrompt(enable: enable) {
      await alerts.evaluate(nil)
    }
  }

  func sendTestNotification() async {
    await notifications.sendTest()
    if notifications.permission == .allowed { await alerts.evaluate(nil) }
  }
}

/// A place the connect form can run (QUO-346).
enum ConnectSurface: Equatable { case panel, window }
