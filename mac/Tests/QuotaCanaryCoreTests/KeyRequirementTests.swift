import Foundation
@testable import QuotaCanaryCore
import Testing

/// QUO-278: the connect form keeps what a key must be or allow, and drops
/// where to find it (those paths went stale, ZeroBounce's was wrong).
@Suite struct KeyRequirementTests {
  @Test func requirementsSurviveForTheToolsThatNeedThem() {
    #expect(Copy.keyRequirement("crawlbase")?.contains("one product slug") == true)
    #expect(Copy.keyRequirement("crawlbase")?.contains("five minutes between checks") == true)
    #expect(Copy.keyRequirement("builtwith")?.contains("Agent API Billing") == true)
    #expect(Copy.keyRequirement("deepgram")?.contains("Admin or Owner") == true)
  }

  @Test func navigationOnlyToolsShowNothing() {
    for id in ["zerobounce", "hunter", "openrouter", "hyperbolic", "semrush"] {
      #expect(Copy.keyRequirement(id) == nil, "\(id)")
    }
  }

  @Test func everyRequirementIsAKnownToolAndNeverADirection() {
    for (id, text) in Copy.keyRequirements {
      #expect(ProviderRegistry.current.isKnown(ProviderID(id)), "\(id)")
      #expect(!text.contains("Go to") && !text.contains("→") && !text.contains("->"), "\(id)")
      #expect(!text.contains("\u{2014}"), "\(id)")
    }
  }
}
