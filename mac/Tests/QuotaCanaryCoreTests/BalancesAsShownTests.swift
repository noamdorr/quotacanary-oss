import Foundation
@testable import QuotaCanaryCore
import Testing

// QUO-309: the watched balances as shown. The panel, the stack window, the
// bird and notification routing all read this one list, so its rows, order,
// failing rule and header are tested here instead of in each view.

private let checkedAt = Date(timeIntervalSince1970: 1_700_000_000)
private let ago: (Date) -> String = { _ in "5 minutes ago" }

/// Hunter: searches then verifications, monitored at 300/100.
private func hunter(_ id: String, searches: Double, verifications: Double, failures: Int = 0) -> Connection {
  let pools = ProviderID.hunter.pools
  return Connection(
    id: id, provider: .hunter, name: id, credentialRef: id,
    lastReading: Reading(
      balances: [PoolBalance(pool: pools[0], balance: searches), PoolBalance(pool: pools[1], balance: verifications)],
      checkedAt: checkedAt
    ),
    poolSettings: Dictionary(uniqueKeysWithValues: pools.map {
      ($0.creditType, PoolSettings(monitored: true, low: 300, critical: 100))
    }),
    monitoring: MonitoringState(consecutiveFailures: failures)
  )
}

private func ids(_ lines: [BalancesAsShown.PanelLine]) -> [String] { lines.map(\.id) }

@Suite struct BalancesAsShownTests {
  @Test func failingConnectionShowsOneAttentionRowAndKeepsHealthyRowsQuiet() throws {
    let failing = hunter("Agency", searches: 900, verifications: 800, failures: 3)
    let healthy = hunter("Backup", searches: 900, verifications: 800)
    let shown = BalancesAsShown(
      local: [healthy, failing],
      health: ["Agency": .failed(lastSuccess: checkedAt, attempted: true), "Backup": .ok(lastSuccess: checkedAt)],
      errors: ["Agency": "Hunter rejected the key"],
      lastErrors: ["Agency": .provider(.hunter, .keyRejected)]
    )

    #expect(shown.failingIDs == ["Agency"])
    let panel = shown.panel
    // A failing connection has one attention row.
    #expect(ids(panel.attention) == ["local-failure:Agency"])
    guard case let .localFailure(failure) = panel.attention[0] else { Issue.record("no failure line"); return }
    #expect(failure.reason == "Hunter rejected the key")
    #expect(failure.detail == Copy.compactKeyRejected)
    // The healthy connection stays quiet, collapsed to its summary balance,
    #expect(ids(panel.quiet) == ["local:Backup|searches"])
    #expect(panel.quietCount == 1)
    #expect(panel.quietHeading == Copy.healthySection)
    // The header reports the oldest successful local check.
    #expect(shown.freshness(isBusy: false) == .checked(checkedAt))
    #expect(shown.freshness(isBusy: false).text(ago) == Copy.checked("5 minutes ago"))
    #expect(shown.freshness(isBusy: true) == .checking)
    // Failed monitoring makes the last reading untrusted.
    #expect(!shown.health(of: failing).isTrusted)
    #expect(shown.health(of: healthy).isTrusted)
    // The Failing filter includes the failed connection's balances.
    #expect(shown.stackItems(filter: .failing).map(\.name) == ["Agency", "Agency"])
  }

  @Test func failingRuleWaitsForTheSchedulerThenFallsBackToTheLastCheck() {
    let streak = hunter("streak", searches: 900, verifications: 800, failures: 1)
    let errored = hunter("errored", searches: 900, verifications: 800)
    let clean = hunter("clean", searches: 900, verifications: 800)
    let recovered = hunter("recovered", searches: 900, verifications: 800, failures: 2)
    let offline = hunter("offline", searches: 900, verifications: 800, failures: 2)
    let shown = BalancesAsShown(
      local: [streak, errored, clean, recovered, offline],
      health: ["streak": .checking, "recovered": .ok(lastSuccess: checkedAt), "offline": .offline(lastSuccess: nil)],
      errors: ["errored": "Unreachable"]
    )
    #expect(shown.failingIDs == ["streak", "errored"])
  }

  @Test func attentionIsWorstFirstAndQuietIsTheRest() throws {
    let low = hunter("low", searches: 250, verifications: 800)
    let empty = hunter("empty", searches: 900, verifications: 0)
    let quiet = hunter("quiet", searches: 900, verifications: 800)
    let panel = BalancesAsShown(local: [quiet, low, empty]).panel
    #expect(ids(panel.attention) == [
      "local:empty|verifications", "local:low|searches",
    ])
    #expect(ids(panel.quiet) == ["local:quiet|searches"])
    #expect(panel.quietHeading == Copy.healthySection)
    guard case let .local(_, _, extra) = panel.quiet[0] else { Issue.record("no quiet line"); return }
    #expect(extra == 1)
  }

  @Test func allQuietAndHealthySaysSo() {
    let panel = BalancesAsShown(local: [hunter("a", searches: 900, verifications: 800)]).panel
    #expect(panel.attention.isEmpty)
    #expect(panel.quietHeading == Copy.allHealthySection)
  }

  @Test func stackRanksWorstFirstAndSearchesByName() throws {
    let low = hunter("low", searches: 250, verifications: 800)
    let shown = BalancesAsShown(local: [low])
    #expect(shown.stackItems().map(\.name) == ["low", "low"])
    #expect(shown.stackItems(filter: .atRisk).map(\.name) == ["low"])
    #expect(shown.stackItems(query: "low").map(\.name) == ["low", "low"])
    #expect(shown.stackItems().first?.topupURL?.absoluteString == ProviderID.hunter.topupURL?.absoluteString)
  }

  @Test func birdTakesTheWorstWarningAndCountsEveryAtRiskBalance() throws {
    let low = hunter("low", searches: 250, verifications: 800)
    let shown = BalancesAsShown(local: [low])
    #expect(shown.severity == .low)
    #expect(shown.poolsAtRisk == 1)
    #expect(BalancesAsShown(local: [hunter("ok", searches: 900, verifications: 800)]).severity == .none)
  }

  @Test func notificationsCanOpenEveryShownBalance() throws {
    let low = hunter("low", searches: 250, verifications: 800)
    let targets = BalancesAsShown(local: [low]).notificationTargets
    #expect(targets.map(\.creditType) == ["searches", "verifications"])
  }

  @Test func compactFailureNamesTheCause() {
    #expect(BalancesAsShown.compactFailure(.provider(.hunter, .httpStatus(503))) == "HTTP 503")
    #expect(BalancesAsShown.compactFailure(.credentialMissing) == Copy.compactKeyUnavailable)
    #expect(BalancesAsShown.compactFailure(nil) == Copy.compactCheckFailed)
  }
}
