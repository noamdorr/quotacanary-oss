import Foundation

/// A provider defines an integration (how to read a balance). The id is a
/// string, persisted as-is in the state file, and resolved against the bundled
/// catalog plus the hand-written set through `ProviderRegistry.current`.
/// The five original ids stay as static members so existing state files and
/// call sites are unchanged.
public struct ProviderID: RawRepresentable, Hashable, Codable, Identifiable, Sendable, CaseIterable {
  public let rawValue: String

  public init(rawValue: String) { self.rawValue = rawValue }
  public init(_ rawValue: String) { self.rawValue = rawValue }

  public static let openrouter = ProviderID("openrouter")
  public static let hunter = ProviderID("hunter")
  public static let tavily = ProviderID("tavily")
  public static let apollo = ProviderID("apollo")
  public static let prospeo = ProviderID("prospeo")
  public static let lemlist = ProviderID("lemlist")
  public static let peopledatalabs = ProviderID("peopledatalabs")
  public static let phantombuster = ProviderID("phantombuster")
  public static let deepgram = ProviderID("deepgram")
  public static let webshare = ProviderID("webshare")
  public static let decodo = ProviderID("decodo")
  public static let brevo = ProviderID("brevo")
  public static let twilio = ProviderID("twilio")
  public static let plivo = ProviderID("plivo")
  public static let vonage = ProviderID("vonage")
  public static let dataforseo = ProviderID("dataforseo")
  public static let tomba = ProviderID("tomba")
  public static let snov = ProviderID("snov")
  public static let verifalia = ProviderID("verifalia")
  public static let predictleads = ProviderID("predictleads")
  public static let crawlbase = ProviderID("crawlbase")
  public static let hyperbolic = ProviderID("hyperbolic")
  public static let orthogonal = ProviderID("orthogonal")
  public static let zerobounce = ProviderID("zerobounce")
  public static let rocketreach = ProviderID("rocketreach")
  public static let enrichcrm = ProviderID("enrichcrm")
  public static let majestic = ProviderID("majestic")
  public static let mangools = ProviderID("mangools")
  public static let semrush = ProviderID("semrush")
  public static let ahrefs = ProviderID("ahrefs")
  public static let diffbot = ProviderID("diffbot")
  public static let netnut = ProviderID("netnut")
  public static let contactout = ProviderID("contactout")
  public static let meltly = ProviderID("meltly")
  public static let deepseek = ProviderID("deepseek")
  public static let firecrawl = ProviderID("firecrawl")
  public static let apify = ProviderID("apify")
  public static let youcom = ProviderID("youcom")
  public static let hlrlookup = ProviderID("hlrlookup")
  public static let icypeas = ProviderID("icypeas")
  public static let thecompaniesapi = ProviderID("thecompaniesapi")
  public static let treg = ProviderID("treg")

  public var id: String { rawValue }

  /// Every provider the picker offers, alphabetical by display name.
  public static var allCases: [ProviderID] { ProviderRegistry.current.ids }

  public var displayName: String { ProviderRegistry.current.displayName(self) }

  /// Where to buy more credits; nil hides "Top up".
  public var topupURL: URL? { ProviderRegistry.current.topupURL(self) }

  /// The pools this provider is expected to report. Each stays visible (and
  /// configurable) even when a reading omits it.
  public var pools: [Pool] { ProviderRegistry.current.pools(self) }

  /// Provider defaults; see `ProviderRegistry.defaultSettings`.
  public var defaultSettings: PoolSettings { ProviderRegistry.current.defaultSettings(self) }

  /// Empty unless the credential takes more than one value (QUO-251).
  public var credentialFields: [CredentialField] { ProviderRegistry.current.credentialFields(self) }

  /// One line under a connected provider's rows, when it has one.
  public var note: String? { ProviderRegistry.current.note(self) }

  /// What a connect or replace-key form stores: the bare key, or for a
  /// multi-value credential the JSON of `inputs` ("" when a field is blank,
  /// which reads as a missing key).
  public func credential(key: String, inputs: [String: String]) -> String {
    let fields = credentialFields
    return fields.isEmpty ? key : CredentialFields.secret(fields, values: inputs) ?? ""
  }
}

public enum CreditUnit: String, Codable, Equatable, Sendable {
  case usd
  /// Euros (Vonage's balance on the web, read by the hosted path). Never
  /// added to or compared with dollars.
  case eur
  case credits
  /// Talk time (Apollo's dialer). Never added to or compared with credits.
  case minutes
  /// Data volume (the catalog schema allows it; no bundled tool uses it yet).
  case gb
}

/// A pool is a separately identified allowance within a connection.
/// `creditType` is its stable id. `cap` is nil when the provider has no quota.
public struct Pool: Codable, Equatable, Sendable {
  public var creditType: String
  public var label: String
  public var unit: CreditUnit
  public var cap: Double?

  public init(creditType: String, label: String, unit: CreditUnit, cap: Double?) {
    self.creditType = creditType
    self.label = label
    self.unit = unit
    self.cap = cap
  }
}

public struct PoolBalance: Codable, Equatable, Sendable {
  public var pool: Pool
  public var balance: Double

  public init(pool: Pool, balance: Double) {
    self.pool = pool
    self.balance = balance
  }
}

/// A reading is a timestamped set of pool balances from one successful check.
public struct Reading: Codable, Equatable, Sendable {
  public var balances: [PoolBalance]
  public var checkedAt: Date

  public init(balances: [PoolBalance], checkedAt: Date) {
    self.balances = balances
    self.checkedAt = checkedAt
  }
}

