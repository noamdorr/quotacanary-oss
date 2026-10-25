import Foundation

/// Port of src/lib/adapters/predictleads.ts. Read-only: one GET per check.
/// PredictLeads authenticates with two headers (API key and API token), so
/// the stored secret is the two-field JSON (`CredentialFields`). One pool,
/// the monthly quota minus what is used, capped at the quota.
public enum PredictLeads: HandWrittenProvider {
  public static let id: ProviderID = .predictleads
  public static let name = "PredictLeads"
  public static let topupURL = "https://predictleads.com/pricing"
  // PredictLeads' seed row: critical 10, low 30.
  public static let defaultSettings = PoolSettings(monitored: true, low: 30, critical: 10)

  public static let subscriptionURL = URL(string: "https://predictleads.com/api/v3/api_subscription")!

  public static let fields = [
    CredentialField(name: "apiKey", label: Copy.apiKeyLabel, isSecret: true),
    CredentialField(name: "apiToken", label: Copy.apiTokenLabel, isSecret: true),
  ]

  public static let creditsPool = Pool(
    creditType: "credits", label: Copy.monthlyCreditsPoolLabel, unit: .credits, cap: nil
  )
  public static let pools = [creditsPool]

  public static func read(key: String, transport: ProviderTransport) async throws -> [PoolBalance] {
    // A secret without both values is never sent anywhere.
    guard let (apiKey, apiToken) = CredentialFields.pair(key, "apiKey", "apiToken") else {
      throw ProviderReadError.keyRejected
    }
    let response: HTTPResponse
    do {
      response = try await transport.get(subscriptionURL, headers: ["X-Api-Key": apiKey, "X-Api-Token": apiToken])
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
    let subscription = ((json as? [String: Any])?["data"] as? [Any])?.first as? [String: Any]
    let attributes = subscription?["attributes"] as? [String: Any]
    guard let quota = ProviderJSON.finiteOrNil(attributes?["monthly_credits_quota"]) else {
      throw ProviderReadError.missingField("data.attributes.monthly_credits_quota")
    }
    let used = ProviderJSON.finiteOrNil(attributes?["monthly_credits_used"]) ?? 0
    var pool = creditsPool
    // Cap 0 means "not in plan" here; a zero quota stays capless.
    if quota > 0 { pool.cap = quota }
    return [PoolBalance(pool: pool, balance: quota - used)]
  }
}
