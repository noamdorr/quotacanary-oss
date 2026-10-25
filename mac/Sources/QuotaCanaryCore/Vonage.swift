import Foundation

/// Port of src/lib/adapters/vonage.ts. Read-only: one GET per check.
/// Vonage authenticates with HTTP Basic over two values (API key as username,
/// API secret as password), so the stored secret is the two-field JSON
/// (`CredentialFields`). One pool, the account balance in euros.
public enum Vonage: HandWrittenProvider {
  public static let id: ProviderID = .vonage
  public static let name = "Vonage"
  public static let topupURL = "https://dashboard.nexmo.com/billing-and-payments"
  // Vonage's seed row: critical 5, low 15, euros.
  public static let defaultSettings = PoolSettings(monitored: true, low: 15, critical: 5)

  public static let balanceURL = URL(string: "https://rest.nexmo.com/account/get-balance")!

  public static let fields = [
    CredentialField(name: "api_key", label: Copy.vonageAPIKeyLabel, isSecret: false),
    CredentialField(name: "api_secret", label: Copy.vonageAPISecretLabel, isSecret: true),
  ]

  public static let balancePool = Pool(
    creditType: "balance", label: Copy.balanceEURPoolLabel, unit: .eur, cap: nil
  )
  public static let pools = [balancePool]

  public static func read(key: String, transport: ProviderTransport) async throws -> [PoolBalance] {
    // A secret without both values is never sent anywhere.
    guard let (apiKey, apiSecret) = CredentialFields.pair(key, "api_key", "api_secret") else {
      throw ProviderReadError.keyRejected
    }
    let response: HTTPResponse
    do {
      response = try await transport.get(
        balanceURL,
        headers: ["Accept": "application/json", "Authorization": CredentialFields.basic(apiKey, apiSecret)]
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
    // `value` is the account balance in EUR (a number).
    guard let balance = ProviderJSON.finiteOrNil((json as? [String: Any])?["value"]) else {
      throw ProviderReadError.missingField("value")
    }
    return [PoolBalance(pool: balancePool, balance: balance)]
  }
}
