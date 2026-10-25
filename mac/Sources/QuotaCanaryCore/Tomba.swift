import Foundation

/// Port of src/lib/adapters/tomba.ts. Read-only: one GET per check.
/// Tomba authenticates with two headers (API key and API secret), so the
/// stored secret is the two-field JSON (`CredentialFields`). Four pools, each
/// `available` with `available + used` as its cap; a pool the account does
/// not report is omitted.
public enum Tomba: HandWrittenProvider {
  public static let id: ProviderID = .tomba
  public static let name = "Tomba"
  public static let topupURL = "https://app.tomba.io/billing"
  // Tomba's seed row: critical 500, low 1500 (3x).
  public static let defaultSettings = PoolSettings(monitored: true, low: 1500, critical: 500)

  public static let meURL = URL(string: "https://api.tomba.io/v1/me")!

  public static let fields = [
    CredentialField(name: "key", label: Copy.apiKeyLabel, isSecret: false),
    CredentialField(name: "secret", label: Copy.apiSecretLabel, isSecret: true),
  ]

  public static let searchesPool = Pool(creditType: "searches", label: Copy.tombaSearchesPoolLabel, unit: .credits, cap: nil)
  public static let verificationsPool = Pool(
    creditType: "verifications", label: Copy.tombaVerificationsPoolLabel, unit: .credits, cap: nil
  )
  public static let phonesPool = Pool(creditType: "phones", label: Copy.tombaPhonesPoolLabel, unit: .credits, cap: nil)
  public static let b2bPool = Pool(creditType: "b2b", label: Copy.tombaB2BPoolLabel, unit: .credits, cap: nil)
  public static let pools = [searchesPool, verificationsPool, phonesPool, b2bPool]

  /// Each pool and the `data.requests` key it reads.
  private static let fieldsByPool: [(Pool, String)] = [
    (searchesPool, "domains"), (verificationsPool, "verifications"), (phonesPool, "phones"), (b2bPool, "b2b"),
  ]

  public static func read(key: String, transport: ProviderTransport) async throws -> [PoolBalance] {
    // A secret without both values is never sent anywhere.
    guard let (apiKey, apiSecret) = CredentialFields.pair(key, "key", "secret") else {
      throw ProviderReadError.keyRejected
    }
    let response: HTTPResponse
    do {
      response = try await transport.get(meURL, headers: ["X-Tomba-Key": apiKey, "X-Tomba-Secret": apiSecret])
    } catch {
      throw ProviderReadError.unreachable
    }
    return try parse(response)
  }

  public static func parse(_ response: HTTPResponse) throws -> [PoolBalance] {
    if response.status == 401 || response.status == 403 { throw ProviderReadError.keyRejected }
    if response.status == 429 { throw ProviderReadError.rateLimited }
    guard (200..<300).contains(response.status) else {
      throw ProviderReadError.httpStatus(response.status)
    }
    guard let json = try? JSONSerialization.jsonObject(with: response.body) else {
      throw ProviderReadError.notJSON
    }
    let requests = ((json as? [String: Any])?["data"] as? [String: Any])?["requests"] as? [String: Any]
    var balances: [PoolBalance] = []
    for (pool, field) in fieldsByPool {
      let usage = requests?[field] as? [String: Any]
      guard let available = ProviderJSON.finiteOrNil(usage?["available"]) else { continue }
      var capped = pool
      // The web's `limit || null`: a total of 0 is no cap (here cap 0 would
      // mean "not in plan").
      if let used = ProviderJSON.finiteOrNil(usage?["used"]), available + used != 0 { capped.cap = available + used }
      balances.append(PoolBalance(pool: capped, balance: available))
    }
    guard !balances.isEmpty else { throw ProviderReadError.missingField("data.requests") }
    return balances
  }
}
