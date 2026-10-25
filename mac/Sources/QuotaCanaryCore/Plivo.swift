import Foundation

/// Port of src/lib/adapters/plivo.ts. Read-only: one GET per check.
/// Plivo authenticates with HTTP Basic over two values (Auth ID as username,
/// Auth token as password) and puts the Auth ID in the path, so the stored
/// secret is the two-field JSON (`CredentialFields`). One pool, the cash
/// credit balance in US dollars.
public enum Plivo: HandWrittenProvider {
  public static let id: ProviderID = .plivo
  public static let name = "Plivo"
  public static let topupURL = "https://console.plivo.com/billing/"
  // Plivo's seed row: critical 5, low 15, dollars.
  public static let defaultSettings = PoolSettings(monitored: true, low: 15, critical: 5)

  public static let fields = [
    CredentialField(name: "auth_id", label: Copy.plivoAuthIDLabel, isSecret: false),
    CredentialField(name: "auth_token", label: Copy.authTokenLabel, isSecret: true),
  ]

  public static let balancePool = Pool(
    creditType: "balance", label: Copy.balanceUSDPoolLabel, unit: .usd, cap: nil
  )
  public static let pools = [balancePool]

  public static func accountURL(authID: String) -> URL {
    URL(string: "https://api.plivo.com/v1/Account/\(CredentialFields.pathSegment(authID))/")!
  }

  public static func read(key: String, transport: ProviderTransport) async throws -> [PoolBalance] {
    // A secret without both values is never sent anywhere.
    guard let (authID, authToken) = CredentialFields.pair(key, "auth_id", "auth_token") else {
      throw ProviderReadError.keyRejected
    }
    let response: HTTPResponse
    do {
      response = try await transport.get(
        accountURL(authID: authID),
        headers: ["Accept": "application/json", "Authorization": CredentialFields.basic(authID, authToken)]
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
    // `cash_credits` is a decimal string in USD ("1.80900").
    guard let balance = ProviderJSON.finiteOrNil((json as? [String: Any])?["cash_credits"]) else {
      throw ProviderReadError.missingField("cash_credits")
    }
    return [PoolBalance(pool: balancePool, balance: balance)]
  }
}
