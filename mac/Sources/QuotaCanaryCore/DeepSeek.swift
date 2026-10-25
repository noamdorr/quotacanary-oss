import Foundation

/// Port of src/lib/adapters/deepseek.ts. Read-only: one GET per check.
/// `balance_infos` lists one entry per currency; the USD entry wins, else the
/// first. `total_balance` is a decimal string ("110.00"). An account with no
/// entries has nothing topped up, which is a real reading of 0, not an error.
/// The web maps only a 401 to a rejected key; here a 403 does too, like every
/// other twin.
public enum DeepSeek: HandWrittenProvider {
  public static let id: ProviderID = .deepseek
  public static let name = "DeepSeek"
  public static let topupURL = "https://platform.deepseek.com/top_up"
  // DeepSeek is a dollar balance with the same seed (5) as OpenRouter, so the same 15 / 5.
  public static let defaultSettings = PoolSettings(monitored: true, low: 15, critical: 5)

  public static let balanceURL = URL(string: "https://api.deepseek.com/user/balance")!

  public static let balancePool = Pool(creditType: "balance", label: Copy.deepSeekBalancePoolLabel, unit: .usd, cap: nil)
  public static let pools = [balancePool]

  public static func read(key: String, transport: ProviderTransport) async throws -> [PoolBalance] {
    let response: HTTPResponse
    do {
      response = try await transport.get(balanceURL, headers: ["Authorization": "Bearer \(key)"])
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
    let infos = (json as? [String: Any])?["balance_infos"] as? [Any] ?? []
    guard let first = infos.first else { return [PoolBalance(pool: balancePool, balance: 0)] }
    let entry = infos.first { ($0 as? [String: Any])?["currency"] as? String == "USD" } ?? first
    guard let balance = ProviderJSON.finiteOrNil((entry as? [String: Any])?["total_balance"]) else {
      throw ProviderReadError.missingField("total_balance")
    }
    return [PoolBalance(pool: balancePool, balance: balance)]
  }
}
