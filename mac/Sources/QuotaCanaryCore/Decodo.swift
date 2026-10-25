import Foundation

/// Port of src/lib/adapters/decodo.ts. Read-only, two sequential GETs: the
/// residential subscription's traffic limit (GB, a string), then every
/// residential sub-user's traffic, summed as the usage.
public enum Decodo: HandWrittenProvider {
  public static let id: ProviderID = .decodo
  public static let name = "Decodo"
  public static let topupURL = "https://decodo.com/proxies/residential-proxies/pricing"
  // Decodo's seed row: critical 1, low 3 (3x), GB of residential traffic.
  public static let defaultSettings = PoolSettings(monitored: true, low: 3, critical: 1)

  public static let subscriptionsURL = URL(string: "https://api.decodo.com/v2/subscriptions")!
  public static let subUsersURL = URL(string: "https://api.decodo.com/v2/sub-users?service_type=residential_proxies")!
  static let residential = "residential_proxies"

  public static let trafficPool = Pool(creditType: "traffic", label: Copy.decodoTrafficPoolLabel, unit: .gb, cap: nil)
  public static let pools = [trafficPool]

  public static func read(key: String, transport: ProviderTransport) async throws -> [PoolBalance] {
    // The public API key goes in the header as is, with no scheme prefix.
    let headers = ["Authorization": key]
    let limit = try parseSubscriptions(try await get(subscriptionsURL, headers: headers, transport: transport))
    let used = try parseSubUsers(try await get(subUsersURL, headers: headers, transport: transport))
    var pool = trafficPool
    pool.cap = limit
    return [PoolBalance(pool: pool, balance: max(0, limit - used))]
  }

  static func get(_ url: URL, headers: [String: String], transport: ProviderTransport) async throws -> HTTPResponse {
    do {
      return try await transport.get(url, headers: headers)
    } catch {
      throw ProviderReadError.unreachable
    }
  }

  static func checkStatus(_ response: HTTPResponse) throws -> Any {
    if response.status == 401 || response.status == 403 { throw ProviderReadError.keyRejected }
    if response.status == 429 { throw ProviderReadError.rateLimited }
    guard (200..<300).contains(response.status) else {
      throw ProviderReadError.httpStatus(response.status)
    }
    guard let json = try? JSONSerialization.jsonObject(with: response.body) else {
      throw ProviderReadError.notJSON
    }
    return json
  }

  /// Sum of the residential subscriptions' limits. The docs example is one
  /// object, the live shape may be a list: both are read. No residential
  /// subscription, or a non-numeric limit, fails the read.
  static func parseSubscriptions(_ response: HTTPResponse) throws -> Double {
    let json = try checkStatus(response)
    let entries = (json as? [Any]) ?? [json]
    var total = 0.0
    var found = false
    for entry in entries {
      guard let record = entry as? [String: Any] else { throw ProviderReadError.missingField("subscriptions") }
      guard record["service_type"] as? String == residential else { continue }
      guard let limit = ProviderJSON.finiteOrNil(record["traffic_limit"]) else {
        throw ProviderReadError.missingField("traffic_limit")
      }
      total += limit
      found = true
    }
    guard found else { throw ProviderReadError.missingField("subscriptions") }
    return total
  }

  /// Total traffic used. An empty list is a real 0: no sub-user has used any.
  static func parseSubUsers(_ response: HTTPResponse) throws -> Double {
    guard let list = try checkStatus(response) as? [Any] else { throw ProviderReadError.missingField("sub-users") }
    return try list.reduce(0) { total, entry in
      guard let traffic = ProviderJSON.finiteOrNil((entry as? [String: Any])?["traffic"]) else {
        throw ProviderReadError.missingField("sub-users.traffic")
      }
      return total + traffic
    }
  }
}
