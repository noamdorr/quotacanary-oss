import Foundation

/// Port of src/lib/adapters/crawlbase.ts. Read-only: one GET per check.
/// Crawlbase's Account API takes a token plus a product slug, so the stored
/// secret is the two-field JSON (`CredentialFields`). One pool, the remaining
/// monthly credits of that subscription product, labeled with its name.
public enum Crawlbase: HandWrittenProvider {
  public static let id: ProviderID = .crawlbase
  public static let name = "Crawlbase"
  public static let topupURL = "https://crawlbase.com/pricing"
  // Crawlbase's seed row: critical 250, low 750.
  public static let defaultSettings = PoolSettings(monitored: true, low: 750, critical: 250)

  public static let fields = [
    CredentialField(name: "token", label: Copy.crawlbaseTokenLabel, isSecret: true),
    CredentialField(name: "product", label: Copy.crawlbaseProductLabel, isSecret: false),
  ]

  public static let creditsPool = Pool(creditType: "credits", label: Copy.creditsPoolLabel, unit: .credits, cap: nil)
  public static let pools = [creditsPool]

  /// The product slugs the Account API accepts, with the web's labels.
  static let productLabels = [
    "crawling-api": "Crawling API",
    "crawler": "Enterprise Crawler",
    "smartproxy": "Smart AI Proxy",
    "scraper-api": "Scraper API",
    "leads-api": "Leads API",
    "screenshot-api": "Screenshots API",
  ]

  /// SECURITY: Crawlbase documents token auth as a query parameter only, so
  /// the token can surface in vendor request logs, as on the web.
  public static func accountURL(token: String, product: String) -> URL {
    URL(string: "https://api.crawlbase.com/account?token=\(CredentialFields.pathSegment(token))&product=\(CredentialFields.pathSegment(product))")!
  }

  public static func read(key: String, transport: ProviderTransport) async throws -> [PoolBalance] {
    // A secret without both values, or with a product Crawlbase does not
    // have, is never sent anywhere.
    guard let (token, product) = CredentialFields.pair(key, "token", "product"), productLabels[product] != nil else {
      throw ProviderReadError.keyRejected
    }
    let response: HTTPResponse
    do {
      response = try await transport.get(accountURL(token: token, product: product), headers: [:])
    } catch {
      throw ProviderReadError.unreachable
    }
    return try parse(response, product: product)
  }

  public static func parse(_ response: HTTPResponse, product: String) throws -> [PoolBalance] {
    if response.status == 401 || response.status == 403 { throw ProviderReadError.keyRejected }
    if response.status == 429 { throw ProviderReadError.rateLimited }
    guard (200..<300).contains(response.status) else {
      throw ProviderReadError.httpStatus(response.status)
    }
    guard let json = try? JSONSerialization.jsonObject(with: response.body) else {
      throw ProviderReadError.notJSON
    }
    // `remainingCredits` arrives as a numeric string ("8800").
    guard let balance = ProviderJSON.finiteOrNil((json as? [String: Any])?["remainingCredits"]) else {
      throw ProviderReadError.missingField("remainingCredits")
    }
    var pool = creditsPool
    if let name = productLabels[product] { pool.label = "\(name) \(Copy.creditsPoolLabel)" }
    return [PoolBalance(pool: pool, balance: balance)]
  }
}
