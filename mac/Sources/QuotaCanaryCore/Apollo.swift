import Foundation

/// Port of src/lib/adapters/apollo.ts. Apollo documents its credit usage
/// stats as a POST with no parameters; it costs 0 credits and only reads the
/// team's own totals. No enrichment or other paid endpoint is ever called.
public enum Apollo: HandWrittenProvider {
  public static let id: ProviderID = .apollo
  public static let name = "Apollo"
  public static let topupURL = "https://app.apollo.io/#/settings/plans/upgrade"
  // Apollo's catalog defaults cover every pool, dialer minutes included.
  public static let defaultSettings = PoolSettings(monitored: true, low: 1500, critical: 500)
  public static let note: String? = Copy.apolloAllowanceNote

  public static let usageURL = URL(string: "https://api.apollo.io/api/v1/usage_stats/credit_usage_stats")!

  /// Dialer talk time is minutes, not credits. Every other type is credits.
  static let dialerCreditType = "dialer"

  /// The four pools a GTM stack watches (the web catalog). Any other funded
  /// pool Apollo returns is appended after these.
  public static let pools = ["lead_credit", "export_credit", "direct_dial_credit", "ai_credit"]
    .map { Pool(creditType: $0, label: label(for: $0), unit: .credits, cap: nil) }

  public static func read(key: String, transport: ProviderTransport) async throws -> [PoolBalance] {
    let response: HTTPResponse
    do {
      response = try await transport.post(
        usageURL, headers: ["Accept": "application/json", "x-api-key": key]
      )
    } catch {
      throw ProviderReadError.unreachable
    }
    return try parse(response)
  }

  public static func parse(_ response: HTTPResponse) throws -> [PoolBalance] {
    if response.status == 401 { throw ProviderReadError.keyRejected }
    // Apollo's 403: a valid key whose scope does not include this endpoint.
    if response.status == 403 { throw ProviderReadError.keyLacksScope }
    if response.status == 429 { throw ProviderReadError.rateLimited }
    guard (200..<300).contains(response.status) else {
      throw ProviderReadError.httpStatus(response.status)
    }
    guard let json = try? JSONSerialization.jsonObject(with: response.body) else {
      throw ProviderReadError.notJSON
    }
    guard let stats = (json as? [String: Any])?["credit_usage_stats"] as? [String: Any] else {
      throw ProviderReadError.missingField("credit_usage_stats")
    }
    // JSON objects are unordered once parsed: catalog pools first (the panel
    // orders them anyway), then the rest by id so every read is stable.
    let catalogIDs = pools.map(\.creditType)
    let order = catalogIDs.filter { stats[$0] != nil } + stats.keys.filter { !catalogIDs.contains($0) }.sorted()
    let balances = order.compactMap { creditType in
      balance(creditType, stats[creditType] as? [String: Any], inCatalog: catalogIDs.contains(creditType))
    }
    guard balances.contains(where: { $0.pool.cap != 0 }) else {
      throw ProviderReadError.missingField("credit_usage_stats")
    }
    return balances
  }

  /// Prefers Apollo's reported `left_over`; falls back to limit - consumed only
  /// when both are present. A limit of 0 means the plan does not include the
  /// pool: a catalog pool stays as a zero-cap allowance (never alerts), any
  /// other is dropped, since Apollo returns every credit type it has.
  static func balance(_ creditType: String, _ stat: [String: Any]?, inCatalog: Bool) -> PoolBalance? {
    guard let stat else { return nil }
    let limit = ProviderJSON.finiteOrNil(stat["limit"])
    let unit: CreditUnit = creditType == dialerCreditType ? .minutes : .credits
    let pool = Pool(creditType: creditType, label: label(for: creditType), unit: unit, cap: limit)
    if limit == 0 { return inCatalog ? PoolBalance(pool: pool, balance: 0) : nil }

    let consumed = ProviderJSON.finiteOrNil(stat["consumed"])
    let remaining = ProviderJSON.finiteOrNil(stat["left_over"])
      ?? limit.flatMap { l in consumed.map { max(l - $0, 0) } }
    guard let remaining else { return nil }
    return PoolBalance(pool: pool, balance: remaining)
  }

  /// Apollo's own key, humanized, as the web does: "direct_dial_credit" is
  /// "Direct Dial Credits". Only casing a naive title-case gets wrong is fixed.
  static func label(for creditType: String) -> String {
    if creditType == dialerCreditType { return Copy.apolloDialerPoolLabel }
    var base = creditType
    if base.hasSuffix("_credit") { base.removeLast("_credit".count) }
    let words = base.split(separator: "_").map { word -> String in
      word == "ai" ? "AI" : word.prefix(1).uppercased() + word.dropFirst()
    }
    guard !words.isEmpty else { return creditType }
    return Copy.apolloCreditsLabel(words.joined(separator: " "))
  }
}
