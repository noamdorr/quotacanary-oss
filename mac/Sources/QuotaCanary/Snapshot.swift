import AppKit
import QuotaCanaryCore
import SwiftUI

/// `QuotaCanary --snapshot <dir>`: renders the panel in each state, light and
/// dark, to PNG files in-process. No screen-recording permission is needed, so
/// a session without a screen can still see the UI. Every model comes from the
/// Core scenarios (QUO-313), whose Core tests own what each state contains;
/// this file checks layout only.
@MainActor
enum Snapshot {
  private typealias Scene = (String, AnyView)
  private static let reference = Scenarios.checkedAt

  static func run(into dir: String) async -> Int32 {
    let url = URL(fileURLWithPath: dir, isDirectory: true)
    do {
      try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    } catch {
      FileHandle.standardError.write(Data("snapshot: cannot create \(dir)\n".utf8))
      return 1
    }

    // Frozen clock, fake login item, prompt already answered: states stay deterministic.
    SystemHooks.makeDefault = { .preview() }
    let freshnessStates = await freshnessStates() + alertStates(birdsInto: url) // QUO-131
    guard let monitoringStates = await monitoringStates() else { return 1 } // QUO-133
    let updateStates = await updateStates() // QUO-139

    func firstRun(_ edit: (AppModel) -> Void = { _ in }) -> AppModel {
      let model = AppModel(service: Scenarios.syntheticService())
      edit(model)
      return model
    }
    let connected = await model(.openRouter)
    let failing = await model(.openRouterThen(.respond(status: 500, body: "")))
    await failing.refresh()
    let mixed = await model(.mixed)
    // Healthy but unmonitored (dimmed), empty, and a pool the provider stopped reporting (unknown).
    let edge = await model(.edge)
    if let openRouter = edge.connections.first(where: { $0.provider == .openrouter }) {
      _ = edge.saveSettings([
        PoolKey(connectionID: openRouter.id, creditType: "credits"): PoolSettings(monitored: false, low: 10, critical: 5),
      ])
    }
    let apollo = await model(.apollo)

    var invalidDrafts: [PoolKey: PoolSettingsDraft] = [:]
    for connection in mixed.connections {
      switch connection.provider {
      case .openrouter:
        invalidDrafts[PoolKey(connectionID: connection.id, creditType: "credits")] = PoolSettingsDraft(monitored: true, low: "ten")
      case .hunter:
        invalidDrafts[PoolKey(connectionID: connection.id, creditType: "verifications")] = PoolSettingsDraft(monitored: true, low: "0")
      default: break
      }
    }
    // One invalid Warn below on OpenRouter, hidden by a search for Hunter (QUO-272).
    let hiddenInvalid = invalidDrafts.filter { $0.key.creditType == "credits" }
    // Unsaved, valid edits on two balances, in Settings and the inspector (QUO-263).
    let editedRows = Array(mixed.connections.flatMap(\.poolRows).filter { $0.status != .unavailable }.prefix(2))
    let unsavedDrafts = Dictionary(uniqueKeysWithValues: editedRows.map {
      ($0.key, PoolSettingsDraft(monitored: !$0.settings.monitored, low: "25"))
    })
    let unsavedStack = StackWindowState(selection: editedRows.first?.key)
    unsavedStack.drafts.drafts = BalanceDrafts(unsavedDrafts)

    // MARK: Named connections (QUO-129)
    let twoHunter = await model(.twoHunter)
    let clientWork = twoHunter.connections.last?.id ?? ""
    // Adding a second Hunter: the Name field suggests "Hunter 2".
    let secondHunter = await model(.hunter)
    secondHunter.beginAdding(on: .panel)
    secondHunter.provider = .hunter
    // QUO-283: the checklist right after a two-balance connect, and the
    // inspector's control once one of them is hidden.
    let choosing = await model(.checklist)
    let hiding = await model(.hunter)
    let hidden = hiding.connections.first?.id ?? ""
    _ = hiding.setWatched(id: hidden, creditTypes: ["verifications"])

    let namedStates: [Scene] = [
      ("watch-checklist-hunter", panel(choosing)),
      ("manage-hidden-balance", AnyView(ManageConnectionView(model: hiding, connectionID: hidden))),
      ("pools-two-hunter", panel(twoHunter)),
      ("connect-form-second-hunter", panel(secondHunter)),
      ("manage", AnyView(ManageConnectionView(model: twoHunter, connectionID: clientWork))),
      ("manage-rename-invalid", AnyView(ManageConnectionView(model: twoHunter, connectionID: clientWork, nameDraft: "hunter"))),
      ("manage-confirm-remove", AnyView(ManageConnectionView(model: twoHunter, connectionID: clientWork, confirmingRemove: true))),
      ("settings-erase-confirm", AnyView(EraseSettingsSection(model: twoHunter, confirming: true).padding(24).frame(width: 520))),
      ("settings-two-hunter", AnyView(SettingsView(model: twoHunter, showBalances: true))),
    ]

    var stackStates: [Scene] = []
    for count in [1, 8, 50] {
      let model = await SnapshotStacks.model(.stack(count: count))
      let panelView = panel(model, reference: reference)
      let windowView = window(model, StackWindowState(selection: firstBalance(model)))
      stackStates += [
        ("stack-\(count)", panelView), ("stack-\(count)-window", windowView),
        ("stack-\(count)-increased-contrast", panelView), ("stack-\(count)-window-increased-contrast", windowView),
      ]
      // The failing row's cue sits beside its name at the minimum width (QUO-262).
      if count > 1 { stackStates.append(("stack-\(count)-window-minimum", window(model, width: 760))) }
      if count == 50 {
        let search = StackWindowState()
        search.query = "hunter"
        let risk = StackWindowState()
        risk.filter = .atRisk
        stackStates += [("stack-50-window-hunter", window(model, search)), ("stack-50-window-at-risk", window(model, risk))]
      }
    }
    // QUO-440: every healthy tool listed; 12 and 30 scroll.
    for count in [7, 12, 30] {
      stackStates.append(("stack-\(count)-healthy", panel(await SnapshotStacks.model(.stack(count: count)), reference: reference)))
    }
    // QUO-269: long names (up to the 40-character limit) at the panel's 380 points and the window's 760.
    let longNames = await SnapshotStacks.model(.stack(count: 8))
    for (index, connection) in ConnectionPresentation.ranked(longNames.connections, failingIDs: longNames.shown.failingIDs).enumerated() {
      _ = longNames.rename(id: connection.id, to: "\(connection.name) Outbound Production \(index)")
    }
    // QUO-271: burning, flat-over-a-week and no-history inspectors.
    let historyModel = await SnapshotStacks.model(.historyStates)
    var historyStates: [Scene] = []
    for item in ConnectionPresentation.balances(historyModel.connections, failingIDs: historyModel.shown.failingIDs) {
      let name: String
      switch historyModel.assessment(for: item.id) {
      case .burning: name = "history-burning"
      case .noConsumption: name = "history-no-consumption"
      case .collecting: name = "history-collecting"
      }
      if !historyStates.contains(where: { $0.0 == name }) {
        historyStates.append((name, window(historyModel, StackWindowState(selection: item.id))))
      }
    }
    // QUO-444: the run-out time's evidence rules, one inspector each.
    let runOut = await SnapshotStacks.model(.runOutEvidence)
    for (connection, name) in zip(runOut.connections,
      ["run-out-collecting", "run-out-stale", "run-out-glitch", "run-out-small-dip"]) {
      historyStates.append((name, window(runOut, StackWindowState(selection: connection.poolRows.first?.key))))
    }
    // QUO-160: no alert is not the same as healthy.
    var quietTruthStates: [Scene] = []
    for alerting in [false, true] {
      let view = panel(await SnapshotStacks.model(.quietTruth(alerting: alerting)), reference: reference)
      let name = alerting ? "quiet-truth-attention" : "quiet-truth"
      quietTruthStates += [(name, view), ("\(name)-increased-contrast", view)]
    }
    // QUO-441: five full small plans read healthy; a typed Warn below at the cap gets a hint.
    let smallPlans = await SnapshotStacks.model(.smallPlans)
    let smallRow = smallPlans.connections.first?.poolRows.first
    quietTruthStates += [("small-plans", panel(smallPlans, reference: reference)), ("small-plans-window", window(smallPlans))]
    if let key = smallRow?.key {
      let state = StackWindowState(selection: key)
      state.drafts.drafts = BalanceDrafts([key: PoolSettingsDraft(monitored: true, low: "5000")])
      quietTruthStates.append(("warn-below-at-cap-window", window(smallPlans, state)))
    }
    // QUO-446: nothing monitored is not "All healthy".
    quietTruthStates.append(("quiet-nothing-monitored", panel(await SnapshotStacks.model(.nothingMonitored), reference: reference)))
    // QUO-351: a balance muted until it changes, dimmed with its marker.
    let muted = await SnapshotStacks.model(.muted)
    quietTruthStates += [("muted-balance", panel(muted, reference: reference)), ("muted-balance-window", window(muted))]
    // QUO-437: the muted balance selected: Unmute, its end, and what still shows.
    quietTruthStates.append(("muted-balance-inspector-window", window(muted, StackWindowState(
      selection: muted.connections.flatMap(\.poolRows).first { $0.muted }?.key
    ))))
    // QUO-449: checks stopped (gold bird); a failing connection's red balance
    // under its line, marked old; muted balances counted in the At risk tab.
    let stopped = await SnapshotStacks.model(.checksStopped)
    let behind = await SnapshotStacks.model(.failingBehindLines)
    let behindAtRisk = StackWindowState()
    behindAtRisk.filter = .atRisk
    quietTruthStates += [
      ("health-checks-stopped", panel(stopped, reference: reference)),
      ("failing-behind-lines", panel(behind, reference: reference)),
      ("failing-behind-lines-window-at-risk", window(behind, behindAtRisk)),
    ]
    // QUO-445: hidden rows show a cut row and a count; the tallest panel (first-run
    // questions, a login refusal, an update waiting) fits a 13-inch screen; an
    // untouched connect form closed with the panel opens on the balances again.
    let fitUpdaters = await Scenarios.checkedUpdaters(
      downloads: FileManager.default.temporaryDirectory.appendingPathComponent("QuotaCanarySnapshotFitUpdates")
    )
    var tallHooks = SystemHooks.preview(
      promptAnswered: false, loginRefuses: true, alertsPromptAnswered: false,
      notifier: FakeNotificationCenter(permission: .denied), updatePromptAnswered: false, updater: fitUpdaters.ready
    )
    tallHooks.clock = ManualClock(now: Scenarios.checkedAt)
    let tallest = AppModel(service: StackScenario.atRisk(10, healthy: 12, longNames: true).service(), system: tallHooks)
    await tallest.scheduler.settle()
    tallest.startAtLogin.answerPrompt(enable: true)
    await tallest.notifications.reload()
    let reopened = await SnapshotStacks.model(.atRisk(3, healthy: 2))
    reopened.beginAdding(on: .panel)
    reopened.panelClosed()
    quietTruthStates += [
      ("at-risk-11", panel(await SnapshotStacks.model(.atRisk(11, healthy: 3)), reference: reference)),
      ("at-risk-25", panel(await SnapshotStacks.model(.atRisk(25)), reference: reference)),
      ("at-risk-100-long", panel(await SnapshotStacks.model(.atRisk(100, longNames: true)), reference: reference)),
      ("at-risk-10-long-healthy-12", panel(await SnapshotStacks.model(.atRisk(10, healthy: 12, longNames: true)), reference: reference)),
      ("at-risk-tallest", panel(tallest, reference: reference)),
      ("connect-form-closed-reopened", panel(reopened, reference: reference)),
    ]
    // QUO-212, QUO-213: the website heroes and launch gallery.
    let showcase = await SnapshotStacks.model(.showcase)
    // QUO-51: the local --demo fixture.
    let demo = SnapshotStacks.demoModel(now: reference)
    await demo.scheduler.settle()
    // QUO-50: the launch gallery's Warn below frame. At risk filter, the low
    // Apollo pool selected so its editor sits beside the two rows.
    let warnState = StackWindowState(selection: showcase.connections.first { $0.provider == .apollo }?.poolRows.first?.key)
    warnState.filter = .atRisk
    let birdCountStates: [Scene] = [0, 1, 12].map { count in
      ("bird-count-\(count)", AnyView(BirdLabel(active: true, severity: count == 0 ? .none : .low, poolsAtRisk: count).padding(8)))
    } + [
      // QUO-50: the showcase stack's menu bar label (Hunter critical, Apollo low).
      ("bird-count-showcase", AnyView(BirdLabel(active: true, severity: .critical, poolsAtRisk: 2).padding(8))),
      // QUO-449: checks stopped, no balance at risk: gold.
      ("bird-checks-stopped", AnyView(BirdLabel(active: true, stopped: 1).padding(8))),
    ]
    // QUO-288: one picker scene per plated logo (a search shows one of them each).
    let platedPickerStates: [Scene] = ["ocean", "myemail", "tavily"].map { query in
      ("connect-form-picker-\(query)", panel(firstRun { $0.providerSearch = query }))
    }

    // QUO-405: the showcase stack's Apollo alert, exactly as handed to macOS.
    // The site lays it over showcase-window, whose Apollo row it matches.
    let siteNotificationStates: [Scene] = await SnapshotStacks.notifications(.showcase)
      .filter { $0.title == "Apollo" }.prefix(1).map {
        ("notification-site", AnyView(NotificationBanner(notification: $0)))
      }
    let states: [Scene] = [
      ("connect-form", panel(firstRun())),
      ("connect-form-hunter", panel(firstRun { $0.provider = .hunter })),
      // QUO-443: what a first launch opens, and the window a reopen (or a missing bird) shows.
      ("launch-first-run", panel(firstRun())),
      ("reopen-window-empty", window(await SnapshotStacks.model(.stack(count: 0)))),
      ("connected", panel(connected)),
      ("refresh-failed", panel(failing)),
      ("pools-mixed", panel(mixed)),
      ("pools-edge", panel(edge)),
      // QUO-398/399: the unmonitored row selected; since QUO-437 its inspector says
      // "Warnings are off" and the checkbox is the way back.
      ("pools-edge-window", window(edge, StackWindowState(selection: edge.connections
        .first { $0.provider == .openrouter }.map { PoolKey(connectionID: $0.id, creditType: "credits") }))),
      ("settings", AnyView(SettingsView(model: mixed))),
      ("settings-invalid", AnyView(SettingsView(model: mixed, drafts: invalidDrafts))),
      ("settings-invalid-hidden", AnyView(SettingsView(model: mixed, drafts: hiddenInvalid, query: "Hunter"))),
      ("settings-unsaved", AnyView(SettingsView(model: mixed, drafts: unsavedDrafts))),
      ("stack-unsaved-window", window(mixed, unsavedStack, dated: false)),
      ("diagnostics-saved", panel(connected)),
      // Two credential values, two fields (QUO-251).
      ("connect-form-apollo", panel(firstRun { $0.provider = .apollo })),
      ("connect-form-twilio", panel(firstRun { $0.provider = .twilio })),
      // The logo list (QUO-241): narrowed by a search, and with nothing left.
      ("connect-form-picker-filtered", panel(firstRun { $0.providerSearch = "serp" })),
      ("connect-form-picker-none", panel(firstRun { $0.providerSearch = "no such tool" })),
      // QUO-442: the pick is hidden by the search, so the key fields and Connect are off.
      ("connect-form-picker-pick-hidden", panel(firstRun { $0.provider = .openrouter; $0.providerSearch = "tavily" })),
      ("pools-tavily", panel(await model(.tavily))),
      ("pools-apollo", panel(apollo)),
      ("settings-apollo", AnyView(SettingsView(model: apollo, showBalances: true))),
      // QUO-437: the inspector's Connection settings opened.
      ("inspector-connection-settings-window", window(apollo, {
        let state = StackWindowState(selection: apollo.connections.first?.poolRows.first?.key)
        state.connectionSettingsExpanded = true
        return state
      }(), height: 1000)),
      ("balance-unavailable-window", window(apollo, StackWindowState(
        selection: apollo.connections.flatMap(\.poolRows).first { $0.status == .unavailable }?.key
      ), dated: false)),
    ] + namedStates + freshnessStates + monitoringStates + updateStates + stackStates + [
      ("stack-8-long-names", panel(longNames, reference: reference)),
      ("stack-8-long-names-window-minimum", window(longNames, width: 760)),
    ] + historyStates + quietTruthStates + [
      ("showcase", panel(showcase, reference: reference)),
      ("showcase-site", panel(await SnapshotStacks.model(.showcaseSite), reference: reference)),
      ("showcase-window", window(showcase, StackWindowState(selection: firstBalance(showcase)), height: 560)),
      ("showcase-window-warn", window(showcase, warnState, height: 560)),
      ("demo-window", window(demo, StackWindowState(selection: demo.connections.first?.poolRows.first?.key), height: 560)),
    ] + birdCountStates + platedPickerStates + siteNotificationStates + [
      // QUO-447: an unreadable connections file kept aside at launch.
      ("load-set-aside-first-run", panel(AppModel(service: await Scenarios.setAsideService(keepingOpenRouter: false)))),
      ("load-set-aside-connected", panel(AppModel(service: await Scenarios.setAsideService(keepingOpenRouter: true)), reference: reference)),
    ]
    // NSAppearance(named:) returns plain Aqua for the high-contrast names, so a
    // `-increased-contrast` scene is real only under the system switch (QUO-181).
    let realContrast = NSWorkspace.shared.accessibilityDisplayShouldIncreaseContrast
    if !realContrast {
      FileHandle.standardError.write(Data(
        "snapshot: NOT RUN: -increased-contrast scenes need System Settings > Accessibility > Display > Increase contrast\n".utf8
      ))
    }
    for (name, view) in states where realContrast || !name.contains("-increased-contrast") {
      for (scheme, appearance) in [("light", NSAppearance.Name.aqua), ("dark", .darkAqua)] {
        let file = url.appendingPathComponent("\(name)-\(scheme).png")
        // Preview seam: seeds the "saved" result line; see DiagnosticsExportModel.init.
        if name == "diagnostics-saved" { setenv("QUOTACANARY_DIAGNOSTICS_PREVIEW", "saved", 1) }
        defer { if name == "diagnostics-saved" { unsetenv("QUOTACANARY_DIAGNOSTICS_PREVIEW") } }
        guard let png = await render(
          view, appearance: appearance, windowChrome: name.contains("-window"), opaque: !name.hasPrefix("notification-")
        ) else {
          FileHandle.standardError.write(Data("snapshot: render failed for \(file.lastPathComponent)\n".utf8))
          return 1
        }
        do {
          try png.write(to: file)
        } catch {
          FileHandle.standardError.write(Data("snapshot: cannot write \(file.path)\n".utf8))
          return 1
        }
        print(file.path)
      }
    }
    return 0
  }

