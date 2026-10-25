import Foundation
@testable import QuotaCanaryCore
import Testing

/// Provider ids are strings validated against the bundled catalog plus the
/// hand-written set (OpenRouter, Tavily, Apollo, lemlist, People Data Labs, PhantomBuster, Deepgram, Webshare, Decodo, Brevo, Twilio, Plivo, Vonage,
/// DataForSEO, Tomba, Snov.io, Verifalia, PredictLeads, Crawlbase, Hyperbolic, Orthogonal, ZeroBounce,
/// RocketReach, Enrich CRM, Majestic, Mangools, Semrush, Ahrefs, Diffbot, NetNut, ContactOut, Melt.ly, DeepSeek, Firecrawl, Apify, You.com). The picker lists all of them.
@Suite struct ProviderRegistryTests {
  @Test func thePickerListsEveryCatalogToolPlusTheHandWrittenOnes() throws {
    let ids = ProviderID.allCases
    #expect(ids.count == 95 + 36)
    #expect(Set(ids).count == ids.count)
    #expect(ids.contains(.openrouter) && ids.contains(.tavily) && ids.contains(.apollo) && ids.contains(.lemlist)
      && ids.contains(.peopledatalabs) && ids.contains(.phantombuster) && ids.contains(.deepgram)
      && ids.contains(.webshare) && ids.contains(.decodo) && ids.contains(.brevo)
      && ids.contains(.twilio) && ids.contains(.plivo) && ids.contains(.vonage)
      && [ProviderID.dataforseo, .tomba, .snov, .verifalia, .predictleads, .crawlbase, .hyperbolic, .orthogonal, .zerobounce,
         .rocketreach, .enrichcrm, .majestic, .mangools, .semrush, .ahrefs, .diffbot, .netnut,
         .contactout, .meltly, .deepseek, .firecrawl, .apify, .youcom].allSatisfy(ids.contains))
    #expect(ids.contains(.hunter) && ids.contains(.prospeo) && ids.contains(ProviderID("shodan")))
    // Alphabetical by display name, case-insensitively, so the menu reads top to bottom.
    #expect(ids.map { $0.displayName.lowercased() } == ids.map { $0.displayName.lowercased() }.sorted())
    #expect(ProviderRegistry.current.catalogFailure == nil)
  }

  @Test func catalogEntriesNamePoolsAndDefaultsFromTheFile() {
    #expect(ProviderID.hunter.displayName == "Hunter")
    #expect(ProviderID.hunter.pools == [
      Pool(creditType: "searches", label: "Searches", unit: .credits, cap: nil),
      Pool(creditType: "verifications", label: "Verifications", unit: .credits, cap: nil),
    ])
    #expect(ProviderID("surfe").pools.map(\.creditType) == ["email", "mobile", "search"])
    #expect(ProviderID("brightdata").pools.first?.unit == .usd)
    // The catalog carries no thresholds yet (QUO-193): credits get the web's
    // common 500 / 1500, dollar balances OpenRouter's 5 / 15.
    #expect(ProviderID.hunter.defaultSettings == PoolSettings(monitored: true, low: 1500, critical: 500))
    #expect(ProviderID("brightdata").defaultSettings == PoolSettings(monitored: true, low: 15, critical: 5))
    #expect(ProviderRegistry.current.entry(.hunter)?.request.url == "https://api.hunter.io/v2/account")
    #expect(ProviderRegistry.current.entry(.openrouter) == nil)
  }

  @Test func handWrittenProvidersKeepTheirDefinitions() {
    #expect(ProviderID.openrouter.displayName == "OpenRouter")
    #expect(ProviderID.openrouter.pools == [OpenRouter.creditsPool])
    #expect(ProviderID.tavily.pools == Tavily.pools)
    #expect(ProviderID.apollo.pools == Apollo.pools)
    #expect(ProviderID.lemlist.displayName == "lemlist")
    #expect(ProviderID.lemlist.pools == Lemlist.pools)
    #expect(ProviderID.lemlist.defaultSettings == PoolSettings(monitored: true, low: 300, critical: 100))
    #expect(ProviderID.peopledatalabs.displayName == "People Data Labs")
    #expect(ProviderID.peopledatalabs.pools == PeopleDataLabs.pools)
    #expect(ProviderID.peopledatalabs.defaultSettings == PoolSettings(monitored: true, low: 75, critical: 25))
    #expect(ProviderID.phantombuster.displayName == "PhantomBuster")
    #expect(ProviderID.phantombuster.pools == PhantomBuster.pools)
    #expect(ProviderID.phantombuster.defaultSettings == PoolSettings(monitored: true, low: 180, critical: 60))
    #expect(ProviderID.deepgram.displayName == "Deepgram")
    #expect(ProviderID.deepgram.pools == Deepgram.pools)
    #expect(ProviderID.deepgram.defaultSettings == PoolSettings(monitored: true, low: 15, critical: 5))
    #expect(ProviderID.webshare.displayName == "Webshare")
    #expect(ProviderID.webshare.pools == Webshare.pools)
    #expect(ProviderID.webshare.defaultSettings == PoolSettings(monitored: true, low: 3, critical: 1))
    #expect(ProviderID.decodo.displayName == "Decodo")
    #expect(ProviderID.decodo.pools == Decodo.pools)
    #expect(ProviderID.decodo.defaultSettings == PoolSettings(monitored: true, low: 3, critical: 1))
    #expect(ProviderID.brevo.displayName == "Brevo")
    #expect(ProviderID.brevo.pools == Brevo.pools)
    #expect(ProviderID.brevo.defaultSettings == PoolSettings(monitored: true, low: 1500, critical: 500))
    #expect(ProviderID.tavily.defaultSettings == PoolSettings(monitored: true, low: 300, critical: 100))
    for (id, pools) in [(ProviderID.twilio, Twilio.pools), (.plivo, Plivo.pools), (.vonage, Vonage.pools)] {
      #expect(id.pools == pools)
      #expect(id.defaultSettings == PoolSettings(monitored: true, low: 15, critical: 5))
    }
    #expect([ProviderID.twilio, .plivo, .vonage].map(\.displayName) == ["Twilio", "Plivo", "Vonage"])
    // QUO-253: names, pools and seed-row defaults of the remaining two-value twins.
    let twins: [(ProviderID, String, [Pool], PoolSettings)] = [
      (.dataforseo, "DataForSEO", DataForSEO.pools, PoolSettings(monitored: true, low: 75, critical: 25)),
      (.tomba, "Tomba", Tomba.pools, PoolSettings(monitored: true, low: 1500, critical: 500)),
      (.snov, "Snov.io", Snov.pools, PoolSettings(monitored: true, low: 1500, critical: 500)),
      (.verifalia, "Verifalia", Verifalia.pools, PoolSettings(monitored: true, low: 3000, critical: 1000)),
      (.predictleads, "PredictLeads", PredictLeads.pools, PoolSettings(monitored: true, low: 30, critical: 10)),
      (.crawlbase, "Crawlbase", Crawlbase.pools, PoolSettings(monitored: true, low: 750, critical: 250)),
      // QUO-257: the numeric-coercion twins.
      (.hyperbolic, "Hyperbolic", Hyperbolic.pools, PoolSettings(monitored: true, low: 15, critical: 5)),
      (.orthogonal, "Orthogonal", Orthogonal.pools, PoolSettings(monitored: true, low: 15, critical: 5)),
      (.zerobounce, "ZeroBounce", ZeroBounce.pools, PoolSettings(monitored: true, low: 3000, critical: 1000)),
      // QUO-258: the non-standard twins.
      (.rocketreach, "RocketReach", RocketReach.pools, PoolSettings(monitored: true, low: 1500, critical: 500)),
      (.enrichcrm, "Enrich CRM", EnrichCRM.pools, PoolSettings(monitored: true, low: 1500, critical: 500)),
      (.majestic, "Majestic", Majestic.pools, PoolSettings(monitored: true, low: 30000, critical: 10000)),
      (.mangools, "Mangools", Mangools.pools, PoolSettings(monitored: true, low: 75, critical: 25)),
      (.semrush, "Semrush", Semrush.pools, PoolSettings(monitored: true, low: 3000, critical: 1000)),
      // QUO-255: the computed-balance twins.
      (.ahrefs, "Ahrefs", Ahrefs.pools, PoolSettings(monitored: true, low: 15000, critical: 5000)),
      (.diffbot, "Diffbot", Diffbot.pools, PoolSettings(monitored: true, low: 1500, critical: 500)),
      (.netnut, "NetNut", NetNut.pools, PoolSettings(monitored: true, low: 150, critical: 50)),
      // QUO-256: the fallback-path twins.
      (.contactout, "ContactOut", ContactOut.pools, PoolSettings(monitored: true, low: 300, critical: 100)),
      (.meltly, "Melt.ly", Meltly.pools, PoolSettings(monitored: true, low: 15, critical: 5)),
      (.deepseek, "DeepSeek", DeepSeek.pools, PoolSettings(monitored: true, low: 15, critical: 5)),
      (.firecrawl, "Firecrawl", Firecrawl.pools, PoolSettings(monitored: true, low: 15000, critical: 5000)),
      // QUO-319: the You.com twin.
      (.youcom, "You.com", YouCom.pools, PoolSettings(monitored: true, low: 15, critical: 5)),
    ]
    for (id, name, pools, defaults) in twins {
      #expect(id.displayName == name)
      #expect(id.pools == pools)
      #expect(id.defaultSettings == defaults)
    }
  }

  @Test func everyProviderHasAnHTTPSTopUpURL() {
    // QUO-214: local connections get "Top up" from the catalog, or for a
    // hand-written provider from the hosted tools.topup_url copy.
    let missing = ProviderID.allCases.filter { $0.topupURL?.scheme != "https" }
    #expect(missing.isEmpty, "no https topupURL: \(missing.map(\.rawValue))")
    #expect(ProviderID.hunter.topupURL == URL(string: "https://hunter.io/welcome/upgrade"))
    #expect(ProviderID.openrouter.topupURL == URL(string: "https://openrouter.ai/credits"))
    #expect(ProviderID("not-a-tool").topupURL == nil)
  }

  @Test func idsEncodeAsPlainStrings() throws {
    let data = try JSONEncoder().encode([ProviderID.hunter, ProviderID("zenserp")])
    #expect(String(decoding: data, as: UTF8.self) == #"["hunter","zenserp"]"#)
    #expect(try JSONDecoder().decode([ProviderID].self, from: data) == [.hunter, ProviderID("zenserp")])
  }

  @Test func aMalformedCatalogLeavesTheHandWrittenProvidersAndADiagnostic() {
    let registry = ProviderRegistry(catalog: .failure(CatalogError(reason: "tools.0: missing pools")))
    #expect(registry.ids == [
      .ahrefs, .apify, .apollo, .brevo, .contactout, .crawlbase, .dataforseo, .decodo, .deepgram, .deepseek, .diffbot, .enrichcrm, .firecrawl,
      .hyperbolic, .lemlist, .majestic, .mangools, .meltly, .netnut, .openrouter, .orthogonal, .peopledatalabs, .phantombuster, .plivo, .predictleads, .rocketreach, .semrush, .snov, .tavily,
      .tomba, .twilio, .verifalia, .vonage, .webshare, .youcom, .zerobounce,
    ])
    #expect(registry.catalogFailure == "tools.0: missing pools")
    #expect(registry.isKnown(.openrouter))
    #expect(!registry.isKnown(.hunter))
    #expect(registry.displayName(.hunter) == "hunter")
    #expect(registry.pools(.hunter).isEmpty)
  }

  @Test func aMissingBundledFileIsAFailureNotACrashInRelease() {
    #expect(Catalog.load(bundledData: nil).failureReason == "bundled tools.json not found")
  }
}

private extension Result where Success == Catalog, Failure == CatalogError {
  var failureReason: String? {
    if case let .failure(error) = self { return error.reason }
    return nil
  }
}
