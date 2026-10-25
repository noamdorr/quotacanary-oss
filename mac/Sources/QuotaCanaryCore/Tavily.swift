import Foundation

/// Port of src/lib/adapters/tavily.ts. Read-only: one GET per check.
/// Tavily meters three things separately, and they are never summed:
/// the account's plan credits, the account's pay-as-you-go allowance, and an
/// optional cap on this one API key.
public enum Tavily: HandWrittenProvider {
  public static let id: ProviderID = .tavily
  public static let name = "Tavily"
  public static let topupURL = "https://app.tavily.com/billing"
  // Tavily's seed row sets default_low_threshold explicitly (300).
  public static let defaultSettings = PoolSettings(monitored: true, low: 300, critical: 100)
  public static let note: String? = Copy.tavilyScopeNote

  public static let usageURL = URL(string: "https://api.tavily.com/usage")!

  /// Catalog pools. The cap is filled in from each reading.
  public static let planPool = Pool(
    creditType: "plan", label: Copy.tavilyPlanPoolLabel, unit: .credits, cap: nil
  )
  public static let paygoPool = Pool(
    creditType: "paygo", label: Copy.tavilyPaygoPoolLabel, unit: .credits, cap: nil
  )
  /// Not in the catalog: a key without a cap is unlimited, which is not a
  /// missing reading, so the row appears only while the key has a finite cap.
  public static let keyPool = Pool(
    creditType: "key", label: Copy.tavilyKeyPoolLabel, unit: .credits, cap: nil
  )
  public static let pools = [planPool, paygoPool]

  public static func read(key: String, transport: ProviderTransport) async throws -> [PoolBalance] {
    let response: HTTPResponse
    do {
      response = try await transport.get(
        usageURL, headers: ["Accept": "application/json", "Authorization": "Bearer \(key)"]
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
    let root = json as? [String: Any]
    if let detail = root?["detail"] as? [String: Any], detail["error"] != nil {
      throw ProviderReadError.reportedError(nil)
    }
    let account = root?["account"] as? [String: Any]
    let keyUsage = root?["key"] as? [String: Any]

    let plan = remaining(planPool, usage: account?["plan_usage"], limit: account?["plan_limit"])
    let paygo = remaining(paygoPool, usage: account?["paygo_usage"], limit: account?["paygo_limit"])
    let keyCap = remaining(keyPool, usage: keyUsage?["usage"], limit: keyUsage?["limit"])

    // Pay-as-you-go with no positive limit is switched off: kept as a known
    // zero-cap allowance (never alerts), like a Hunter pool the plan lacks.
    let paygoActive = paygo.flatMap { ($0.pool.cap ?? 0) > 0 ? $0 : nil }
    // Same bar as the web adapter: at least one allowance that can be spent.
    guard plan != nil || paygoActive != nil || keyCap != nil else {
      throw ProviderReadError.missingField("account.plan_limit")
    }
    // An inactive pay-as-you-go already reads cap 0, balance 0: unavailable.
    return [plan, paygo, keyCap].compactMap { $0 }
  }

  /// Remaining = limit - usage, floored at zero. A missing or null limit is
  /// dropped (unknown for the plan, unlimited for a key), never a false zero.
  static func remaining(_ template: Pool, usage: Any?, limit: Any?) -> PoolBalance? {
    guard let cap = ProviderJSON.finiteOrNil(limit) else { return nil }
    let used = ProviderJSON.finiteOrNil(usage) ?? 0
    var pool = template
    pool.cap = max(cap, 0)
    return PoolBalance(pool: pool, balance: max(cap - used, 0))
  }
}
