import Foundation

/// Port of src/lib/adapters/meltly.ts. Read-only: one GET per check.
/// The credits live under `credits.subscription` / `credits.payg`, with the
/// top-level `subscriptionCredits` / `paygCredits` as the fallback when the
/// nested block is absent. Numeric strings count ("5" is 5). Only the
/// subscription pool has a cap, its `tier`. `success: false` carries the
/// vendor's own message.
public enum Meltly: HandWrittenProvider {
  public static let id: ProviderID = .meltly
  public static let name = "Melt.ly"
  public static let topupURL = "https://melt.ly"
  // QUO-256: Melt.ly's seed row: critical 5, low 15 (3x).
  public static let defaultSettings = PoolSettings(monitored: true, low: 15, critical: 5)

  public static let creditsURL = URL(string: "https://melt.ly/api/user/credits")!

  public static let subscriptionPool = Pool(
    creditType: "subscription", label: Copy.meltlySubscriptionPoolLabel, unit: .credits, cap: nil
  )
  public static let paygPool = Pool(creditType: "payg", label: Copy.meltlyPaygPoolLabel, unit: .credits, cap: nil)
  public static let pools = [subscriptionPool, paygPool]

  public static func read(key: String, transport: ProviderTransport) async throws -> [PoolBalance] {
    let response: HTTPResponse
    do {
      response = try await transport.get(creditsURL, headers: ["Accept": "application/json", "x-api-key": key])
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
      throw ProviderReadError.reportedError(
        (object?["error"] as? String) ?? (object?["message"] as? String) ?? Copy.meltlyError
      )
    }
    let credits = object?["credits"] as? [String: Any]
    let subscription = credits?["subscription"] as? [String: Any]
    let payg = credits?["payg"] as? [String: Any]
    var balances: [PoolBalance] = []
    if let balance = ProviderJSON.finiteOrNil(subscription?["remaining"]) ?? ProviderJSON.finiteOrNil(object?["subscriptionCredits"]) {
      var capped = subscriptionPool
      if let tier = ProviderJSON.finiteOrNil(subscription?["tier"]), tier > 0 { capped.cap = tier }
      balances.append(PoolBalance(pool: capped, balance: balance))
    }
    if let balance = ProviderJSON.finiteOrNil(payg?["remaining"]) ?? ProviderJSON.finiteOrNil(object?["paygCredits"]) {
      balances.append(PoolBalance(pool: paygPool, balance: balance))
    }
    guard !balances.isEmpty else { throw ProviderReadError.missingField("credits") }
    return balances
  }
}
