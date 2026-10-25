import Foundation

/// Port of src/lib/adapters/apify.ts (QUO-282). Read-only: two GETs per check.
/// The limit is the plan's included monthly credit (`data.plan.monthlyUsageCreditsUsd`
/// on /v2/users/me); the usage is `data.current.monthlyUsageUsd` on
/// /v2/users/me/limits. That body's `limits.maxMonthlyUsageUsd` is the
/// spending cap, not the plan, so it is never read.
public enum Apify: HandWrittenProvider {
  public static let id: ProviderID = .apify
  public static let name = "Apify"
  public static let topupURL = "https://console.apify.com/billing/subscription"
  // QUO-282: kept at the dollar default it had as a catalog entry, so saved
  // Apify connections keep their thresholds (the seed row says critical 20).
  public static let defaultSettings = PoolSettings(monitored: true, low: 15, critical: 5)

  public static let meURL = URL(string: "https://api.apify.com/v2/users/me")!
  public static let limitsURL = URL(string: "https://api.apify.com/v2/users/me/limits")!

  public static let usagePool = Pool(creditType: "usage", label: Copy.apifyUsagePoolLabel, unit: .usd, cap: nil)
  public static let pools = [usagePool]

  public static func read(key: String, transport: ProviderTransport) async throws -> [PoolBalance] {
    let headers = ["Authorization": "Bearer \(key)"]
    let included = try parseMe(try await get(meURL, headers: headers, transport: transport))
    return try parseLimits(try await get(limitsURL, headers: headers, transport: transport), included: included)
  }

  /// The plan's included monthly credit, in dollars.
  public static func parseMe(_ response: HTTPResponse) throws -> Double {
    let data = try object(response)["data"] as? [String: Any]
    let plan = data?["plan"] as? [String: Any]
    guard let included = ProviderJSON.finiteOrNil(plan?["monthlyUsageCreditsUsd"]) else {
      throw ProviderReadError.missingField("data.plan.monthlyUsageCreditsUsd")
    }
    return included
  }

  /// Left = included minus used. Usage past the included credit is overage
  /// billed up to the spending cap; it reads 0 left, never negative.
  public static func parseLimits(_ response: HTTPResponse, included: Double) throws -> [PoolBalance] {
    let data = try object(response)["data"] as? [String: Any]
    let current = data?["current"] as? [String: Any]
    let used = ProviderJSON.finiteOrNil(current?["monthlyUsageUsd"]) ?? 0
    var pool = usagePool
    pool.cap = included
    return [PoolBalance(pool: pool, balance: max(included - used, 0))]
  }

  private static func get(_ url: URL, headers: [String: String], transport: ProviderTransport) async throws -> HTTPResponse {
    do {
      return try await transport.get(url, headers: headers)
    } catch {
      throw ProviderReadError.unreachable
    }
  }

  private static func object(_ response: HTTPResponse) throws -> [String: Any] {
    if response.status == 401 || response.status == 403 { throw ProviderReadError.keyRejected }
    if response.status == 429 { throw ProviderReadError.rateLimited }
    guard (200..<300).contains(response.status) else {
      throw ProviderReadError.httpStatus(response.status)
    }
    guard let json = try? JSONSerialization.jsonObject(with: response.body) else {
      throw ProviderReadError.notJSON
    }
    return json as? [String: Any] ?? [:]
  }
}
