import Foundation

/// Port of src/lib/adapters/webshare.ts. Read-only, three sequential GETs: the
/// subscription (active plan id, free credits, period start), the plan
/// (bandwidth cap in GB, 0 = unlimited), then the period's usage aggregate
/// (bytes). The aggregate call is skipped on an unlimited plan.
public enum Webshare: HandWrittenProvider {
  public static let id: ProviderID = .webshare
  public static let name = "Webshare"
  public static let topupURL = "https://www.webshare.io/pricing"
  // Webshare's seed row: critical 1, low 3 (3x), GB of traffic and dollars of free credits alike.
  public static let defaultSettings = PoolSettings(monitored: true, low: 3, critical: 1)

  public static let baseURL = "https://proxy.webshare.io/api/v2"

  public static let trafficPool = Pool(creditType: "traffic", label: Copy.webshareTrafficPoolLabel, unit: .gb, cap: nil)
  public static let freeCreditsPool = Pool(
    creditType: "free_credits", label: Copy.webshareFreeCreditsPoolLabel, unit: .usd, cap: nil
  )
  public static let pools = [trafficPool, freeCreditsPool]

  /// The aggregate endpoint rejects a window starting more than 90 days ago.
  /// Periods are 30 days, so a clamp means a stale subscription; usage then
  /// counts from the clamp only (it can overstate the balance, never zero it).
  static let maxWindow: TimeInterval = 90 * 24 * 60 * 60
  static let bytesPerGB = 1e9

  public static func read(key: String, transport: ProviderTransport) async throws -> [PoolBalance] {
    try await read(key: key, transport: transport, now: Date())
  }

  public static func read(key: String, transport: ProviderTransport, now: Date = Date()) async throws -> [PoolBalance] {
    let headers = ["Authorization": "Token \(key)", "Accept": "application/json"]
    let subscription = try parseObject(try await get("\(baseURL)/subscription/", headers: headers, transport: transport))
    // An integer id; a boolean (which bridges to NSNumber too) is rejected.
    guard let number = subscription["plan"] as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID(),
          let planID = Int(exactly: number.doubleValue) else {
      throw ProviderReadError.missingField("plan")
    }
    guard let freeCredits = ProviderJSON.finiteOrNil(subscription["free_credits"]) else {
      throw ProviderReadError.missingField("free_credits")
    }

    let plan = try parseObject(try await get("\(baseURL)/subscription/plan/\(planID)/", headers: headers, transport: transport))
    guard let bandwidthLimit = ProviderJSON.finiteOrNil(plan["bandwidth_limit"]) else {
      throw ProviderReadError.missingField("bandwidth_limit")
    }

    var balances: [PoolBalance] = []
    if bandwidthLimit > 0 {
      guard let start = (subscription["start_date"] as? String).flatMap(parseDate) else {
        throw ProviderReadError.missingField("start_date")
      }
      let from = max(start, now.addingTimeInterval(-maxWindow))
      guard from < now else { throw ProviderReadError.missingField("start_date") }
      // ISO strings carry only query-safe characters, so no encoding.
      let query = "timestamp__gte=\(format(from))&timestamp__lte=\(format(now))"
      let stats = try parseObject(try await get("\(baseURL)/stats/aggregate/?\(query)", headers: headers, transport: transport))
      guard let usedBytes = ProviderJSON.finiteOrNil(stats["bandwidth_total"]) else {
        throw ProviderReadError.missingField("bandwidth_total")
      }
      var pool = trafficPool
      pool.cap = bandwidthLimit
      balances.append(PoolBalance(pool: pool, balance: max(0, bandwidthLimit - usedBytes / bytesPerGB)))
    }
    if freeCredits > 0 {
      balances.append(PoolBalance(pool: freeCreditsPool, balance: freeCredits))
    }
    guard !balances.isEmpty else { throw ProviderReadError.reportedError(Copy.webshareNothingToWatch) }
    return balances
  }

  static func get(_ url: String, headers: [String: String], transport: ProviderTransport) async throws -> HTTPResponse {
    guard let url = URL(string: url) else { throw ProviderReadError.missingField("url") }
    do {
      return try await transport.get(url, headers: headers)
    } catch {
      throw ProviderReadError.unreachable
    }
  }

  static func parseObject(_ response: HTTPResponse) throws -> [String: Any] {
    if response.status == 401 || response.status == 403 { throw ProviderReadError.keyRejected }
    if response.status == 429 { throw ProviderReadError.rateLimited }
    guard (200..<300).contains(response.status) else {
      throw ProviderReadError.httpStatus(response.status)
    }
    guard let json = try? JSONSerialization.jsonObject(with: response.body) else {
      throw ProviderReadError.notJSON
    }
    guard let object = json as? [String: Any] else { throw ProviderReadError.missingField("object") }
    return object
  }

  /// Webshare sends microsecond fractions with an offset; seconds-only is accepted too.
  static func parseDate(_ string: String) -> Date? {
    let withFraction = ISO8601DateFormatter()
    withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return withFraction.date(from: string) ?? ISO8601DateFormatter().date(from: string)
  }

  /// Same shape as JavaScript's toISOString: UTC, milliseconds, "Z".
  static func format(_ date: Date) -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.string(from: date)
  }
}
