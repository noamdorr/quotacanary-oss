import Foundation
@testable import QuotaCanaryCore
import Testing

private let credits = Pool(creditType: "verifications", label: "Verifications", unit: .credits, cap: 1000)

private func row(monitored: Bool, status: PoolStatus = .low) -> PoolRow {
  PoolRow(
    key: PoolKey(connectionID: "c", creditType: credits.creditType), pool: credits, balance: 80,
    settings: PoolSettings(monitored: monitored, low: 100, critical: 33), status: status
  )
}

@Suite struct StatusStyleTests {
  @Test func contrastRatioMatchesTheSRGBFormula() {
    let white = SRGB(hex: 0xFFFFFF)
    let black = SRGB(hex: 0x000000)
    #expect(abs(white.contrastRatio(against: black) - 21) < 0.01)
    #expect(abs(black.contrastRatio(against: white) - 21) < 0.01)
    // The audit's number: Canary Gold on white.
    #expect(abs(StatusStyle.canaryGold.contrastRatio(against: white) - 1.60) < 0.01)
  }

  @Test func warningTextIsReadableOnEveryRowSurface() {
    for appearance in StatusAppearance.allCases {
      let tones = [PoolStatus.low, .critical, .empty].map { StatusStyle.warningText($0, appearance) }
        + [StatusStyle.checkFailedText(appearance)]
      for (index, text) in tones.enumerated() {
        for surface in StatusStyle.rowSurfaces(appearance) {
          let ratio = text.contrastRatio(against: surface)
          #expect(ratio >= StatusStyle.minimumTextContrast(appearance), "tone \(index) \(appearance) \(ratio)")
        }
      }
    }
  }

  @Test func lightModeLowTextIsNotCanaryGold() {
    #expect(StatusStyle.warningText(.low, .light) != StatusStyle.canaryGold)
    #expect(StatusStyle.warningText(.low, .lightIncreasedContrast) != StatusStyle.canaryGold)
  }

  @Test func healthyAndLowUseDifferentShapes() {
    #expect(StatusStyle.symbol(.healthy) != StatusStyle.symbol(.low))
    // The approved gold Low dot is kept.
    #expect(StatusStyle.symbol(.low) == "circle.fill")
    #expect(Set(PoolStatus.allCases.map(StatusStyle.symbol)).count == PoolStatus.allCases.count)
  }

  @Test func unmonitoredRowsCarryAWordedCueInsteadOfDimming() {
    #expect(StatusStyle.monitoringCue(row(monitored: false)) == Copy.notMonitored)
    #expect(StatusStyle.monitoringCue(row(monitored: true)) == nil)
  }

  @Test func criticalHintNamesTheInclusiveThreshold() {
    #expect(Copy.criticalHint("500 credits", afterSave: nil) == "Critical at or below 500 credits.")
    #expect(Copy.criticalHint("500 credits", afterSave: "600 credits")
      == "Critical at or below 500 credits. Saving sets it to 600 credits.")
  }
}