  private static func model(_ scenario: ScriptedScenario, system: SystemHooks? = nil) async -> AppModel {
    await SnapshotStacks.model(scenario, system: system)
  }

  /// The top-ranked local balance, the stack window's default selection.
  private static func firstBalance(_ model: AppModel) -> PoolKey? {
    ConnectionPresentation.balances(model.connections, failingIDs: model.shown.failingIDs).first?.id
  }

  private static func panel(_ model: AppModel, reference: Date? = nil) -> AnyView {
    reference.map { AnyView(PanelView(model: model).environment(\.referenceDate, $0)) } ?? AnyView(PanelView(model: model))
  }

  /// The stack window at its default 1000 by 680 points, or the size given.
  private static func window(
    _ model: AppModel, _ state: StackWindowState? = nil, width: CGFloat = 1000, height: CGFloat = 680, dated: Bool = true
  ) -> AnyView {
    let view = StackView(model: model, state: state ?? StackWindowState())
    guard dated else { return AnyView(view.frame(width: width, height: height)) }
    return AnyView(view.environment(\.referenceDate, reference).frame(width: width, height: height))
  }

  private static func render<V: View>(
    _ view: V, appearance: NSAppearance.Name, windowChrome: Bool = false, opaque: Bool = true
  ) async -> Data? {
    // The real panel gets its background from the menu bar window; offscreen
    // the view is transparent, so paint the same window color behind it. A
    // notification banner keeps its transparent corners and shadow.
    let backdrop = opaque ? Color(nsColor: .windowBackgroundColor) : .clear
    let controller = NSHostingController(rootView: view.background(backdrop))
    let host = controller.view
    host.appearance = NSAppearance(named: appearance)
    host.frame = NSRect(origin: .zero, size: host.fittingSize)

    let window = NSWindow(
      contentRect: host.frame,
      styleMask: windowChrome ? [.titled, .closable, .miniaturizable, .resizable] : [.borderless],
      backing: .buffered, defer: false
    )
    window.appearance = host.appearance
    window.backgroundColor = opaque ? .windowBackgroundColor : .clear
    window.isOpaque = opaque
    window.contentViewController = controller
    window.title = "QuotaCanary"
    // SwiftUI's native List and split-view columns settle on the next run loop.
    try? await Task.sleep(for: .milliseconds(150))
    host.layoutSubtreeIfNeeded()
    // The panel sizes its lists from rows it measured on the first pass (QUO-445).
    if !windowChrome, host.fittingSize != host.frame.size {
      window.setContentSize(host.fittingSize)
      try? await Task.sleep(for: .milliseconds(50))
      host.layoutSubtreeIfNeeded()
    }
    host.displayIfNeeded()
    let capture = windowChrome ? (host.superview ?? host) : host
    capture.layoutSubtreeIfNeeded()

    guard let rep = capture.bitmapImageRepForCachingDisplay(in: capture.bounds) else { return nil }
    capture.cacheDisplay(in: capture.bounds, to: rep)
    return rep.representation(using: .png, properties: [:])
  }

