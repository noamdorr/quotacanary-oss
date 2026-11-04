@testable import QuotaCanaryCore
import Testing

/// QUO-437: the inspector offers "Replace key…" only where a new key is the fix,
/// and its collapsed connection summary counts shown and hidden balances.
@Suite struct InspectorCopyTests {
  @Test func onlyKeyFailuresOfferKeyReplacement() {
    #expect(MonitorError.provider(.hunter, .keyRejected).offersKeyReplacement)
    #expect(MonitorError.provider(.apollo, .keyLacksScope).offersKeyReplacement)
    #expect(MonitorError.credentialMissing.offersKeyReplacement)
    #expect(!MonitorError.provider(.hunter, .unreachable).offersKeyReplacement)
    #expect(!MonitorError.provider(.hunter, .rateLimited).offersKeyReplacement)
    #expect(!MonitorError.provider(.hunter, .httpStatus(500)).offersKeyReplacement)
    #expect(!MonitorError.credentialReadFailed.offersKeyReplacement)
    #expect(!MonitorError.saveFailed.offersKeyReplacement)
  }

  @Test func shownSummaryCountsBoth() {
    #expect(Copy.balancesShownSummary(shown: 3, hidden: 2) == "3 balances shown · 2 hidden")
    #expect(Copy.balancesShownSummary(shown: 1, hidden: 4) == "1 balance shown · 4 hidden")
  }
}
