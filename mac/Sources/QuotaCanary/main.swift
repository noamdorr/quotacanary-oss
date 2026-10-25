import AppKit
import Foundation
import QuotaCanaryCore
import SwiftUI

@MainActor
struct QuotaCanaryApp: App {
  @StateObject private var model: AppModel

  init() {
    let settingsPreview = CommandLine.arguments.contains("--settings-preview")
    let preview = settingsPreview || CommandLine.arguments.contains("--design-preview")
    // QUO-51: the recordable demo over in-memory fixtures, never personal stores.
    let demo = CommandLine.arguments.contains("--demo")
    let count = CommandLine.arguments.compactMap(Int.init).first ?? 50
    let model = demo ? SnapshotStacks.demoModel() : preview ? SnapshotStacks.model(count: count) : AppModel.fromEnvironment()
    _model = StateObject(wrappedValue: model)
    if demo {
      NSApplication.shared.setActivationPolicy(.accessory)
      Task { @MainActor in
        await model.scheduler.settle()

      }
    } else if preview {
      NSApplication.shared.setActivationPolicy(.regular)
      NSApp.appearance = SettingsPreview.appearance(arguments: CommandLine.arguments)
      Task { @MainActor in
        await model.scheduler.settle()
        if settingsPreview {
          SettingsWindow.show(model: model)
        } else {
          StackWindow.show(model: model)
        }
      }
    }
  }

  var body: some Scene {
    MenuBarExtra {
      PanelView(model: model)
    } label: {
      BirdLabel(active: model.hasAnyConnection, severity: model.shown.severity, poolsAtRisk: model.shown.poolsAtRisk)
    }
    .menuBarExtraStyle(.window)
    .commands {
      CommandGroup(replacing: .appSettings) {
        Button(Copy.settingsButton) { SettingsWindow.show(model: model) }
          .keyboardShortcut(",")
      }
    }
  }
}

let arguments = CommandLine.arguments

if arguments.contains("--check-provider-logos") {
  let missing = ProviderLogo.bundled.filter { ProviderLogo.images[$0] == nil }
  print(missing.isEmpty ? "Provider logos: all \(ProviderLogo.bundled.count) decoded" : "Missing provider logos: \(missing.map(\.rawValue))")
  exit(missing.isEmpty ? 0 : 1)
} else if arguments.count >= 3, arguments[1] == "--read", arguments[2] == "openrouter" {
  Task.detached { exit(await Headless.readOpenRouter()) }
  dispatchMain()
} else if arguments.contains("--login-item-status") {
  exit(SMAppLoginItem.printStatus())
} else if arguments.contains("--notify-test") {
  let app = NSApplication.shared
  app.setActivationPolicy(.accessory)
  Task { @MainActor in exit(await NotifyTest.run()) }
  app.run()
} else if arguments.contains("--check-updates") || arguments.contains("--install-update") {
  let install = arguments.contains("--install-update")
  Task { @MainActor in exit(await UpdateHeadless.run(install: install)) }
  dispatchMain()
} else if arguments.contains("--erase-local-data") {
  exit(MainActor.assumeIsolated { Headless.eraseLocalData() })
} else if arguments.contains("--keychain-selftest") {
  exit(Headless.keychainSelfTest())
} else if arguments.count >= 3, arguments[1] == "--export-diagnostics" {
  exit(Headless.exportDiagnostics(to: arguments[2]))
} else if arguments.contains("--check-settings-window") || arguments.contains("--check-stack-window") {
  let app = NSApplication.shared
  app.setActivationPolicy(.regular)
  Task { @MainActor in await SettingsPreview.run(arguments: arguments) }
  app.run()
} else if arguments.contains("--check-interactions") {
  let app = NSApplication.shared
  app.setActivationPolicy(.regular)
  Task { @MainActor in await InteractionSmoke.run(arguments: arguments) }
  app.run()
} else if arguments.count >= 3, arguments[1] == "--snapshot" {
  let dir = arguments[2]
  let app = NSApplication.shared
  app.setActivationPolicy(.prohibited)
  Task { @MainActor in exit(await Snapshot.run(into: dir)) }
  app.run()
} else {
  QuotaCanaryApp.main()
}
