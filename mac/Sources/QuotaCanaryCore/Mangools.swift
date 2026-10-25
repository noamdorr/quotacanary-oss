import Foundation

/// Port of src/lib/adapters/mangools.ts. Read-only: two GETs per check.
/// GET /kwfinder/limits does not authenticate (a bad token gets HTTP 200 with
/// zero in every pool), so the key is first checked on GET /kwfinder/requests,
/// which answers 401 on a bad token. Three pools from `resources`, each capped
/// at its `limit`; a limit of 0 is "not in plan" (cap 0).
public enum Mangools: HandWrittenProvider {
  public static let id: ProviderID = .mangools
  public static let name = "Mangools"
  public static let topupURL = "https://mangools.com/plans-and-pricing"
  // Mangools' seed row: critical 25, low 75.
  public static let defaultSettings = PoolSettings(monitored: true, low: 75, critical: 25)

  public static let requestsURL = URL(string: "https://api.mangools.com/v3/kwfinder/requests")!
  public static let limitsURL = URL(string: "https://api.mangools.com/v3/kwfinder/limits")!

  public static let keywordLookupsPool = Pool(
    creditType: "keyword_lookups", label: Copy.mangoolsKeywordLookupsPoolLabel, unit: .credits, cap: nil
  )
  public static let serpLookupsPool = Pool(
    creditType: "serp_lookups", label: Copy.mangoolsSERPLookupsPoolLabel, unit: .credits, cap: nil
  )
  public static let backlinkRowsPool = Pool(
    creditType: "backlink_rows", label: Copy.mangoolsBacklinkRowsPoolLabel, unit: .credits, cap: nil
  )
  public static let pools = [keywordLookupsPool, serpLookupsPool, backlinkRowsPool]

  /// Each pool and the `resources` key it reads.
  private static let fieldsByPool: [(Pool, String)] = [
    (keywordLookupsPool, "related-keywords"), (serpLookupsPool, "serps"), (backlinkRowsPool, "links"),
  ]

  public static func read(key: String, transport: ProviderTransport) async throws -> [PoolBalance] {
    let headers = ["X-Access-Token": key]
    do {
      try parseRequests(try await transport.get(requestsURL, headers: headers))
    } catch let error as ProviderReadError {
      throw error
    } catch {
      throw ProviderReadError.unreachable
    }
    let response: HTTPResponse
    do {
      response = try await transport.get(limitsURL, headers: headers)
    } catch {
      throw ProviderReadError.unreachable
    }
    return try parseLimits(response)
  }

  /// The key check: only the status matters, the lookup history is not read.
  public static func parseRequests(_ response: HTTPResponse) throws {
    try check(response)
  }

  public static func parseLimits(_ response: HTTPResponse) throws -> [PoolBalance] {
    try check(response)
    guard let json = try? JSONSerialization.jsonObject(with: response.body) else {
      throw ProviderReadError.notJSON
    }
    guard let resources = (json as? [String: Any])?["resources"] as? [String: Any] else {
      throw ProviderReadError.missingField("resources")
    }
    var balances: [PoolBalance] = []
    for (pool, field) in fieldsByPool {
      let entry = resources[field] as? [String: Any]
      guard let limit = ProviderJSON.finiteOrNil(entry?["limit"]),
            let remaining = ProviderJSON.finiteOrNil(entry?["remaining"])
      else { continue }
      var capped = pool
      capped.cap = max(limit, 0)
      balances.append(PoolBalance(pool: capped, balance: remaining))
    }
    // Every pool at 0 of 0 is what a bad token reads; never a real zero.
    guard balances.contains(where: { ($0.pool.cap ?? 0) > 0 }) else {
      throw ProviderReadError.missingField("resources")
    }
    return balances
  }

  private static func check(_ response: HTTPResponse) throws {
    if response.status == 401 || response.status == 403 { throw ProviderReadError.keyRejected }
    if response.status == 429 { throw ProviderReadError.rateLimited }
    guard (200..<300).contains(response.status) else {
      throw ProviderReadError.httpStatus(response.status)
    }
  }
}
