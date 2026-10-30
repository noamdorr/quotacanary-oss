import Foundation
@testable import QuotaCanaryCore
import Testing

/// The connect form's picker filter: 131 tools is too many to scan, so a
/// search field narrows the menu by display name or id, case-insensitively.
@Suite struct ProviderSearchTests {
  let ids = [ProviderID.openrouter, .hunter, ProviderID("scaleserp"), ProviderID("serpapi"), ProviderID("scrapingbee")]

  @Test func blankQueryKeepsEveryProvider() {
    #expect(ProviderSearch.filter("", among: ids) == ids)
    #expect(ProviderSearch.filter("   ", among: ids) == ids)
  }

  @Test func matchesDisplayNameOrIDCaseInsensitivelyAnywhere() {
    #expect(ProviderSearch.filter("serp", among: ids) == [ProviderID("scaleserp"), ProviderID("serpapi")])
    #expect(ProviderSearch.filter("OPEN", among: ids) == [.openrouter])
    #expect(ProviderSearch.filter("scale serp", among: ids) == [ProviderID("scaleserp")]) // "Scale SERP"
    #expect(ProviderSearch.filter("nothing", among: ids).isEmpty)
  }
}
