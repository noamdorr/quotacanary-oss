import Foundation

/// Port of src/lib/adapters/zerobounce.ts. Read-only: one GET per check.
/// ZeroBounce supports only query-string key auth (no header form), so the
/// key can surface in vendor request logs, the same residual exposure as the
/// web. A 200 with `Credits` below 0 is how it says the key is invalid.
/// One pool, no cap.
public enum ZeroBounce: HandWrittenProvider {
  public static let id: ProviderID = .zerobounce
  public static let name = "ZeroBounce"
  public static let topupURL = "https://www.zerobounce.net/members/pricing"
  // ZeroBounce's seed row: critical 1000, low 3000 (3x).
  public static let defaultSettings = PoolSettings(monitored: true, low: 3000, critical: 1000)

  public static let creditsPool = Pool(
    creditType: "credits", label: Copy.zeroBounceCreditsPoolLabel, unit: .credits, cap: nil
  )
  public static let pools = [creditsPool]

  /// The key escaped like the web's `encodeURIComponent`.
  public static func creditsURL(key: String) -> URL {
    URL(string: "https://api.zerobounce.net/v2/getcredits?api_key=\(CredentialFields.pathSegment(key))")!
  }

  public static func read(key: String, transport: ProviderTransport) async throws -> [PoolBalance] {
    let response: HTTPResponse
    do {
      response = try await transport.get(creditsURL(key: key), headers: [:])
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
    guard let credits = ProviderJSON.finiteOrNil((json as? [String: Any])?["Credits"]) else {
      throw ProviderReadError.missingField("Credits")
    }
    // HTTP 200 with Credits: -1 on a bad key.
    if credits < 0 { throw ProviderReadError.keyRejected }
    return [PoolBalance(pool: creditsPool, balance: credits)]
  }
}
