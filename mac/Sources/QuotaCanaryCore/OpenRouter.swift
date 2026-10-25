import Foundation

/// Port of src/lib/adapters/openrouter.ts. Read-only: one GET per check.
public enum OpenRouter: HandWrittenProvider {
  public static let id: ProviderID = .openrouter
  public static let name = "OpenRouter"
  public static let topupURL = "https://openrouter.ai/credits"
  public static let defaultSettings = PoolSettings(monitored: true, low: 15, critical: 5)
  public static let note: String? = Copy.accountWideNote
  public static let pools = [creditsPool]

  public static let creditsURL = URL(string: "https://openrouter.ai/api/v1/credits")!

  public static let creditsPool = Pool(
    creditType: "credits",
    label: Copy.creditsPoolLabel,
    unit: .usd,
    // total_credits is lifetime top-ups, not a quota, so there is no cap.
    cap: nil
  )

  public static func read(key: String, transport: ProviderTransport) async throws -> [PoolBalance] {
    let response: HTTPResponse
    do {
      response = try await transport.get(creditsURL, headers: ["Authorization": "Bearer \(key)"])
    } catch {
      throw ProviderReadError.unreachable
    }
    return try parse(response)
  }

  public static func parse(_ response: HTTPResponse) throws -> [PoolBalance] {
    if response.status == 401 { throw ProviderReadError.keyRejected }
    if response.status == 429 { throw ProviderReadError.rateLimited }
    guard (200..<300).contains(response.status) else {
      throw ProviderReadError.httpStatus(response.status)
    }
    guard let json = try? JSONSerialization.jsonObject(with: response.body) else {
      throw ProviderReadError.notJSON
    }
    let data = (json as? [String: Any])?["data"] as? [String: Any]
    guard let total = ProviderJSON.finiteOrNil(data?["total_credits"]) else {
      throw ProviderReadError.missingField("data.total_credits")
    }
    let used = ProviderJSON.finiteOrNil(data?["total_usage"]) ?? 0
    return [PoolBalance(pool: creditsPool, balance: total - used)]
  }
}