  // MARK: Freshness and start at login (QUO-132)

  private static func freshnessStates() async -> [Scene] {
    // A check in flight: the second OpenRouter request never answers.
    let checking = await model(.openRouterThen(.hang))
    checking.scheduler.request(.manual)
    // Manual Refresh in flight (QUO-268): the header says so at once.
    let refreshing = await model(.openRouterThen(.hang))
    Task { await refreshing.refresh() }
    await Task.yield()
    // Offline: the manual refresh is skipped, not counted as a failure.
    let offline = await model(.openRouter, system: .preview(online: false))
    await offline.refresh()
    // macOS refuses: visible in the row and in Settings, app keeps working.
    let refused = await model(.openRouter, system: .preview(promptAnswered: false, loginRefuses: true))
    refused.startAtLogin.answerPrompt(enable: true)
    return [
      ("health-checking", panel(checking)),
      ("refresh-checking", panel(refreshing)),
      ("health-offline", panel(offline)),
      // First-run question after the first successful connection.
      ("login-prompt", panel(await model(.openRouter, system: .preview(promptAnswered: false)))),
      ("login-prompt-refused", panel(refused)),
      ("settings-login-refused", AnyView(SettingsView(model: refused))),
    ]
  }

  // MARK: Notifications (QUO-131)

