import Foundation
@testable import QuotaCanaryCore
import Testing

@Suite struct BalancePresentationTests {
  private func connection(_ id: String, balances: [Double]) -> Connection {
    Connection(
      id: id, provider: .hunter, name: id, credentialRef: id,
      lastReading: Reading(
        balances: zip(ProviderID.hunter.pools, balances).map { PoolBalance(pool: $0.0, balance: $0.1) },
        checkedAt: Date(timeIntervalSince1970: 0)
      ),
      poolSettings: Dictionary(uniqueKeysWithValues: ProviderID.hunter.pools.map {
        ($0.creditType, PoolSettings(monitored: true, low: 300, critical: 100))
      })
    )
  }

  @Test func tableRanksBalancesGloballyAndCountsOnlyMatchingRows() {
    let a = connection("a", balances: [0, 900])
    let b = connection("b", balances: [250, 50])
    let rows = ConnectionPresentation.balances([a, b])
    #expect(rows.map(\.row.status) == [.empty, .critical, .low, .healthy])
    #expect(Set(rows.map(\.id)).count == 4)
    #expect(ConnectionPresentation.balances([a, b], filter: .atRisk).count == 3)
    #expect(ConnectionPresentation.balances([a, b], filter: .failing, failingIDs: ["a"]).map(\.connection.id) == ["a", "a"])
    #expect(ConnectionPresentation.balances([a, b], query: ProviderID.hunter.pools[1].label, filter: .atRisk).count == 1)
  }

  @Test func identitySurvivesRefreshRenameAndSeverityReordering() {
    var a = connection("a", balances: [0, 900])
    let selected = ConnectionPresentation.balances([a])[0].id
    a.name = "Renamed"
    a.lastReading?.balances[0].balance = 900
    a.lastReading?.balances[1].balance = 0
    let refreshed = ConnectionPresentation.balances([a])
    #expect(refreshed.last?.id == selected)
    #expect(refreshed.first { $0.id == selected }?.connection.name == "Renamed")
  }

  @Test func meterUsesCapAndStoredCriticalThenUpdatesOnSave() throws {
    var row = connection("a", balances: [150, 900]).poolRows[0]
    row.pool.cap = 1000
    var meter = try #require(BalanceMeterScale(row))
    #expect(meter.remaining == 0.15)
    #expect(meter.low == 0.3)
    #expect(meter.critical == 0.1)
    row.settings = try PoolSettingsDraft(monitored: true, low: "900").validated().get()
    meter = try #require(BalanceMeterScale(row))
    #expect(meter.low == 0.9)
    #expect(meter.critical == 0.3)
  }

  @Test func uncappedMeterUsesThreeWarningsAndClampsOverdrawnOrExcess() throws {
    var row = connection("a", balances: [150, 900]).poolRows[0]
    row.pool.cap = nil
    let meter = try #require(BalanceMeterScale(row))
    #expect(abs(meter.remaining - 1.0 / 6) < 0.00001)
    #expect(meter.low == 1.0 / 3)
    row.balance = -100
    #expect(BalanceMeterScale(row)?.remaining == 0)
    row.balance = 10000
    #expect(BalanceMeterScale(row)?.remaining == 1)
    row.settings.low = Double.greatestFiniteMagnitude
    #expect(BalanceMeterScale(row)?.low == 1.0 / 3)
  }

  @Test func unavailableAndUnreadHaveNoFillOrThresholdTicks() {
    var row = connection("a", balances: [0, 900]).poolRows[0]
    row.status = .unavailable
    row.pool.cap = 0
    #expect(BalanceMeterScale(row) == nil)
    row.status = .unknown
    row.balance = nil
    #expect(BalanceMeterScale(row) == nil)
  }
}

/// QUO-269: the stack's columns fit beside the inspector only from
/// `inspectorAutoMinWidth`; below it the inspector starts folded away.
@Suite struct StackLayoutTests {
  @Test func theInspectorFoldsAwayWhenTheTableWouldOverflow() {
    #expect(StackLayout.inspectorAutoMinWidth == StackLayout.tableMinWidth + StackLayout.inspectorWidth + 1)
    #expect(StackLayout.showsInspectorByDefault(width: 1000)) // the window's default size
    #expect(!StackLayout.showsInspectorByDefault(width: 760)) // the window's minimum
    // At the minimum, the folded table keeps every column without scrolling.
    #expect(StackLayout.tableMinWidth <= 760)
  }
}
