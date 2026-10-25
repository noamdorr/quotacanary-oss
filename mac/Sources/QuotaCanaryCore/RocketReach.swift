import Foundation

/// Port of src/lib/adapters/rocketreach.ts. Read-only: one GET per check.
/// RocketReach lists `credit_usage` as one row per credit type. The web turns
/// each allocated row into a pool at read time; Mac pools are declared per
/// provider, so the six credit types the vendor returns are static pools
/// (same `creditType` ids, the web's humanized labels). A row with nothing
/// allocated and nothing left is "not in plan" (cap 0); an unknown credit
/// type is dropped.
public enum RocketReach: HandWrittenProvider {
  public static let id: ProviderID = .rocketreach
  public static let name = "RocketReach"
  public static let topupURL = "https://rocketreach.co/pricing"
  // RocketReach's seed row: critical 500, low 1500 (3x).
  public static let defaultSettings = PoolSettings(monitored: true, low: 1500, critical: 500)

  /// /api/v2/account/ works on every plan; /api/v2/universal/account/ is
  /// gated behind Universal Credits and 4xxs for normal accounts.
  public static let accountURL = URL(string: "https://api.rocketreach.co/api/v2/account/")!

  public static let standardLookupPool = Pool(
    creditType: "standard_lookup", label: Copy.rocketReachStandardLookupPoolLabel, unit: .credits, cap: nil
  )
  public static let premiumLookupPool = Pool(
    creditType: "premium_lookup", label: Copy.rocketReachPremiumLookupPoolLabel, unit: .credits, cap: nil
  )
  public static let phoneLookupPool = Pool(
    creditType: "phone_lookup", label: Copy.rocketReachPhoneLookupPoolLabel, unit: .credits, cap: nil
  )
  public static let personEnrichPool = Pool(
    creditType: "person_enrich", label: Copy.rocketReachPersonEnrichPoolLabel, unit: .credits, cap: nil
  )
  public static let personExportPool = Pool(
    creditType: "person_export", label: Copy.rocketReachPersonExportPoolLabel, unit: .credits, cap: nil
  )
  public static let companyExportPool = Pool(
    creditType: "company_export", label: Copy.rocketReachCompanyExportPoolLabel, unit: .credits, cap: nil
  )
  public static let pools = [
    standardLookupPool, premiumLookupPool, phoneLookupPool, personEnrichPool, personExportPool, companyExportPool,
  ]

  public static func read(key: String, transport: ProviderTransport) async throws -> [PoolBalance] {
    let response: HTTPResponse
    do {
      response = try await transport.get(accountURL, headers: ["Api-Key": key])
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
    let rows = ((json as? [String: Any])?["credit_usage"] as? [Any]) ?? []
    var balances: [PoolBalance] = []
    for case let row as [String: Any] in rows {
      guard var pool = pools.first(where: { $0.creditType == row["credit_type"] as? String }),
            !balances.contains(where: { $0.pool.creditType == pool.creditType }),
            let remaining = ProviderJSON.finiteOrNil(row["remaining"])
      else { continue }
      let allocated = ProviderJSON.finiteOrNil(row["allocated"]) ?? 0
      // Cap 0 means "not in plan" here; an unallocated row that still has
      // credits left stays capless so they show.
      if allocated > 0 {
        pool.cap = allocated
      } else if remaining <= 0 {
        pool.cap = 0
      }
      balances.append(PoolBalance(pool: pool, balance: remaining))
    }
    guard !balances.isEmpty else { throw ProviderReadError.missingField("credit_usage") }
    return balances
  }
}