  /// Panel and Settings states for alerts, plus the menu bar bird in each
  /// severity at 4x (its own PNGs, since the label lives in the menu bar).
  private static func alertStates(birdsInto dir: URL) async -> [Scene] {
    for (name, active, severity) in [
      ("unconfigured", false, AlertSeverity.none),
      ("healthy", true, AlertSeverity.none), ("low", true, .low), ("critical", true, .critical), ("empty", true, .empty),
    ] {
      let image = BirdLabel.image(active: active, severity: severity)
      guard image.isTemplate == (severity == .none) else {
        FileHandle.standardError.write(Data("snapshot: incorrect template rendering for \(name) bird\n".utf8))
        exit(1)
      }
      for (scheme, background) in [("light", NSColor(white: 0.93, alpha: 1)), ("dark", NSColor(white: 0.16, alpha: 1))] {
        let file = dir.appendingPathComponent("bird-\(name)-\(scheme).png")
        // Raw NSImage drawing does not apply a template's native appearance tint.
        // Render through SwiftUI, like the actual menu bar label, for these scenes.
        let png = image.isTemplate
          ? await render(
            Image(nsImage: image).resizable().scaledToFit()
              .frame(width: image.size.width * 4, height: image.size.height * 4).padding(12),
            appearance: scheme == "light" ? .aqua : .darkAqua
          )
          : renderBird(image, background: background)
        guard let png, (try? png.write(to: file)) != nil else {
          FileHandle.standardError.write(Data("snapshot: cannot write \(file.path)\n".utf8))
          exit(1)
        }
        print(file.path)
      }
    }

    // First successful connection: the alerts question comes first.
    let prompt = await model(.openRouter, system: .preview(
      promptAnswered: false, alertsPromptAnswered: false, notifier: FakeNotificationCenter()
    ))
    await prompt.alerts.settle()
    // Hunter verifications at 60 of 1,000 (critical at 66): the bird's
    // critical shape, one notification handed to the fake center.
    let critical = await model(.hunter)
    await critical.alerts.settle()
    // Same, but macOS notifications are off: the panel says so.
    let denied = await model(.hunter, system: .preview(notifier: FakeNotificationCenter(permission: .denied)))
    await denied.alerts.settle()
    await denied.notifications.reload()
    // macOS refuses the test notification.
    let failingCenter = FakeNotificationCenter(permission: .allowed)
    failingCenter.failDeliveries = true
    let testFailed = await model(.openRouter, system: .preview(notifier: failingCenter))
    await testFailed.notifications.reload()
    await testFailed.sendTestNotification()
    return [
      ("alerts-prompt", panel(prompt)),
      ("pools-critical", panel(critical)),
      ("pools-critical-denied", panel(denied)),
      // QUO-437: the inspector's notifications-off note under its warnings.
      ("pools-critical-denied-window", window(denied, StackWindowState(
        selection: denied.connections.flatMap(\.poolRows).first { $0.alerts }?.key
      ))),
      ("settings-alerts-denied", AnyView(SettingsView(model: denied))),
      ("settings-alerts-test-failed", AnyView(SettingsView(model: testFailed))),
    ]
  }

