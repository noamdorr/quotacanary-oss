import Foundation

/// Every provider the app can read, as one list of `ProviderDefinition`s:
/// the hand-written providers (the shapes the catalog schema cannot express,
/// each conforming to `HandWrittenProvider`) plus every entry of the bundled
/// catalog. `ProviderID` looks its name, pools and defaults up here, so
/// adding a tool to catalog/tools.json needs no Swift, and a hand-written one
/// is its own file plus a line in `handWrittenProviders`.
public final class ProviderRegistry: Sendable {
  /// Built once from the bundled file. In a debug build a malformed catalog
  /// fails loudly (assertion); in release the picker falls back to the
  /// hand-written set and `catalogFailure` carries one diagnostic line.
  public static let current: ProviderRegistry = {
    let loaded = Catalog.load(bundledData: Catalog.bundledData())
    if case let .failure(error) = loaded { assertionFailure("catalog/tools.json: \(error.reason)") }
    return ProviderRegistry(catalog: loaded)
  }()

  /// The roll call of hand-written providers. Order does not matter: the
  /// picker sorts by name. `ProviderDefinitionTests` fails when one is missing.
  public static let handWrittenProviders: [any HandWrittenProvider.Type] = [
    OpenRouter.self, Tavily.self, Apollo.self, Lemlist.self, PeopleDataLabs.self, PhantomBuster.self, Deepgram.self,
    Webshare.self, Decodo.self, Brevo.self, Twilio.self, Plivo.self, Vonage.self, DataForSEO.self, Tomba.self,
    Snov.self, Verifalia.self, PredictLeads.self, Crawlbase.self, Hyperbolic.self, Orthogonal.self, ZeroBounce.self,
    RocketReach.self, EnrichCRM.self, Majestic.self, Mangools.self, Semrush.self, Ahrefs.self, Diffbot.self,
    NetNut.self, ContactOut.self, Meltly.self, DeepSeek.self, Firecrawl.self, Apify.self,
    YouCom.self,
  ]

  public static let handWritten: [ProviderID] = handWrittenProviders.map { $0.id }

  /// Catalog entries by id, in file order.
  public let entries: [CatalogEntry]
  public let catalogFailure: String?
  /// Hand-written first (roll-call order), then the catalog in file order.
  public let definitions: [ProviderDefinition]
  private let byID: [ProviderID: ProviderDefinition]
  private let entriesByID: [ProviderID: CatalogEntry]
  /// Alphabetical by display name, case-insensitively, so the picker reads
  /// top to bottom.
  public let ids: [ProviderID]

  public init(catalog: Result<Catalog, CatalogError>) {
    switch catalog {
    case let .success(loaded):
      entries = loaded.tools
      catalogFailure = nil
    case let .failure(error):
      entries = []
      catalogFailure = error.reason
    }
    definitions = Self.handWrittenProviders.map { ProviderDefinition($0) } + entries.map { ProviderDefinition(catalog: $0) }
    // A hand-written provider wins over a catalog entry with the same id;
    // the contract test keeps that from happening.
    byID = Dictionary(definitions.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
    entriesByID = Dictionary(uniqueKeysWithValues: entries.map { (ProviderID($0.id), $0) })
    ids = definitions.sorted { a, b in
      let left = a.name.lowercased()
      let right = b.name.lowercased()
      return left == right ? a.id.rawValue < b.id.rawValue : left < right
    }.map(\.id)
  }

  /// Nil for a provider this build does not know (a state file written by a
  /// newer release).
  public func definition(_ id: ProviderID) -> ProviderDefinition? { byID[id] }

  /// The catalog entry behind a catalog provider; nil for a hand-written one.
  public func entry(_ id: ProviderID) -> CatalogEntry? { entriesByID[id] }

  public func isKnown(_ id: ProviderID) -> Bool { byID[id] != nil }

  /// Falls back to the raw id for an unknown provider.
  public func displayName(_ id: ProviderID) -> String { byID[id]?.name ?? id.rawValue }

  /// Nil hides "Top up".
  public func topupURL(_ id: ProviderID) -> URL? { byID[id]?.topupURL }

  public func pools(_ id: ProviderID) -> [Pool] { byID[id]?.pools ?? [] }

  public func defaultSettings(_ id: ProviderID) -> PoolSettings {
    byID[id]?.defaultSettings ?? ProviderDefinition.creditsDefaults
  }

  public func credentialFields(_ id: ProviderID) -> [CredentialField] { byID[id]?.credentialFields ?? [] }

  public func note(_ id: ProviderID) -> String? { byID[id]?.note }
}
