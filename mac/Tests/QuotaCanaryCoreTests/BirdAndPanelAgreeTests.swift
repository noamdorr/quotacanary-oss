import Foundation
@testable import QuotaCanaryCore
import Testing

// QUO-449: one rule for "needs attention". The bird's colour, its VoiceOver
// count, the panel's rows and the window's At risk tab come from the same
// balances, so a user can reconcile them by reading the screen.

private let now = Date(timeIntervalSince1970: 1_790_337_600)

private func conn(
  _ id: String, _ provider: ProviderID = .prospeo, pools: [(String, Double)],
  mutes: [String: Mute] = [:], failures: Int = 0, age: TimeInterval = 0
) -> Connection {
  Connection(
    id: id, provider: provider, name: id, credentialRef: id,
    lastReading: Reading(
      balances: pools.map { PoolBalance(pool: Pool(creditType: $0.0, label: $0.0, unit: .credits, cap: 10_000), balance: $0.1) },
      checkedAt: now.addingTimeInterval(-age)
    ),
    monitoring: MonitoringState(consecutiveFailures: failures),
    mutes: mutes
  )
}

/// Rows listed on their own panel line.
private func listedRows(_ lines: [BalancesAsShown.PanelLine]) -> [PoolRow] {
  lines.compactMap { if case let .local(_, row, _) = $0 { return row }; return nil }
}

private func failureIDs(_ lines: [BalancesAsShown.PanelLine]) -> [String] {
  lines.compactMap { if case let .localFailure(failure) = $0 { return failure.connection.id }; return nil }
}

/// The surfaces agree (the issue's acceptance criteria), for any shown state.
private func expectSurfacesAgree(_ shown: BalancesAsShown, _ name: String) {
  let panel = shown.panel
  let lines = panel.attention + panel.quiet
  let listed = listedRows(lines)
  // A bird that is not plain is explained by a listed row or a stopped-checks line.
  if shown.severity != .none {
    #expect(listed.contains { $0.alerts && AlertSeverity(status: $0.status) == shown.severity }, "\(name): bird \(shown.severity), no such row")
  }
  #expect(shown.stoppedIDs.isSubset(of: Set(failureIDs(panel.attention))), "\(name): stopped checks without a line")
  // A failure line past the threshold never sits beside a plain bird.
  for id in failureIDs(panel.attention) {
    let connection = shown.local.first { $0.id == id }!
    if connection.monitoring.consecutiveFailures >= MonitoringDecider.failureThreshold {
      #expect(shown.birdSeverity != .none, "\(name): \(id) stopped and the bird is plain")
    }
  }
  // Every balance the bird counts is on screen: its own line, or (a muted-only
  // quiet connection) the warning row its collapsed line shows.
  let attentionIDs = Set(listedRows(panel.attention).map(\.key.connectionID) + failureIDs(panel.attention))
  for connection in shown.local {
    let warns = connection.poolRows.filter(\.warns)
    if attentionIDs.contains(connection.id) {
      #expect(Set(warns.map(\.key)).isSubset(of: Set(listed.map(\.key))), "\(name): \(connection.id) hides a balance the bird counts")
    } else if !warns.isEmpty {
      #expect(listed.contains { $0.key.connectionID == connection.id && $0.warns }, "\(name): \(connection.id) quiet line hides its warning")
    }
  }
  // The bird's count and the window's At risk tab are the same balances.
  let tab = shown.stackItems(filter: .atRisk)
  #expect(tab.count == shown.poolsAtRisk, "\(name): tab \(tab.count), bird \(shown.poolsAtRisk)")
  #expect(tab.filter(\.row.muted).count == shown.mutedAtRisk, "\(name): muted in tab vs bird")
}

@MainActor
private func launched(_ stack: StackScenario) async throws -> BalancesAsShown {
  let service = stack.service()
  try service.restore()
  let monitor = ConnectionMonitor(service: service)
  let scheduler = PollScheduler(
    service: service, monitor: monitor, clock: ManualClock(now: Scenarios.checkedAt),
    lifecycle: ManualLifecycle(), reachability: ScriptedReachability()
  )
  scheduler.start()
  await scheduler.settle()
  return BalancesAsShown(local: service.connections, health: monitor.health, errors: monitor.messages, lastErrors: monitor.errors)
}

@Suite @MainActor struct BirdAndPanelAgreeTests {
  nonisolated static let fixtures: [String: StackScenario] = [
    "stack-1": .stack(count: 1), "stack-8": .stack(count: 8), "stack-50": .stack(count: 50),
    "historyStates": .historyStates, "showcase": .showcase, "showcaseSite": .showcaseSite,
    "quietTruth": .quietTruth(alerting: false), "quietTruthAlerting": .quietTruth(alerting: true),
    "muted": .muted, "nothingMonitored": .nothingMonitored,
    "checksStopped": .checksStopped, "failingBehindLines": .failingBehindLines,
  ]

  /// Every scenario fixture: bird, VoiceOver count, panel and At risk tab agree.
  @Test(arguments: fixtures.keys.sorted())
  func everyFixtureAgrees(name: String) async throws {
    expectSurfacesAgree(try await launched(Self.fixtures[name]!), name)
  }

  /// Every check failing for a week: the bird is gold, not its calm self, and says checks stopped.
  @Test func birdIsGoldWhileChecksHaveStopped() {
    let a = conn("a", pools: [("credits", 4000)], failures: 600, age: 7 * 86_400)
    let shown = BalancesAsShown(local: [a], health: ["a": .failed(lastSuccess: a.lastReading!.checkedAt, attempted: true)])
    #expect(!shown.panel.attention.isEmpty)
    #expect(shown.stoppedIDs == ["a"])
    #expect(shown.severity == .none)
    #expect(shown.birdSeverity == .low)
    #expect(shown.birdAccessibility == Copy.birdAccessibility + ", " + Copy.birdChecksStopped(1))
    expectSurfacesAgree(shown, "a week of failures")
  }

