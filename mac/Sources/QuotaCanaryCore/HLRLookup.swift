import Foundation

/// Port of src/lib/adapters/hlrlookup.ts. Read-only: one POST per check, the
/// endpoint HLR Lookup documents for the balance. The API key and API secret
/// both travel in the JSON body, so the stored secret is the two-field JSON
/// (`CredentialFields`). One pool, `body.Credits`, trusted only when
/// `body.Status` is "OK".
public enum HLRLookup: HandWrittenProvider {
  public static let id: ProviderID = .hlrlookup
  public static let name = "HLR Lookup"
  public static let topupURL = "https://www.hlrlookup.com/pricing"
  // HLR Lookup's seed row (migration 094): critical 100, low 300.
  public static let defaultSettings = PoolSettings(monitored: true, low: 300, critical: 100)

  public static let fields = [
    CredentialField(name: "api_key", label: Copy.apiKeyLabel, isSecret: false),
    CredentialField(name: "api_secret", label: Copy.apiSecretLabel, isSecret: true),
  ]

  public static let balanceURL = URL(string: "https://api.hlrlookup.com/apiv2/balance")!

  public static let creditsPool = Pool(creditType: "credits", label: Copy.creditsPoolLabel, unit: .credits, cap: nil)
  public static let pools = [creditsPool]

  public static func read(key: String, transport: ProviderTransport) async throws -> [PoolBalance] {
    // A secret without both values is never sent anywhere.
    guard let (apiKey, apiSecret) = CredentialFields.pair(key, "api_key", "api_secret") else {
      throw ProviderReadError.keyRejected
    }
    let body = try? JSONSerialization.data(
      withJSONObject: ["api_key": apiKey, "api_secret": apiSecret], options: [.sortedKeys, .withoutEscapingSlashes]
    )
    let response: HTTPResponse
    do {
      response = try await transport.post(
        balanceURL, headers: ["Accept": "application/json", "Content-Type": "application/json"], body: body
      )
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
    let body = (json as? [String: Any])?["body"] as? [String: Any]
    guard body?["Status"] as? String == "OK" else { throw ProviderReadError.missingField("body.Status") }
    guard let balance = ProviderJSON.finiteOrNil(body?["Credits"]) else {
      throw ProviderReadError.missingField("body.Credits")
    }
    return [PoolBalance(pool: creditsPool, balance: balance)]
  }
}
