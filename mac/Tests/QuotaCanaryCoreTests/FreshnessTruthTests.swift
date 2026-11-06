import Foundation
@testable import QuotaCanaryCore
import Testing

// QUO-446: the header, the offline mark and the quiet heading say only what
// is true about freshness and health.

private let checkedAt = Date(timeIntervalSince1970: 1_700_000_000)
private let rejected = ScriptedTransport.Step.respond(status: 401, body: "{}")

private func prospeo(
  _ id: String, credits: Double = 4000, settings: PoolSettings? = nil, failures: Int = 0, age: TimeInterval = 0
) -> Connection {
  let pool = Pool(creditType: "credits", label: "Credits", unit: .credits, cap: 10_000)
  return Connection(
    id: id, provider: .prospeo, name: id, credentialRef: id,
    lastReading: Reading(balances: [PoolBalance(pool: pool, balance: credits)], checkedAt: checkedAt.addingTimeInterval(-age)),
    poolSettings: settings.map { ["credits": $0] } ?? [:],
    monitoring: MonitoringState(consecutiveFailures: failures)
  )
}

@Suite struct FreshnessHeaderTests {
  /// Every connection failing, the newest good check two days ago: the header
  /// names that time instead of "No good check yet".
  @Test func headerWithEveryConnectionFailingNamesTheLastGoodCheck() {
    let a = prospeo("a", failures: 1, age: 2 * 86_400)
    let b = prospeo("b", failures: 1, age: 3 * 86_400)
    let shown = BalancesAsShown(local: [a, b], health: [
      "a": .failed(lastSuccess: a.lastReading!.checkedAt, attempted: true),
      "b": .failed(lastSuccess: b.lastReading!.checkedAt, attempted: true),
    ])
    #expect(shown.freshness(isBusy: false) == .lastGood(a.lastReading!.checkedAt))
    #expect(shown.freshness(isBusy: false).text { _ in "2 days ago" } == Copy.lastGoodCheck("2 days ago"))
  }

  /// A connection that never had a good check still says so.
  @Test func neverCheckedStillSaysNoGoodCheckYet() {
    let never = Connection(id: "n", provider: .prospeo, name: "n", credentialRef: "n", lastReading: nil)
    let shown = BalancesAsShown(local: [never], health: ["n": .failed(lastSuccess: nil, attempted: true)])
    #expect(shown.freshness(isBusy: false) == .noGoodCheckYet)
  }

  /// Every balance unmonitored and healthy: nothing is watched, so nothing is "All healthy".
  @Test func nothingMonitoredIsNotCalledAllHealthy() {
    let off = PoolSettings(monitored: false, low: 1500, critical: 500)
    let panel = BalancesAsShown(local: [prospeo("a", settings: off), prospeo("b", settings: off)]).panel
    #expect(panel.quietHeading == Copy.connectionsSection)
  }

  /// One monitored healthy balance beside an unmonitored one is still all healthy.
  @Test func oneMonitoredBalanceKeepsAllHealthy() {
    let off = PoolSettings(monitored: false, low: 1500, critical: 500)
    let panel = BalancesAsShown(local: [prospeo("a"), prospeo("b", settings: off)]).panel
    #expect(panel.quietHeading == Copy.allHealthySection)
  }
}

@MainActor @Suite struct ReconnectTruthTests {
  /// A Wi-Fi blip 20 seconds after a check: back online, the next check clears the offline mark.
  @Test func blipWithinAMinuteOfACheckRechecksOnReconnect() async throws {
    let h = SchedulerHarness()
    try await h.connect()
    h.scheduler.start()
    await h.scheduler.settle()
    #expect(h.health == .ok(lastSuccess: t0))
    let before = h.requests

    h.clock.advance(by: 20)
    h.reachability.isOnline = false
    h.lifecycle.emit(.reachabilityChanged(online: false))
    #expect(h.health == .offline(lastSuccess: t0))
    h.clock.advance(by: 5)
    h.reachability.isOnline = true
    h.lifecycle.emit(.reachabilityChanged(online: true))
    await h.scheduler.settle()
    #expect(h.requests == before + 1)
    #expect(h.health == .ok(lastSuccess: t0.addingTimeInterval(25)))
  }

  /// Start at login before Wi-Fi: the launch check finds no network, Wi-Fi
  /// joins five seconds later and the connection is checked then.
  @Test func launchBeforeWifiThenWifiFiveSecondsLaterRechecks() async throws {
    let h = SchedulerHarness()
    try await h.connect()
    h.clock.advance(by: 86_400)
    h.scripted.script([.fail, ok])
    h.scheduler.start()
    h.reachability.isOnline = false
    h.lifecycle.emit(.reachabilityChanged(online: false))
    await h.scheduler.settle()
    #expect(h.health == .offline(lastSuccess: t0))
    let before = h.requests

    h.clock.advance(by: 5)
    h.reachability.isOnline = true
    h.lifecycle.emit(.reachabilityChanged(online: true))
    await h.scheduler.settle()
    #expect(h.requests == before + 1)
    #expect(h.health == .ok(lastSuccess: t0.addingTimeInterval(86_405)))
  }

  /// A rejected key, then a five-second blip: still failing, still a key
  /// problem (so Replace key stays), never quietly healthy.
  @Test func rejectedKeyStaysFailingThroughAnOfflineBlip() async throws {
    let h = SchedulerHarness()
    try await h.connect()
    h.scheduler.start()
    await h.scheduler.settle()
    h.scripted.script([rejected])
    await h.advance(PollScheduler.nominalInterval)
    func shown() -> BalancesAsShown {
      BalancesAsShown(local: h.service.connections, health: h.monitor.health, errors: h.monitor.messages, lastErrors: h.monitor.errors)
    }
    #expect(shown().failingIDs == ["conn-1"])

    h.clock.advance(by: 20)
    h.reachability.isOnline = false
    h.lifecycle.emit(.reachabilityChanged(online: false))
    // Offline, with no new answer: the failure stands.
    #expect(shown().failingIDs == ["conn-1"])
    #expect(h.monitor.errors["conn-1"] == .provider(.openrouter, .keyRejected))
    h.clock.advance(by: 5)
    h.reachability.isOnline = true
    h.lifecycle.emit(.reachabilityChanged(online: true))
    await h.scheduler.settle()
    #expect(shown().failingIDs == ["conn-1"])
    #expect(h.monitor.errors["conn-1"] == .provider(.openrouter, .keyRejected))
    guard case .localFailure = shown().panel.attention.first else {
      Issue.record("the rejected key left Needs attention"); return
    }
  }
}