  // MARK: Monitoring health (QUO-133)

  /// Three failed checks in a row, a rejected key, a rate limit, and three
  /// failures with notifications off. Returns nil (failing the run) if the
  /// failure notification does not reach the notification center, so the
  /// app's wiring is exercised, not just the view.
  private static func monitoringStates() async -> [Scene]? {
    func failing(_ step: Scenarios.Step, checks: Int, center: FakeNotificationCenter) async -> AppModel {
      let failing = await model(.openRouterThen(step), system: .preview(notifier: center))
      for _ in 0..<checks { await failing.refresh() }
      await failing.alerts.settle()
      return failing
    }
    let centers = (0..<3).map { _ in FakeNotificationCenter(permission: .allowed) }
    let threeFailed = await failing(.fail, checks: 3, center: centers[0])
    let rejected = await failing(.respond(status: 401, body: "{}"), checks: 2, center: centers[1])
    let rateLimited = await failing(.respond(status: 429, body: ""), checks: 1, center: centers[2])
    let denied = await failing(.respond(status: 503, body: ""), checks: 3, center: FakeNotificationCenter(permission: .denied))

    let wiring: [(String, Bool)] = [
      ("third failure notifies once", centers[0].delivered.map(\.id).filter { $0.hasSuffix(".failures") }.count == 1),
      ("rejected key notifies once", centers[1].delivered.map(\.id).filter { $0.hasSuffix(".credentials") }.count == 1),
      ("rate limit alone is quiet", !centers[2].delivered.contains { $0.id.hasPrefix("quotacanary.monitor.") }),
      ("denied shows in the panel", denied.alerts.problem == .notSubmitted(.denied)),
    ]
    for (name, passed) in wiring where !passed {
      FileHandle.standardError.write(Data("snapshot: monitoring check failed: \(name)\n".utf8))
      return nil
    }
    // QUO-446: a rejected key, then a five-second network blip: still failing.
    let blip = await failing(.respond(status: 401, body: "{}"), checks: 2, center: FakeNotificationCenter(permission: .allowed))
    blip.scheduler.handle(.reachabilityChanged(online: false))
    blip.scheduler.handle(.reachabilityChanged(online: true))
    await blip.scheduler.settle()
    return [
      // QUO-446: every connection failing, so the header names the last good check.
      ("health-three-failures", panel(threeFailed)),
      ("health-key-rejected-after-blip", panel(blip)),
      ("health-key-rejected", panel(rejected)),
      // QUO-437: "Replace key…" beside the inspector's error.
      ("health-key-rejected-window", window(rejected)),
      ("health-rate-limited", panel(rateLimited)),
      ("health-three-failures-denied", panel(denied)),
    ]
  }