/// A connection is one named credential set for a provider. The credential
/// itself lives in the credential store; only its reference is kept here.
public struct Connection: Codable, Equatable, Identifiable, Sendable {
  public var id: String
  public var provider: ProviderID
  public var name: String
  public var credentialRef: String
  public var lastReading: Reading?
  /// Saved per-pool choices keyed by `creditType`. A pool with no entry uses
  /// the provider defaults. Independent of whether a reading reports the pool.
  public var poolSettings: [String: PoolSettings]
  /// Per-pool notification high-water marks keyed by `creditType` (QUO-131).
  /// A pool with no entry has not been alerted in its current cycle.
  public var alertMarks: [String: AlertSeverity]
  /// Consecutive attempted check failures and which monitoring alerts this
  /// incident already sent (QUO-133). Survives a relaunch.
  public var monitoring: MonitoringState
  /// The balances shown, in panel, stack and alerts, by `creditType` (QUO-283).
  /// Nil watches every balance, including one a later read adds.
  public var watchedCreditTypes: [String]?
  /// "Mute until it changes" (QUO-351): the balance each muted pool was
  /// muted at, by `creditType`. Muted only while the reading still equals it.
  public var mutedAt: [String: Double]

  public init(
    id: String, provider: ProviderID, name: String, credentialRef: String, lastReading: Reading?,
    poolSettings: [String: PoolSettings] = [:], alertMarks: [String: AlertSeverity] = [:],
    monitoring: MonitoringState = MonitoringState(), watchedCreditTypes: [String]? = nil,
    mutedAt: [String: Double] = [:]
  ) {
    self.id = id
    self.provider = provider
    self.name = name
    self.credentialRef = credentialRef
    self.lastReading = lastReading
    self.poolSettings = poolSettings
    self.alertMarks = alertMarks
    self.monitoring = monitoring
    self.watchedCreditTypes = watchedCreditTypes
    self.mutedAt = mutedAt
  }

  // State files written before pool settings existed have no `poolSettings`.
  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    id = try c.decode(String.self, forKey: .id)
    provider = try c.decode(ProviderID.self, forKey: .provider)
    name = try c.decode(String.self, forKey: .name)
    credentialRef = try c.decode(String.self, forKey: .credentialRef)
    lastReading = try c.decodeIfPresent(Reading.self, forKey: .lastReading)
    poolSettings = try c.decodeIfPresent([String: PoolSettings].self, forKey: .poolSettings) ?? [:]
    // State files written before alerts existed have no `alertMarks`.
    alertMarks = try c.decodeIfPresent([String: AlertSeverity].self, forKey: .alertMarks) ?? [:]
    // State files written before QUO-133 have no `monitoring`: zero failures.
    monitoring = try c.decodeIfPresent(MonitoringState.self, forKey: .monitoring) ?? MonitoringState()
    // State files written before QUO-283 have no `watchedCreditTypes`: everything watched.
    watchedCreditTypes = try c.decodeIfPresent([String].self, forKey: .watchedCreditTypes)
    // State files written before QUO-351 have no `mutedAt`: nothing muted.
    mutedAt = try c.decodeIfPresent([String: Double].self, forKey: .mutedAt) ?? [:]
  }

  private enum CodingKeys: String, CodingKey {
    case id, provider, name, credentialRef, lastReading, poolSettings, alertMarks, monitoring
    case watchedCreditTypes, mutedAt
  }

  // Nothing muted writes no `mutedAt`, so older state files re-encode unchanged.
  public func encode(to encoder: Encoder) throws {
    var c = encoder.container(keyedBy: CodingKeys.self)
    try c.encode(id, forKey: .id)
    try c.encode(provider, forKey: .provider)
    try c.encode(name, forKey: .name)
    try c.encode(credentialRef, forKey: .credentialRef)
    try c.encodeIfPresent(lastReading, forKey: .lastReading)
    try c.encode(poolSettings, forKey: .poolSettings)
    try c.encode(alertMarks, forKey: .alertMarks)
    try c.encode(monitoring, forKey: .monitoring)
    try c.encodeIfPresent(watchedCreditTypes, forKey: .watchedCreditTypes)
    if !mutedAt.isEmpty { try c.encode(mutedAt, forKey: .mutedAt) }
  }
}

public enum Format {
  /// Numbers follow the system locale (QUO-356); only the currency code is the vendor's.
  public static func balance(_ value: Double, unit: CreditUnit, locale: Locale = .autoupdatingCurrent) -> String {
    switch unit {
    case .usd: return value.formatted(.currency(code: "USD").locale(locale))
    case .eur: return value.formatted(.currency(code: "EUR").locale(locale))
    case .credits: return number(value, locale)
    case .minutes: return Copy.minutes(number(value, locale))
    case .gb: return Copy.gigabytes(number(value, locale))
    }
  }

  /// "480 of 1,000" when the pool has a cap, else just the amount. Minutes
  /// carry the unit once: "488 of 500 min".
  public static func amount(_ value: Double, pool: Pool, locale: Locale = .autoupdatingCurrent) -> String {
    guard let cap = pool.cap else { return balance(value, unit: pool.unit, locale: locale) }
    if pool.unit == .minutes { return Copy.minutes(Copy.ofCap(number(value, locale), number(cap, locale))) }
    return Copy.ofCap(balance(value, unit: pool.unit, locale: locale), balance(cap, unit: pool.unit, locale: locale))
  }

  /// The unit name next to a threshold field.
  public static func unitName(_ unit: CreditUnit) -> String {
    switch unit {
    case .usd: return Copy.unitUSD
    case .eur: return Copy.unitEUR
    case .credits: return Copy.unitCredits
    case .minutes: return Copy.unitMinutes
    case .gb: return Copy.unitGB
    }
  }

  private static func number(_ value: Double, _ locale: Locale) -> String {
    value.formatted(.number.locale(locale).precision(.fractionLength(0...2)))
  }
}
