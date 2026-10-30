import Foundation

/// One provider in one place: what the picker shows, where "Top up" goes,
/// which pools a connection expects, what a new connection starts with,
/// what the connect form asks for, and how a balance is read. Two adapters
/// build one: a catalog entry (`init(catalog:)`) and a hand-written provider
/// (`init(_:)` over `HandWrittenProvider`). `ProviderRegistry` holds the list.
public struct ProviderDefinition: Sendable {
  public typealias Read = @Sendable (_ key: String, _ transport: ProviderTransport) async throws -> [PoolBalance]

  public let id: ProviderID
  /// Display name, also used in error copy.
  public let name: String
  /// Where to buy more credits; nil hides "Top up".
  public let topupURL: URL?
  /// The pools a provider is expected to report. Each stays visible (and
  /// configurable) even when a reading omits it. Empty when the pools are
  /// discovered from the reading (Deepgram).
  public let pools: [Pool]
  public let defaultSettings: PoolSettings
  /// The inputs of a credential that takes more than one value (QUO-251).
  /// Empty for every single-key provider, catalog entries included.
  public let credentialFields: [CredentialField]
  /// One line under a connected provider's rows, when it has one.
  public let note: String?
  public let read: Read

  /// The catalog carries no thresholds yet (QUO-193), so its entries get the
  /// web's common 500 / 1500 for credits and OpenRouter's 5 / 15 for dollar
  /// balances. An id this build does not know gets the credits pair too.
  static let creditsDefaults = PoolSettings(monitored: true, low: 1500, critical: 500)
  static let dollarDefaults = PoolSettings(monitored: true, low: 15, critical: 5)

  /// Notes for catalog providers. The catalog has no field for them (its
  /// shape is shared with the web), so the two that have one live here.
  static let catalogNotes: [ProviderID: String] = [
    .hunter: Copy.hunterAllowanceNote,
    .prospeo: Copy.prospeoAccountNote,
  ]

  public init(catalog entry: CatalogEntry) {
    id = ProviderID(entry.id)
    name = entry.name
    topupURL = entry.topupUrl.flatMap(URL.init(string:))
    pools = entry.pools.map { Pool(creditType: $0.creditType, label: $0.label, unit: $0.unit, cap: nil) }
    defaultSettings = entry.pools.first?.unit == .usd ? Self.dollarDefaults : Self.creditsDefaults
    credentialFields = []
    note = Self.catalogNotes[id]
    read = { key, transport in try await CatalogProvider.read(entry, key: key, transport: transport) }
  }

  public init(_ provider: any HandWrittenProvider.Type) {
    id = provider.id
    name = provider.name
    topupURL = URL(string: provider.topupURL)
    pools = provider.pools
    defaultSettings = provider.defaultSettings
    credentialFields = provider.fields
    note = provider.note
    read = Self.reader(provider)
  }

  /// Opens the existential so the closure captures the type, not a boxed
  /// metatype (which is not Sendable).
  private static func reader<P: HandWrittenProvider>(_: P.Type) -> Read {
    { key, transport in try await P.read(key: key, transport: transport) }
  }
}

/// A provider the catalog schema cannot express, ported by hand from its
/// `src/lib/adapters/*.ts`. Each is an enum of statics; the registry's
/// `handWrittenProviders` list is its roll call, and `ProviderDefinitionTests`
/// is the contract. `topupURL` and the defaults mirror the hosted tools table
/// (supabase/seed.sql: critical is `default_alert_threshold`, low the 3x
/// backfill rule unless the seed row sets it).
public protocol HandWrittenProvider: SendableMetatype {
  static var id: ProviderID { get }
  static var name: String { get }
  static var topupURL: String { get }
  static var pools: [Pool] { get }
  static var defaultSettings: PoolSettings { get }
  /// Empty unless the credential takes more than one value.
  static var fields: [CredentialField] { get }
  static var note: String? { get }
  static func read(key: String, transport: ProviderTransport) async throws -> [PoolBalance]
}

public extension HandWrittenProvider {
  static var fields: [CredentialField] { [] }
  static var note: String? { nil }
}
