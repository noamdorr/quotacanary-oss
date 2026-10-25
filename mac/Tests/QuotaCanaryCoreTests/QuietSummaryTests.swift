import Foundation
@testable import QuotaCanaryCore
import Testing

/// Hunter fixture: searches then verifications, monitored at 300/100.
/// `nil` drops that balance from the reading (unknown); a cap of zero makes it
/// unavailable (not in plan).
private func quietConnection(
  _ id: String, searches: Double?, verifications: Double?, verificationsCap: Double? = nil,
  monitored: Bool = true
) -> Connection {
  var verificationsPool = ProviderID.hunter.pools[1]
  if let verificationsCap { verificationsPool.cap = verificationsCap }
  let balances = [
    searches.map { PoolBalance(pool: ProviderID.hunter.pools[0], balance: $0) },
    verifications.map { PoolBalance(pool: verificationsPool, balance: $0) },
  ].compactMap { $0 }
  return Connection(
    id: id, provider: .hunter, name: id, credentialRef: id,
    lastReading: Reading(balances: balances, checkedAt: Date(timeIntervalSince1970: 0)),
    poolSettings: Dictionary(uniqueKeysWithValues: ProviderID.hunter.pools.map {
      ($0.creditType, PoolSettings(monitored: monitored, low: 300, critical: 100))
    })
  )
}

@Suite struct QuietSummaryTests {
  @Test func healthyOnlyStaysQuietAndShowsTheFirstBalance() {
    let healthy = quietConnection("healthy", searches: 900, verifications: 800)
    #expect(ConnectionPresentation.allHealthy([healthy]))
    #expect(ConnectionPresentation.summaryRow(healthy.poolRows)?.key.creditType == ProviderID.hunter.pools[0].creditType)
  }

  @Test func unknownOnlyIsNotHealthy() {
    var unread = quietConnection("unread", searches: nil, verifications: nil)
    unread.lastReading = nil
    let missing = quietConnection("missing", searches: nil, verifications: nil)
    for connection in [unread, missing] {
      #expect(!ConnectionPresentation.allHealthy([connection]))
      #expect(ConnectionPresentation.summaryRow(connection.poolRows)?.status == .unknown)
      #expect(!connection.poolRows.map(\.alerts).contains(true))
    }
  }

  @Test func unknownSecondaryBalanceSurfacesInTheCollapsedRow() {
    let partial = quietConnection("partial", searches: 900, verifications: nil)
    #expect(!ConnectionPresentation.allHealthy([partial]))
    let row = ConnectionPresentation.summaryRow(partial.poolRows)
    #expect(row?.status == .unknown)
    #expect(row?.key.creditType == ProviderID.hunter.pools[1].creditType)
    #expect(row?.balance == nil)
  }

  @Test func unmonitoredLowOrEmptyIsNeitherHealthyNorAnAlert() {
    for verifications in [250.0, 50, 0] {
      let muted = quietConnection("muted", searches: 900, verifications: verifications, monitored: false)
      #expect(!ConnectionPresentation.allHealthy([muted]))
      let row = ConnectionPresentation.summaryRow(muted.poolRows)
      #expect(row?.status != .healthy)
      #expect(row?.settings.monitored == false)
      #expect(!muted.poolRows.map(\.alerts).contains(true))
    }
    let worst = quietConnection("worst", searches: 250, verifications: 0, monitored: false)
    #expect(ConnectionPresentation.summaryRow(worst.poolRows)?.status == .empty)
  }

  @Test func unmonitoredHealthyReadingIsStillHealthy() {
    let muted = quietConnection("muted", searches: 900, verifications: 800, monitored: false)
    #expect(ConnectionPresentation.allHealthy([muted]))
    #expect(ConnectionPresentation.summaryRow(muted.poolRows)?.status == .healthy)
  }

  @Test func unavailableAllowanceNeverOutranksAHealthyReading() {
    let plan = quietConnection("plan", searches: 900, verifications: 0, verificationsCap: 0)
    #expect(plan.poolRows.map(\.status) == [.healthy, .unavailable])
    #expect(ConnectionPresentation.allHealthy([plan]))
    #expect(ConnectionPresentation.summaryRow(plan.poolRows)?.status == .healthy)
    #expect(!plan.poolRows.map(\.alerts).contains(true))
  }

  @Test func nothingSpendableIsNotCalledHealthy() {
    var nothing = quietConnection("nothing", searches: nil, verifications: 0, verificationsCap: 0)
    nothing.lastReading?.balances.append(PoolBalance(
      pool: Pool(creditType: "searches", label: ProviderID.hunter.pools[0].label, unit: ProviderID.hunter.pools[0].unit, cap: 0),
      balance: 0
    ))
    #expect(nothing.poolRows.map(\.status) == [.unavailable, .unavailable])
    #expect(!ConnectionPresentation.allHealthy([nothing]))
  }

  @Test func oneUnhealthyConnectionSpoilsTheGroupClaim() {
    let healthy = quietConnection("healthy", searches: 900, verifications: 800)
    let partial = quietConnection("partial", searches: 900, verifications: nil)
    #expect(ConnectionPresentation.allHealthy([healthy]))
    #expect(!ConnectionPresentation.allHealthy([healthy, partial]))
  }

  @Test func headingClaimsHealthyOnlyWhenEveryBalanceIs() {
    #expect(BalancesAsShown.quietHeading(allHealthy: true, afterAttention: false) == Copy.allHealthySection)
    #expect(BalancesAsShown.quietHeading(allHealthy: true, afterAttention: true) == Copy.healthySection)
    #expect(BalancesAsShown.quietHeading(allHealthy: false, afterAttention: false) == Copy.connectionsSection)
    #expect(BalancesAsShown.quietHeading(allHealthy: false, afterAttention: true) == Copy.otherConnectionsSection)
  }
}
