import Foundation

/// Port of src/lib/adapters/verifalia.ts. Read-only: one GET per check.
/// Verifalia authenticates with HTTP Basic over two values (API username and
/// password), so the stored secret is the two-field JSON
/// (`CredentialFields`). Credit packs always; free daily credits (they reset)
/// only on plans that have them.
public enum Verifalia: HandWrittenProvider {
  public static let id: ProviderID = .verifalia
  public static let name = "Verifalia"
  public static let topupURL = "https://verifalia.com/client-area"
  // Verifalia's seed row: critical 1000, low 3000.
  public static let defaultSettings = PoolSettings(monitored: true, low: 3000, critical: 1000)

  public static let balanceURL = URL(string: "https://api.verifalia.com/v2.7/credits/balance")!

  public static let fields = [
    CredentialField(name: "username", label: Copy.apiUsernameLabel, isSecret: false),
    CredentialField(name: "password", label: Copy.apiPasswordLabel, isSecret: true),
  ]

  public static let creditPacksPool = Pool(
    creditType: "credit_packs", label: Copy.verifaliaCreditPacksPoolLabel, unit: .credits, cap: nil
  )
  public static let freeDailyPool = Pool(
    creditType: "free_daily", label: Copy.verifaliaFreeDailyPoolLabel, unit: .credits, cap: nil
  )
  public static let pools = [creditPacksPool, freeDailyPool]

  public static func read(key: String, transport: ProviderTransport) async throws -> [PoolBalance] {
    // A secret without both values is never sent anywhere.
    guard let (username, password) = CredentialFields.pair(key, "username", "password") else {
      throw ProviderReadError.keyRejected
    }
    let response: HTTPResponse
    do {
      response = try await transport.get(
        balanceURL,
        headers: ["Accept": "application/json", "Authorization": CredentialFields.basic(username, password)]
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
    let object = json as? [String: Any]
    if let message = object?["message"] as? String, !message.isEmpty {
      throw ProviderReadError.reportedError(message)
    }
    guard let creditPacks = ProviderJSON.finiteOrNil(object?["creditPacks"]) else {
      throw ProviderReadError.missingField("creditPacks")
    }
    var balances = [PoolBalance(pool: creditPacksPool, balance: creditPacks)]
    if let free = ProviderJSON.finiteOrNil(object?["freeCredits"]) {
      balances.append(PoolBalance(pool: freeDailyPool, balance: free))
    }
    return balances
  }
}
