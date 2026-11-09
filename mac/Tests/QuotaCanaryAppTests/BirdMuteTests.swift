import AppKit
@testable import QuotaCanary
import QuotaCanaryCore
import Testing

/// QUO-465: the bird's image follows the balances that are not muted. The
/// native monochrome mark is the only template image; a tinted one is not.
@MainActor @Suite struct BirdMuteTests {
  private func shown(mutes: [String: Mute] = [:]) -> BalancesAsShown {
    let pool = Pool(creditType: "credits", label: "Credits", unit: .credits, cap: 10_000)
    return BalancesAsShown(local: [Connection(
      id: "a", provider: .prospeo, name: "a", credentialRef: "a",
      lastReading: Reading(balances: [PoolBalance(pool: pool, balance: 0)], checkedAt: Date()),
      mutes: mutes
    )])
  }

  @Test func anUnmutedWarningTintsTheMark() {
    #expect(!BirdLabel.image(active: true, severity: shown().birdSeverity).isTemplate)
  }

  @Test func mutingTheOnlyWarningGivesTheNativeMark() {
    let muted = shown(mutes: ["credits": Mute(until: nil, balance: 0, severity: .empty)])
    #expect(BirdLabel.image(active: true, severity: muted.birdSeverity).isTemplate)
  }
}