  /// A rejected key stops checks at once; worst wins, so a red balance stays red.
  @Test func rejectedKeyStopsChecksAndRedStaysRed() {
    let a = conn("a", pools: [("credits", 0)], failures: 1)
    let shown = BalancesAsShown(
      local: [a], health: ["a": .failed(lastSuccess: now, attempted: true)],
      errors: ["a": "Prospeo rejected the key"], lastErrors: ["a": .provider(.prospeo, .keyRejected)]
    )
    #expect(shown.stoppedIDs == ["a"])
    #expect(shown.birdSeverity == .empty)
    expectSurfacesAgree(shown, "rejected key")
  }

  /// Two failures in a row with a non-key error: not stopped yet, bird plain.
  @Test func belowTheThresholdChecksHaveNotStopped() {
    let a = conn("a", pools: [("credits", 4000)], failures: MonitoringDecider.failureThreshold - 1)
    let shown = BalancesAsShown(
      local: [a], health: ["a": .failed(lastSuccess: now, attempted: true)], lastErrors: ["a": .provider(.prospeo, .rateLimited)]
    )
    #expect(shown.stoppedIDs.isEmpty)
    #expect(shown.birdSeverity == .none)
  }

  /// One rate-limited check on an empty balance: the failure line stays and
  /// the red balance is listed under it, so the red bird is explained.
  @Test func failingConnectionListsItsAtRiskBalancesUnderItsLine() {
    let failing = conn("failing", pools: [("credits", 0), ("bonus", 4000)], failures: 1, age: 900)
    let sibling = conn("sibling", .hunter, pools: [("searches", 1000), ("verifications", 0)],
                       mutes: ["verifications": Mute(until: nil, balance: 0, severity: .empty)])
    let shown = BalancesAsShown(
      local: [failing, sibling], health: ["failing": .failed(lastSuccess: now.addingTimeInterval(-900), attempted: true)],
      lastErrors: ["failing": .provider(.prospeo, .rateLimited)]
    )
    let attention = shown.panel.attention.map(\.id)
    #expect(attention.prefix(2) == ["local-failure:failing", "local:failing|credits"])
    #expect(!attention.contains("local:failing|bonus"))
    #expect(shown.severity == .empty)
    expectSurfacesAgree(shown, "rate-limited empty")
  }

  /// Muted balances count in VoiceOver and the At risk tab, labelled, and
  /// leave the bird's colour to the balances that are not muted (QUO-465).
  @Test func mutedBalancesAreCountedAndLabelled() {
    let mutedEmpty = Mute(until: nil, balance: 0, severity: .empty)
    let a = conn("a", .hunter, pools: [("searches", 100), ("verifications", 0)], mutes: ["verifications": mutedEmpty])
    let b = conn("b", .hunter, pools: [("searches", 250), ("verifications", 0)], mutes: ["verifications": mutedEmpty])
    let shown = BalancesAsShown(local: [a, b])
    #expect(shown.poolsAtRisk == 4)
    #expect(shown.mutedAtRisk == 2)
    #expect(shown.stackItems(filter: .atRisk).count == 4)
    #expect(shown.severity == .critical)
    #expect(shown.birdAccessibility == Copy.menuBarCountAccessibility(4, muted: 2, severity: .critical))
    #expect(Copy.menuBarCountAccessibility(4, muted: 2, severity: .empty).contains("2 balances running low, " + Copy.mutedCount(2)))
    #expect(Copy.stackAtRiskCount(4, muted: 2) == "2, " + Copy.mutedCount(2))
    expectSurfacesAgree(shown, "muted")
  }

  /// QUO-465: every warning muted, so the label names no severity the plain bird does not show.
  @Test func allMutedReadsPlainPlusTheMutedCount() {
    let mutedEmpty = Mute(until: nil, balance: 0, severity: .empty)
    let a = conn("a", pools: [("credits", 0)], mutes: ["credits": mutedEmpty])
    let b = conn("b", pools: [("credits", 0)], mutes: ["credits": mutedEmpty])
    let shown = BalancesAsShown(local: [a, b])
    #expect(shown.birdSeverity == .none)
    #expect(shown.poolsAtRisk == 2)
    #expect(shown.birdAccessibility == Copy.birdAccessibility + ", " + Copy.mutedCount(2))
    expectSurfacesAgree(shown, "all muted")
  }

  /// A mute does not hide a connection that has stopped checking (QUO-449 unchanged).
  @Test func stoppedChecksKeepTheBirdGoldWithEveryBalanceMuted() {
    let mutedEmpty = Mute(until: nil, balance: 0, severity: .empty)
    let a = conn("a", pools: [("credits", 0)], mutes: ["credits": mutedEmpty], failures: 600, age: 7 * 86_400)
    let shown = BalancesAsShown(local: [a], health: ["a": .failed(lastSuccess: a.lastReading!.checkedAt, attempted: true)])
    #expect(shown.stoppedIDs == ["a"])
    #expect(shown.severity == .none)
    #expect(shown.birdSeverity == .low)
    #expect(shown.birdAccessibility == Copy.birdAccessibility + ", " + Copy.mutedCount(1) + ", " + Copy.birdChecksStopped(1))
    expectSurfacesAgree(shown, "stopped and muted")
  }
}
