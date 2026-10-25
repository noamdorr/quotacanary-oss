import Foundation

/// Port of src/lib/adapters/orthogonal.ts. Read-only: one GET per check.
/// Orthogonal reports `balance` either as a number or as a formatted dollar
/// string such as "$1,234.56"; `$` and `,` are stripped before parsing.
/// One pool, no cap.
public enum Orthogonal: HandWrittenProvider {
  public static let id: ProviderID = .orthogonal
  public static let name = "Orthogonal"
  public static let topupURL = "https://orthogonal.com/dashboard/balance"
  // Orthogonal's seed row: critical 5, low 15, dollars.
  public static let defaultSettings = PoolSettings(monitored: true, low: 15, critical: 5)

  public static let balanceURL = URL(string: "https://api.orthogonal.com/v1/credits/balance")!

  public static let balancePool = Pool(
    creditType: "balance", label: Copy.orthogonalBalancePoolLabel, unit: .usd, cap: nil
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
    var value = (json as? [String: Any])?["balance"]
    if let formatted = value as? String {
      value = formatted.replacingOccurrences(of: "$", with: "").replacingOccurrences(of: ",", with: "")
    }
    guard let balance = ProviderJSON.finiteOrNil(value) else {
      throw ProviderReadError.missingField("balance")
    }
    return [PoolBalance(pool: balancePool, balance: balance)]
  }
}
