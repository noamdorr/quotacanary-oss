import Foundation
@testable import QuotaCanaryCore
import Testing

/// The contract every provider definition meets, hand-written or catalog:
/// the registry is one list, and nothing is in it twice or half-filled.
@Suite struct ProviderDefinitionTests {
  /// The hand-written set by id. A provider removed from the registry's roll
  /// call fails here, which the roll call itself cannot catch.
  static let handWrittenIDs: [ProviderID] = [
    .openrouter, .tavily, .apollo, .lemlist, .peopledatalabs, .phantombuster, .deepgram, .webshare, .decodo,
    .brevo, .twilio, .plivo, .vonage, .dataforseo, .tomba, .snov, .verifalia, .predictleads, .crawlbase,
    .hyperbolic, .orthogonal, .zerobounce, .rocketreach, .enrichcrm, .majestic, .mangools, .semrush, .ahrefs,
    .diffbot, .netnut, .contactout, .meltly, .deepseek, .firecrawl, .apify, .youcom,
  ]

  @Test func idsAreUniqueAndEveryHandWrittenProviderIsListedOnce() {
    let definitions = ProviderRegistry.current.definitions
    #expect(Set(definitions.map(\.id)).count == definitions.count)
    for id in Self.handWrittenIDs {
      #expect(definitions.filter { $0.id == id }.count == 1, "\(id.rawValue)")
      // A tool is hand-written or in the catalog, never both (the web's
      // registry contract test says the same).
      #expect(ProviderRegistry.current.entry(id) == nil, "\(id.rawValue) is also a catalog entry")
    }
    #expect(ProviderRegistry.handWritten == Self.handWrittenIDs)
    #expect(definitions.count == ProviderRegistry.current.entries.count + Self.handWrittenIDs.count)
  }

  @Test func everyDefinitionIsComplete() {
    for definition in ProviderRegistry.current.definitions {
      let id = definition.id.rawValue
      #expect(!definition.name.isEmpty, "\(id)")
      #expect(definition.topupURL?.scheme == "https", "\(id)")
      #expect(definition.defaultSettings.low > definition.defaultSettings.critical, "\(id)")
      #expect(definition.defaultSettings.critical > 0, "\(id)")
      #expect(Set(definition.pools.map(\.creditType)).count == definition.pools.count, "\(id)")
      #expect(Set(definition.credentialFields.map(\.name)).count == definition.credentialFields.count, "\(id)")
    }
  }

  @Test func catalogDefinitionsCarryTheEntrysPools() {
    for entry in ProviderRegistry.current.entries {
      let definition = ProviderRegistry.current.definition(ProviderID(entry.id))
      #expect(definition?.pools.map(\.creditType) == entry.pools.map(\.creditType), "\(entry.id)")
      #expect(definition?.pools.isEmpty == false, "\(entry.id)")
      #expect(definition?.credentialFields.isEmpty == true, "\(entry.id)")
    }
    // Deepgram is the one hand-written provider whose pools come from the reading.
    for id in Self.handWrittenIDs where id != .deepgram {
      #expect(ProviderRegistry.current.pools(id).isEmpty == false, "\(id.rawValue)")
    }
  }

  @Test func notesFollowTheDefinition() {
    #expect(ProviderID.openrouter.note == Copy.accountWideNote)
    #expect(ProviderID.hunter.note == Copy.hunterAllowanceNote)
    #expect(ProviderID.tavily.note == Copy.tavilyScopeNote)
    #expect(ProviderID.apollo.note == Copy.apolloAllowanceNote)
    #expect(ProviderID.prospeo.note == Copy.prospeoAccountNote)
    #expect(ProviderID.lemlist.note == nil)
    #expect(ProviderID("surfe").note == nil)
    #expect(ProviderID("not-a-tool").note == nil)
  }

  @Test func readGoesThroughTheDefinition() async throws {
    let transport = ScriptedTransport([.respond(status: 200, body: #"{"data":{"total_credits":10,"total_usage":4}}"#)])
    let balances = try await ProviderRegistry.current.definition(.openrouter)!.read("key", transport)
    #expect(balances == [PoolBalance(pool: OpenRouter.creditsPool, balance: 6)])
    #expect(ProviderRegistry.current.definition(ProviderID("not-a-tool")) == nil)
  }
}
