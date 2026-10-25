import Foundation

/// Port of src/lib/adapters/lemlist.ts. Read-only: one GET per check.
/// lemlist authenticates with HTTP Basic, an empty username and the API key as
/// the password, so the header is "Basic " + base64(":" + key). The team's
/// whole remaining credit balance is one pool with no cap.
public enum Lemlist: HandWrittenProvider {
  public static let id: ProviderID = .lemlist
  public static let name = "lemlist"
  public static let topupURL = "https://www.lemlist.com/pricing"
  // lemlist's seed row: critical 100, low 300 (3x).
  public static let defaultSettings = PoolSettings(monitored: true, low: 300, critical: 100)

  public static let creditsURL = URL(string: "https://api.lemlist.com/api/team/credits")!

  public static let creditsPool = Pool(
    creditType: "credits", label: Copy.lemlistCreditsPoolLabel, unit: .credits, cap: nil
  )
  public static let pools = [creditsPool]

  public static func read(key: String, transport: ProviderTransport) async throws -> [PoolBalance] {
    let response: HTTPResponse
    do {
      response = try await transport.get(
        creditsURL,
        headers: [
          "Accept": "application/json",
          "Authorization": "Basic \(Data(":\(key)".utf8).base64EncodedString())",
        ]
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
    // `credits` equals details.remaining.total; missing or non-numeric is an
    // unexpected response, never a false zero.
    guard let credits = ProviderJSON.finiteOrNil((json as? [String: Any])?["credits"]) else {
      throw ProviderReadError.missingField("credits")
    }
    return [PoolBalance(pool: creditsPool, balance: credits)]
  }
}
