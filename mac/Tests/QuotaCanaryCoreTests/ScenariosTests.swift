import Foundation
@testable import QuotaCanaryCore
import Testing

// QUO-313: every named scenario the snapshots, `--demo`, `--design-preview`
// and synthetic mode build from, checked as values on the presented list. The
// PNG render of the same scenario then checks layout only.

/// "name creditType status", in the stack window's order.
private func listed(_ shown: BalancesAsShown) -> [String] {
  shown.stackItems().map { "\($0.name) \($0.row.key.creditType) \($0.row.status.rawValue)" }
}

/// Row count by status, failing connections, and the top row.
private func summary(_ shown: BalancesAsShown) -> String {
  let items = shown.stackItems()
  let counts = Dictionary(grouping: items, by: \.row.status.rawValue).map { "\($0.value.count) \($0.key)" }.sorted()
  return "\(items.count) rows: \(counts.joined(separator: ", ")); \(shown.failingIDs.count) failing; top \(listed(shown).first ?? "-")"
}

/// The launch check, straight on the service: every connection refreshed once.
@MainActor
private func launched(_ stack: StackScenario) async throws -> (MonitoringService, BalancesAsShown) {
  let service = stack.service()
  try service.restore()
  var errors: [String: String] = [:]
  for connection in service.connections {
    do { _ = try await service.refresh(id: connection.id) } catch { errors[connection.id] = "\(error)" }
  }
  return (service, BalancesAsShown(local: service.connections, errors: errors))
}

@Suite @MainActor struct ScenariosTests {
  static let scripted: [String: [String]] = [
    "openRouter": ["OpenRouter credits low"],
    "hunter": ["Hunter verifications critical", "Hunter searches unavailable"],
    "mixed": ["Hunter verifications critical", "OpenRouter credits low", "Hunter searches unavailable"],
    "hunterThenOpenRouter": ["Hunter verifications critical", "OpenRouter credits low", "Hunter searches unavailable"],
    "edge": ["Hunter searches empty", "OpenRouter credits low", "Hunter verifications unknown"],
    "tavily": ["Tavily plan low", "Tavily key healthy", "Tavily paygo unavailable", "Prospeo credits healthy"],
    "apollo": ["Apollo direct_dial_credit low", "Apollo ai_credit unavailable", "Apollo export_credit healthy", "Apollo lead_credit healthy"],
    "twoHunter": [
      "Client work searches critical", "Hunter verifications critical", "Client work verifications low", "Hunter searches unavailable",
    ],
    "checklist": ["Hunter verifications critical", "Hunter searches unavailable"],
  ]
  static let stacks: [String: String] = [
    "stack-1": "1 rows: 1 healthy; 0 failing; top Acorn OpenRouter 1 credits healthy",
    "stack-8": "15 rows: 1 critical, 12 healthy, 2 low; 1 failing; top Fern OpenRouter 1 credits critical",
    "stack-50": "100 rows: 2 critical, 3 low, 95 healthy; 0 failing; top Dune Apollo 5 lead_credit critical",
    "historyStates": "5 rows: 5 healthy; 0 failing; top Hunter searches healthy",
    "showcase": "10 rows: 1 critical, 1 low, 8 healthy; 0 failing; top Hunter searches critical",
    "showcaseSite": "6 rows: 1 critical, 2 low, 3 healthy; 0 failing; top Apollo lead_credit critical",
    "quietTruth": "10 rows: 1 empty, 1 low, 1 unavailable, 1 unknown, 6 healthy; 0 failing; top Acorn Hunter searches healthy",
    "quietTruthAlerting": "12 rows: 1 empty, 1 unavailable, 1 unknown, 2 low, 7 healthy; 0 failing; top Fern Hunter verifications low",
  ]

  @Test(arguments: ScriptedScenario.named.map(\.0))
  func scriptedScenarioPresentsItsRecordedList(name: String) async throws {
    let scenario = try #require(ScriptedScenario.named.first { $0.0 == name }?.1)
    let service = try await scenario.connected()
    let shown = BalancesAsShown(local: service.connections)
    #expect(!listed(shown).isEmpty)
    #expect(listed(shown) == Self.scripted[name], "\(name): \(listed(shown))")
  }

