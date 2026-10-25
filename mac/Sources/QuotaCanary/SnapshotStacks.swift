import Foundation
import QuotaCanaryCore

/// The app over the Core fixture scenarios (QUO-313): snapshots, `--demo`,
/// `--design-preview` and the window checks. Frozen clock, in-memory stores,
/// scripted transports; nothing contacts a provider.
@MainActor
enum SnapshotStacks {
  /// A stack scenario, launch check settled.
  static func model(_ stack: StackScenario) async -> AppModel {
    let model = unsettled(stack)
    await model.scheduler.settle()
    return model
  }

  /// Also powers `--design-preview` and the native window checks, including an empty stack.
  static func model(count: Int) -> AppModel { unsettled(.stack(count: count)) }

  /// QUO-51: the recordable demo over `StackScenario.demo`.
  static func demoModel(now: Date = Date()) -> AppModel {
    let demo = StackScenario.demo(now: now)
    return unsettled(demo)
  }

  private static func unsettled(_ stack: StackScenario) -> AppModel {
    let service = stack.service()
    var hooks = SystemHooks.preview()
    hooks.clock = ManualClock(now: Scenarios.checkedAt)
    return AppModel(service: service, system: hooks)
  }

  /// A scripted scenario run through the connect form, as a user would.
  static func model(_ scenario: ScriptedScenario, system: SystemHooks? = nil) async -> AppModel {
    let model = AppModel(service: scenario.service(), system: system)
    for connect in scenario.connects {
      if let name = connect.name { model.nameInput = name }
      await self.connect(model, connect.provider, keepChoice: connect.keepsChoice)
    }
    return model
  }

  /// Connects, then takes the balance checklist's defaults (QUO-283) unless
  /// the state being drawn is the checklist itself.
  static func connect(_ model: AppModel, _ provider: ProviderID, keepChoice: Bool = false) async {
    model.provider = provider
    model.keyInput = ScriptedScenario.key
    await model.connect()
    if !keepChoice, let id = model.watchChoiceID, let fresh = model.connections.first(where: { $0.id == id }) {
      _ = model.finishWatchChoice(creditTypes: fresh.poolRows.map(\.key.creditType))
    }
  }
}
