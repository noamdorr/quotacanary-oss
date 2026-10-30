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
    // QUO-160: no alert is not the same as healthy.
    var quietTruthStates: [Scene] = []
    for alerting in [false, true] {
      let view = panel(await SnapshotStacks.model(.quietTruth(alerting: alerting)), reference: reference)
      let name = alerting ? "quiet-truth-attention" : "quiet-truth"
      quietTruthStates += [(name, view), ("\(name)-increased-contrast", view)]
    }
    // QUO-351: a balance muted until it changes, dimmed with its marker.
    let muted = await SnapshotStacks.model(.muted)
    quietTruthStates += [("muted-balance", panel(muted, reference: reference)), ("muted-balance-window", window(muted))]
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
    ]
    // QUO-288: one picker scene per plated logo (a search shows one of them each).
    let platedPickerStates: [Scene] = ["ocean", "myemail", "tavily"].map { query in
      ("connect-form-picker-\(query)", panel(firstRun { $0.providerSearch = query }))
    }

    let states: [Scene] = [
      ("connect-form", panel(firstRun())),
      ("connect-form-hunter", panel(firstRun { $0.provider = .hunter })),
      ("connected", panel(connected)),
      ("refresh-failed", panel(failing)),
      ("pools-mixed", panel(mixed)),
      ("pools-edge", panel(edge)),
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
      ("pools-tavily", panel(await model(.tavily))),
      ("pools-apollo", panel(apollo)),
      ("settings-apollo", AnyView(SettingsView(model: apollo, showBalances: true))),
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
    ] + birdCountStates + platedPickerStates
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
        guard let png = await render(view, appearance: appearance, windowChrome: name.contains("-window")) else {
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

  private static func render<V: View>(_ view: V, appearance: NSAppearance.Name, windowChrome: Bool = false) async -> Data? {
    // The real panel gets its background from the menu bar window; offscreen
    // the view is transparent, so paint the same window color behind it.
    let controller = NSHostingController(rootView: view.background(Color(nsColor: .windowBackgroundColor)))
    let host = controller.view
    host.appearance = NSAppearance(named: appearance)
    host.frame = NSRect(origin: .zero, size: host.fittingSize)

    let window = NSWindow(
      contentRect: host.frame,
      styleMask: windowChrome ? [.titled, .closable, .miniaturizable, .resizable] : [.borderless],
      backing: .buffered, defer: false
    )
    window.appearance = host.appearance
    window.backgroundColor = .windowBackgroundColor
    window.contentViewController = controller
    window.title = "QuotaCanary"
    // SwiftUI's native List and split-view columns settle on the next run loop.
    try? await Task.sleep(for: .milliseconds(150))
    host.layoutSubtreeIfNeeded()
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
    // Hunter verifications at 480 of 1,000 (critical at 500): the bird's
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
    return [
      ("health-three-failures", panel(threeFailed)),
      ("health-key-rejected", panel(rejected)),
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