  @Test(arguments: ["stack-1", "stack-8", "stack-50", "historyStates", "showcase", "showcaseSite", "quietTruth", "quietTruthAlerting"])
  func stackScenarioPresentsItsRecordedList(name: String) async throws {
    let stack: StackScenario = switch name {
    case "stack-1": .stack(count: 1)
    case "stack-8": .stack(count: 8)
    case "stack-50": .stack(count: 50)
    case "historyStates": .historyStates
    case "showcase": .showcase
    case "showcaseSite": .showcaseSite
    case "quietTruth": .quietTruth(alerting: false)
    default: .quietTruth(alerting: true)
    }
    let (_, shown) = try await launched(stack)
    #expect(!shown.stackItems().isEmpty)
    #expect(summary(shown) == Self.stacks[name], "\(name): \(summary(shown))")
  }

  // MARK: What each snapshot scene relies on

  @Test func stacksHoldWhatTheirScenesShow() async throws {
    let (eight, eightShown) = try await launched(.stack(count: 8))
    let rows = eight.connections.flatMap(\.poolRows)
    #expect(rows.filter { $0.status == .low && $0.settings.monitored }.count == 2)
    #expect(rows.filter { $0.status == .critical && $0.settings.monitored }.count == 1)
    #expect(eightShown.failingIDs == ["stack-8-6"])
    #expect(rows.contains { !$0.settings.monitored })
    let (fifty, _) = try await launched(.stack(count: 50))
    #expect(fifty.connections.count == 50)
    #expect(StackScenario.fixtureProviders.allSatisfy { provider in fifty.connections.filter { $0.provider == provider }.count >= 2 })
    // QUO-160: healthy, unknown, low and empty with monitoring off, not in plan; only Fern alerts.
    for alerting in [false, true] {
      let (service, _) = try await launched(.quietTruth(alerting: alerting))
      let verifications = service.connections.flatMap(\.poolRows).filter { $0.key.creditType == "verifications" }
      #expect(Array(verifications.map(\.status).prefix(5)) == [.healthy, .unknown, .low, .empty, .unavailable])
      #expect(service.connections.flatMap(\.poolRows).filter(\.alerts).count == (alerting ? 1 : 0))
    }
    // QUO-271: one inspector per history state.
    let (history, _) = try await launched(.historyStates)
    let assessments = history.connections.compactMap(\.poolRows.first).map { BurnRate.assess(history.history(for: $0.key)) }
    #expect(assessments.map { if case .burning = $0 { "burning" } else if case .noConsumption = $0 { "flat" } else { "collecting" } }
      == ["burning", "flat", "collecting"])
  }

  /// What the manage window's controls call (QUO-129), on the two-Hunter scenario.
  @Test func twoHunterRenamesReplacesTheKeyAndRemoves() async throws {
    let service = try await ScriptedScenario.twoHunter.connected()
    let clientWork = try #require(service.connections.last)
    #expect(ConnectionNames.validate(" HUNTER ", provider: .hunter, among: service.connections, excluding: clientWork.id) != nil)
    _ = try service.rename(id: clientWork.id, to: "Client work 2")
    _ = try await service.replaceKey(id: clientWork.id, key: "synthetic-key-2")
    try service.remove(id: clientWork.id)
    #expect(service.connections.map(\.name) == ["Hunter"])
  }

  @Test func demoKeepsAllFiveConnectionsLocal() async throws {
    let saved = Scenarios.checkedAt
    defer { Scenarios.checkedAt = saved }
    let (service, shown) = try await launched(StackScenario.demo(now: saved))
    #expect(service.connections.count == 5)
    #expect(shown.local.count == 5)
    #expect(shown.poolsAtRisk > 0)
    #expect(shown.notificationTargets.count == service.connections.flatMap(\.poolRows).count)
  }

  /// QUO-139: the real check against a fake feed, with a throwaway key.
  @Test func updatersTrustOnlyTheirOwnKey() async throws {
    let downloads = FileManager.default.temporaryDirectory.appendingPathComponent("QuotaCanaryScenarioUpdates-\(UUID())")
    defer { try? FileManager.default.removeItem(at: downloads) }
    let updaters = await Scenarios.checkedUpdaters(downloads: downloads)
    #expect(updaters.ready.status == .ready(version: "0.2.0"))
    #expect(updaters.badSignature.status == .failed(.badSignature) && updaters.badSignature.ready == nil)
  }
}
