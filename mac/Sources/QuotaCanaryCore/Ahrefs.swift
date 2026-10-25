import Foundation

/// Port of src/lib/adapters/ahrefs.ts. Read-only: one GET per check.
/// Ahrefs reports a workspace allowance and an optional per-API-key cap; the
/// pool shows whichever pair has the LOWER remaining (clamped at 0), and its
/// limit is the cap. One pool.
public enum Ahrefs: HandWrittenProvider {
  public static let id: ProviderID = .ahrefs
  public static let name = "Ahrefs"
  public static let topupURL = "https://app.ahrefs.com/account/subscription"
  // Ahrefs' seed row: critical 5000, low 15000.
  public static let defaultSettings = PoolSettings(monitored: true, low: 15000, critical: 5000)

  public static let limitsURL = URL(string: "https://api.ahrefs.com/v3/subscription-info/limits-and-usage")!

  public static let unitsPool = Pool(creditType: "units", label: Copy.ahrefsUnitsPoolLabel, unit: .credits, cap: nil)
  public static let pools = [unitsPool]

  public static func read(key: String, transport: ProviderTransport) async throws -> [PoolBalance] {
    let response: HTTPResponse
    do {
      response = try await transport.get(
        limitsURL, headers: ["Accept": "application/json", "Authorization": "Bearer \(key)"]
      )
    } catch {
      throw ProviderReadError.unreachable
    }
    return try parse(response)
  }

  /// A limit and what is left of it, or nil when the limit is not a number.
  private static func remaining(limit: Any?, usage: Any?) -> (balance: Double, limit: Double)? {
    guard let limit = ProviderJSON.finiteOrNil(limit) else { return nil }
    let used = ProviderJSON.finiteOrNil(usage) ?? 0
    return (max(limit - used, 0), limit)
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
    if let message = object?["error"] as? String, !message.isEmpty {
      throw ProviderReadError.reportedError(message)
    }
    guard let limits = object?["limits_and_usage"] as? [String: Any] else {
      throw ProviderReadError.missingField("limits_and_usage")
    }
    let workspace = remaining(limit: limits["units_limit_workspace"], usage: limits["units_usage_workspace"])
    let apiKey = remaining(limit: limits["units_limit_api_key"], usage: limits["units_usage_api_key"])
    let tighter: (balance: Double, limit: Double)?
    if let workspace, let apiKey {
      tighter = apiKey.balance < workspace.balance ? apiKey : workspace
    } else {
      tighter = workspace ?? apiKey
    }
    guard let tighter else { throw ProviderReadError.missingField("units_limit_workspace") }
    var pool = unitsPool
    // The web's `balanceLimit || null` shape: a limit of 0 is no cap (here a
    // cap of 0 would mean "not in plan").
    if tighter.limit > 0 { pool.cap = tighter.limit }
    return [PoolBalance(pool: pool, balance: tighter.balance)]
  }
}