  // MARK: Updates (QUO-139)

  /// A verified update waiting (Settings and the panel line), a feed signed by
  /// the wrong key, and the first-run question.
  private static func updateStates() async -> [Scene] {
    let updaters = await Scenarios.checkedUpdaters(
      downloads: FileManager.default.temporaryDirectory.appendingPathComponent("QuotaCanarySnapshotUpdates")
    )
    let ready = await model(.openRouter, system: .preview(updater: updaters.ready))
    let bad = await model(.openRouter, system: .preview(updater: updaters.badSignature))
    return [
      ("settings-update-available", AnyView(SettingsView(model: ready))),
      ("settings-update-bad-signature", AnyView(SettingsView(model: bad))),
      ("panel-update-ready", panel(ready)),
      ("update-prompt", panel(await model(.openRouter, system: .preview(updatePromptAnswered: false)))),
    ]
  }

  private static func renderBird(_ image: NSImage, background: NSColor) -> Data? {
    let scale: CGFloat = 4
    let pad: CGFloat = 3
    let width = Int((image.size.width + pad * 2) * scale)
    let height = Int((image.size.height + pad * 2) * scale)
    guard let rep = NSBitmapImageRep(
      bitmapDataPlanes: nil, pixelsWide: width, pixelsHigh: height, bitsPerSample: 8,
      samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
      bytesPerRow: 0, bitsPerPixel: 0
    ) else { return nil }
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    background.setFill()
    NSRect(x: 0, y: 0, width: width, height: height).fill()
    image.draw(in: NSRect(
      x: pad * scale, y: pad * scale, width: image.size.width * scale, height: image.size.height * scale
    ))
    NSGraphicsContext.restoreGraphicsState()
    return rep.representation(using: .png, properties: [:])
  }
}

