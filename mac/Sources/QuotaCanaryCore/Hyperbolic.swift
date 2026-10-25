import Foundation

/// Port of src/lib/adapters/hyperbolic.ts. Read-only: one GET per check.
/// Hyperbolic reports `credits` in cents, so the balance is `credits / 100`
/// dollars. One pool, no cap.
public enum Hyperbolic: HandWrittenProvider {
  public static let id: ProviderID = .hyperbolic
  public static let name = "Hyperbolic"
  public static let topupURL = "https://app.hyperbolic.ai/settings/billing"
  // Hyperbolic's seed row: critical 5, low 15, dollars.
  public static let defaultSettings = PoolSettings(monitored: true, low: 15, critical: 5)

  public static let balanceURL = URL(string: "https://api.hyperbolic.xyz/billing/get_current_balance")!

  public static let balancePool = Pool(
    creditType: "balance", label: Copy.hyperbolicBalancePoolLabel, unit: .usd, cap: nil
  )
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
    guard let cents = ProviderJSON.finiteOrNil((json as? [String: Any])?["credits"]) else {
      throw ProviderReadError.missingField("credits")
    }
    return [PoolBalance(pool: balancePool, balance: cents / 100)]
  }
}
