import Foundation

/// Port of src/lib/adapters/snov.ts. Read-only: two calls per check. Snov.io
/// exchanges a client ID and client secret for a short-lived access token
/// (POST, the OAuth client-credentials grant), then reads the balance with
/// it. The stored secret is the two-field JSON (`CredentialFields`). One pool.
public enum Snov: HandWrittenProvider {
  public static let id: ProviderID = .snov
  public static let name = "Snov.io"
  public static let topupURL = "https://app.snov.io/billing"
  // Snov.io's seed row: critical 500, low 1500 (3x).
  public static let defaultSettings = PoolSettings(monitored: true, low: 1500, critical: 500)

  public static let tokenURL = URL(string: "https://api.snov.io/v1/oauth/access_token")!
  public static let balanceURL = URL(string: "https://api.snov.io/v1/get-balance")!

  public static let fields = [
    CredentialField(name: "clientId", label: Copy.snovUserIDLabel, isSecret: false),
    CredentialField(name: "clientSecret", label: Copy.snovSecretLabel, isSecret: true),
  ]

  public static let creditsPool = Pool(creditType: "credits", label: Copy.creditsPoolLabel, unit: .credits, cap: nil)
  public static let pools = [creditsPool]

  public static func read(key: String, transport: ProviderTransport) async throws -> [PoolBalance] {
    // A secret without both values is never sent anywhere.
    guard let (clientID, clientSecret) = CredentialFields.pair(key, "clientId", "clientSecret") else {
      throw ProviderReadError.keyRejected
    }
    let token: String
    do {
      let response = try await transport.post(
        tokenURL,
        headers: ["Content-Type": "application/x-www-form-urlencoded"],
        body: tokenBody(clientID: clientID, clientSecret: clientSecret)
      )
      token = try parseToken(response)
    } catch let error as ProviderReadError {
      throw error
    } catch {
      throw ProviderReadError.unreachable
    }
    let response: HTTPResponse
    do {
      response = try await transport.get(balanceURL, headers: ["Authorization": "Bearer \(token)"])
    } catch {
      throw ProviderReadError.unreachable
    }
    return try parseBalance(response)
  }

  /// The form body `URLSearchParams` builds on the web.
  static func tokenBody(clientID: String, clientSecret: String) -> Data {
    let pairs = [("grant_type", "client_credentials"), ("client_id", clientID), ("client_secret", clientSecret)]
    return Data(pairs.map { "\(formEncode($0.0))=\(formEncode($0.1))" }.joined(separator: "&").utf8)
  }

  /// application/x-www-form-urlencoded: space as `+`, `*-._` and
  /// alphanumerics kept, everything else percent-encoded.
  private static func formEncode(_ value: String) -> String {
    let kept = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789*-._ ")
    return (value.addingPercentEncoding(withAllowedCharacters: kept) ?? value).replacingOccurrences(of: " ", with: "+")
  }

  public static func parseToken(_ response: HTTPResponse) throws -> String {
    try check(response)
    guard let json = try? JSONSerialization.jsonObject(with: response.body) else {
      throw ProviderReadError.notJSON
    }
    let token = ((json as? [String: Any])?["access_token"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    guard !token.isEmpty else { throw ProviderReadError.missingField("access_token") }
    return token
  }

  public static func parseBalance(_ response: HTTPResponse) throws -> [PoolBalance] {
    try check(response)
    guard let json = try? JSONSerialization.jsonObject(with: response.body) else {
      throw ProviderReadError.notJSON
    }
    let object = json as? [String: Any]
    if object?["success"] as? Bool == false {
      throw ProviderReadError.reportedError(object?["message"] as? String)
    }
    // `balance` is a decimal string ("25000.00").
    guard let balance = ProviderJSON.finiteOrNil((object?["data"] as? [String: Any])?["balance"]) else {
      throw ProviderReadError.missingField("data.balance")
    }
    return [PoolBalance(pool: creditsPool, balance: balance)]
  }

  private static func check(_ response: HTTPResponse) throws {
    if response.status == 401 || response.status == 403 { throw ProviderReadError.keyRejected }
    if response.status == 429 { throw ProviderReadError.rateLimited }
    guard (200..<300).contains(response.status) else {
      throw ProviderReadError.httpStatus(response.status)
    }
  }
}
