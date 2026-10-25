import Foundation

/// Port of src/lib/adapters/netnut.ts. Read-only: one POST per check with an
/// empty JSON object body. The key goes in `Authorization` with no scheme.
/// The `data` rows are summed: balance = sum(plan_gb) - sum(total_gb_used),
/// cap = sum(plan_gb) only when above 0. One pool in gigabytes.
public enum NetNut: HandWrittenProvider {
  public static let id: ProviderID = .netnut
  public static let name = "NetNut"
  public static let topupURL = "https://dashboard.netnut.io"
  // NetNut's seed row: critical 50, low 150 (3x).
  public static let defaultSettings = PoolSettings(monitored: true, low: 150, critical: 50)

  public static let usageURL = URL(string: "https://customers-api.netnut.io/v1/customer/usage/myusage")!

  public static let bandwidthPool = Pool(
    creditType: "bandwidth", label: Copy.netNutBandwidthPoolLabel, unit: .gb, cap: nil
  )
  public static let pools = [bandwidthPool]

  public static func read(key: String, transport: ProviderTransport) async throws -> [PoolBalance] {
    let response: HTTPResponse
    do {
      response = try await transport.post(
        usageURL,
        headers: ["Authorization": key, "Content-Type": "application/json"],
        body: Data("{}".utf8)
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
    let rows = ((json as? [String: Any])?["data"] as? [Any])?.compactMap { $0 as? [String: Any] } ?? []
    // The plan figures anchor the pool; none present means no usable limit.
    guard rows.contains(where: { ProviderJSON.finiteOrNil($0["plan_gb"]) != nil }) else {
      throw ProviderReadError.missingField("plan_gb")
    }
    let plan = rows.reduce(0) { $0 + (ProviderJSON.finiteOrNil($1["plan_gb"]) ?? 0) }
    let used = rows.reduce(0) { $0 + (ProviderJSON.finiteOrNil($1["total_gb_used"]) ?? 0) }
    var pool = bandwidthPool
    if plan > 0 { pool.cap = plan }
    return [PoolBalance(pool: pool, balance: plan - used)]
  }
}