/// QUO-405: a delivered alert drawn as a macOS notification banner, for the
/// website. The title and body are the `AlertNotification` the app handed to
/// the notification center; only the banner around them is drawn here, since
/// an offscreen render cannot capture Notification Center itself.
private struct NotificationBanner: View {
  let notification: AlertNotification
  @Environment(\.colorScheme) private var scheme

  /// The bundle's icon; this view only runs from a checkout (`--snapshot`).
  private static let icon = NSImage(contentsOf: URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent().appendingPathComponent("../../Resources/AppIcon.icns").standardized)
    ?? NSApplication.shared.applicationIconImage!

  var body: some View {
    HStack(alignment: .center, spacing: 10) {
      Image(nsImage: Self.icon).resizable().frame(width: 36, height: 36)
      VStack(alignment: .leading, spacing: 1) {
        HStack(alignment: .firstTextBaseline) {
          Text(notification.title).font(.system(size: 13, weight: .semibold))
          Spacer(minLength: 8)
          Text("now").font(.system(size: 12)).foregroundStyle(.secondary)
        }
        Text(notification.body).font(.system(size: 13)).lineLimit(2)
      }
    }
    .padding(.horizontal, 14).padding(.vertical, 12)
    .frame(width: 356)
    .background(
      RoundedRectangle(cornerRadius: 22, style: .continuous)
        .fill(scheme == .dark ? Color(white: 0.2) : Color(white: 0.975))
        .shadow(color: .black.opacity(0.18), radius: 14, y: 6)
    )
    .overlay(
      RoundedRectangle(cornerRadius: 22, style: .continuous)
        .strokeBorder(.black.opacity(scheme == .dark ? 0.4 : 0.06), lineWidth: 0.5)
    )
    .padding(20)
  }
}
