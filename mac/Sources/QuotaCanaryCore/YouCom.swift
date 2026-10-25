import Foundation

/// Port of src/lib/adapters/youcom.ts. Read-only: one GET per check.
/// `data.attributes.balance` is USD cents, fractional (718924.5 is $7,189.245),
/// so the reading divides by 100. On an organization member's key it is the
/// org's shared pool. A 403 is a valid key without the billing scope, which
/// the web words apart from a rejected key, so here it is `keyLacksScope`.
public enum YouCom: HandWrittenProvider {
  public static let id: ProviderID = .youcom
  public static let name = "You.com"
  public static let topupURL = "https://you.com/platform"
  // A dollar balance seeded at 5 (migration 095), so the same 15 / 5 as DeepSeek.
  public static let defaultSettings = PoolSettings(monitored: true, low: 15, critical: 5)

  public static let balanceURL = URL(string: "https://api.you.com/v1/billing/account_balance")!

  public static let balancePool = Pool(creditType: "balance", label: Copy.youComBalancePoolLabel, unit: .usd, cap: nil)
  public static let pools = [balancePool]

  public static func read(key: String, transport: ProviderTransport) async throws -> [PoolBalance] {
    let response: HTTPResponse
    do {
      response = try await transport.get(balanceURL, headers: ["Accept": "application/json", "X-API-Key": key])
    } catch {
      throw ProviderReadError.unreachable
    }
    return try parse(response)
  }

  public static func parse(_ response: HTTPResponse) throws -> [PoolBalance] {
    if response.status == 401 { throw ProviderReadError.keyRejected }
    if response.status == 403 { throw ProviderReadError.keyLacksScope }
    if response.status == 429 { throw ProviderReadError.rateLimited }
    guard (200..<300).contains(response.status) else {
      throw ProviderReadError.httpStatus(response.status)
    }
    guard let json = try? JSONSerialization.jsonObject(with: response.body) else {
      throw ProviderReadError.notJSON
    }
    let attributes = ((json as? [String: Any])?["data"] as? [String: Any])?["attributes"] as? [String: Any]
    guard let cents = ProviderJSON.finiteOrNil(attributes?["balance"]) else {
      throw ProviderReadError.missingField("data.attributes.balance")
    }
    return [PoolBalance(pool: balancePool, balance: cents / 100)]
  }
}
