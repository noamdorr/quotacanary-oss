import Foundation

/// Port of src/lib/adapters/peopledatalabs.ts. Read-only: one HEAD per check.
/// People Data Labs exposes the remaining credit balance only in the response
/// header `x-totallimit-remaining`. The docs' own example for reading limits
/// is a HEAD on Person Enrichment with no parameters, so nothing is enriched;
/// that bare request is expected to answer 4xx while still carrying the limit
/// headers, so a numeric header wins over the status (except a rejected key).
public enum PeopleDataLabs: HandWrittenProvider {
  public static let id: ProviderID = .peopledatalabs
  public static let name = "People Data Labs"
  public static let topupURL = "https://www.peopledatalabs.com/pricing"
  // People Data Labs' seed row: critical 25, low 75 (3x).
  public static let defaultSettings = PoolSettings(monitored: true, low: 75, critical: 25)

  public static let enrichURL = URL(string: "https://api.peopledatalabs.com/v5/person/enrich")!

  public static let creditsPool = Pool(
    creditType: "credits", label: Copy.peopleDataLabsCreditsPoolLabel, unit: .credits, cap: nil
  )
  public static let pools = [creditsPool]

  public static func read(key: String, transport: ProviderTransport) async throws -> [PoolBalance] {
    let response: HTTPResponse
    do {
      response = try await transport.head(enrichURL, headers: ["X-Api-Key": key, "Accept": "application/json"])
    } catch {
      throw ProviderReadError.unreachable
    }
    return try parse(response)
  }

  public static func parse(_ response: HTTPResponse) throws -> [PoolBalance] {
    if response.status == 401 || response.status == 403 { throw ProviderReadError.keyRejected }
    // Includes purchased and overage credits; the split headers are ignored.
    if let remaining = ProviderJSON.finiteOrNil(response.headers["x-totallimit-remaining"]) {
      return [PoolBalance(pool: creditsPool, balance: remaining)]
    }
    if response.status == 429 { throw ProviderReadError.rateLimited }
    guard (200..<300).contains(response.status) else {
      throw ProviderReadError.httpStatus(response.status)
    }
    throw ProviderReadError.missingField("x-totallimit-remaining")
  }
}
