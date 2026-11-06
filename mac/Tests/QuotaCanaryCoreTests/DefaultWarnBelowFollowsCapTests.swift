import Foundation
@testable import QuotaCanaryCore
import Testing

// QUO-441: a default Warn below never sits at or above 20% of a balance's cap,
// so a full small plan reads healthy. Saved settings and capless balances keep
// their numbers.

private func hunter(cap: Double?, balance: Double, saved: PoolSettings? = nil) -> PoolRow {
  var pool = ProviderID.hunter.pools[0]
  pool.cap = cap
  let connection = Connection(
    id: "c", provider: .hunter, name: "Hunter", credentialRef: "c",
    lastReading: Reading(balances: [PoolBalance(pool: pool, balance: balance)], checkedAt: Date(timeIntervalSince1970: 0)),
    poolSettings: saved.map { [pool.creditType: $0] } ?? [:]
  )
  return connection.allPoolRows[0]
}

@Suite struct DefaultWarnBelowFollowsCapTests {
  @Test(arguments: [(25.0, 25.0), (50, 50), (75, 75), (500, 500), (1000, 1000), (7000, 7000)])
  func aFullSmallPlanIsHealthy(cap: Double, balance: Double) {
    #expect(hunter(cap: cap, balance: balance).status == .healthy)
  }

  @Test func warnBelowIsTwentyPercentOfTheCapAndCriticalAThirdOfThat() {
    let row = hunter(cap: 25, balance: 25)
    #expect(row.settings.low == 5)
    #expect(row.settings.critical == 1)
    #expect(Thresholds.defaultShareOfCap == 0.2)
  }

  @Test func tenPercentReadsLowAndFivePercentReadsCritical() {
    #expect(hunter(cap: 1000, balance: 100).status == .low)
    #expect(hunter(cap: 1000, balance: 50).status == .critical)
    #expect(hunter(cap: 25, balance: 2.5).status == .low)
    #expect(hunter(cap: 25, balance: 1).status == .critical)
  }

  @Test func aLargePlanKeepsTheFlatDefaults() {
    let row = hunter(cap: 100_000, balance: 100_000)
    #expect(row.settings == ProviderID.hunter.defaultSettings)
    // 20% of 7,500 is exactly the flat 1,500: the two agree at the boundary.
    #expect(hunter(cap: 7500, balance: 7500).settings.low == 1500)
  }

  @Test func aCaplessBalanceKeepsTheFlatDefaults() {
    let row = hunter(cap: nil, balance: 10)
    #expect(row.settings == ProviderID.hunter.defaultSettings)
    #expect(row.status == .critical)
  }

  @Test func aZeroCapStaysUnavailableWithFlatDefaults() {
    let row = hunter(cap: 0, balance: 0)
    #expect(row.status == .unavailable)
    #expect(row.settings == ProviderID.hunter.defaultSettings)
  }

  @Test func savedSettingsAreNeverRewritten() {
    let saved = PoolSettings(monitored: true, low: 1500, critical: 500)
    let row = hunter(cap: 25, balance: 25, saved: saved)
    #expect(row.settings == saved)
    #expect(row.status == .critical)
  }

  @Test func hintAppliesAtOrAboveTheCapOnly() {
    #expect(Thresholds.isAtOrAboveCap(5000, cap: 25))
    #expect(Thresholds.isAtOrAboveCap(25, cap: 25))
    #expect(!Thresholds.isAtOrAboveCap(24.9, cap: 25))
    #expect(!Thresholds.isAtOrAboveCap(5000, cap: nil))
    #expect(!Thresholds.isAtOrAboveCap(5000, cap: 0))
  }

  @Test @MainActor func fiveFullSmallPlansRaiseNothing() async throws {
    let stack = StackScenario.smallPlans
    let service = stack.service()
    try service.restore()
    for connection in service.connections { _ = try await service.refresh(id: connection.id) }
    let shown = BalancesAsShown(local: service.connections)
    let read = shown.stackItems().filter { $0.row.balance != nil }
    #expect(read.count == 5)
    #expect(read.allSatisfy { $0.row.status == .healthy })
    #expect(!shown.stackItems().contains { $0.row.warns })
    #expect(shown.severity == .none)
    #expect(shown.poolsAtRisk == 0)
  }
}
