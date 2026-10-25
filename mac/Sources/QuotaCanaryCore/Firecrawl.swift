import Foundation

/// Port of src/lib/adapters/firecrawl.ts. Read-only: one GET per check.
/// One pool: `data.remainingCredits`, capped at `data.planCredits` when that
/// is above 0. `success: false` is Firecrawl refusing the request.
public enum Firecrawl: HandWrittenProvider {
  public static let id: ProviderID = .firecrawl
  public static let name = "Firecrawl"
  public static let topupURL = "https://www.firecrawl.dev/pricing"
  // Firecrawl's seed row sets low explicitly (15000); critical 5000 (3x).
  public static let defaultSettings = PoolSettings(monitored: true, low: 15000, critical: 5000)

  public static let creditUsageURL = URL(string: "https://api.firecrawl.dev/v2/team/credit-usage")!

  /// This endpoint intermittently takes more than 10 seconds, so it gets more
  /// than the transport's default 15. The scheduler's per-check timeout is 30,
  /// so 20 fits under it. Matches the web adapter's 20 seconds.
  public static let requestTimeout: TimeInterval = 20

  public static let creditsPool = Pool(creditType: "credits", label: Copy.firecrawlCreditsPoolLabel, unit: .credits, cap: nil)
  public static let pools = [creditsPool]

  public static func read(key: String, transport: ProviderTransport) async throws -> [PoolBalance] {
    let response: HTTPResponse
    do {
      response = try await transport.send(HTTPRequest("GET", creditUsageURL, headers: ["Authorization": "Bearer \(key)"], timeout: requestTimeout))
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
    if let success = object?["success"] as? Bool, !success {
      throw ProviderReadError.reportedError(Copy.firecrawlRejected)
    }
    let data = object?["data"] as? [String: Any]
    guard let balance = ProviderJSON.finiteOrNil(data?["remainingCredits"]) else {
      throw ProviderReadError.missingField("data.remainingCredits")
    }
    var pool = creditsPool
    if let plan = ProviderJSON.finiteOrNil(data?["planCredits"]), plan > 0 { pool.cap = plan }
    return [PoolBalance(pool: pool, balance: balance)]
  }
}
