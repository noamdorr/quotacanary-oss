import Foundation

/// Port of src/lib/adapters/enrichcrm.ts. Read-only: one GET per check.
/// SECURITY: Enrich CRM's balance endpoint authenticates via the `apiId`
/// query parameter only, so the key can surface in vendor request logs, the
/// same residual exposure as the web. The body is read even on a non-2xx: a
/// non-zero `code` or `success: false` is the vendor's own error. The balance
/// is the first of eight field names found at the top level, then under
/// `data`, then under `result`. One pool, no cap.
public enum EnrichCRM: HandWrittenProvider {
  public static let id: ProviderID = .enrichcrm
  public static let name = "Enrich CRM"
  public static let topupURL = "https://app.enrich-crm.com"
  // Enrich CRM's seed row: critical 500, low 1500 (the seed sets it).
  public static let defaultSettings = PoolSettings(monitored: true, low: 1500, critical: 500)

  public static let creditsPool = Pool(creditType: "credits", label: Copy.creditsPoolLabel, unit: .credits, cap: nil)
  public static let pools = [creditsPool]

  static let balanceFields = [
    "remainingCredits", "remaining_credits", "credits", "credit", "remaining", "balance", "creditBalance",
    "credit_balance",
  ]

  /// The key escaped like the web's `encodeURIComponent`.
  public static func balanceURL(key: String) -> URL {
    URL(string: "https://gateway.enrich-crm.com/api/credit_crm/v1/mine?apiId=\(CredentialFields.pathSegment(key))")!
  }

  public static func read(key: String, transport: ProviderTransport) async throws -> [PoolBalance] {
    let response: HTTPResponse
    do {
      response = try await transport.get(balanceURL(key: key), headers: ["Accept": "application/json"])
    } catch {
      throw ProviderReadError.unreachable
    }
    return try parse(response)
  }

  public static func parse(_ response: HTTPResponse) throws -> [PoolBalance] {
    guard let json = try? JSONSerialization.jsonObject(with: response.body, options: .fragmentsAllowed) else {
      try check(response)
      throw ProviderReadError.notJSON
    }
    if let error = vendorError(json) { throw error }
    try check(response)
    guard let balance = extractBalance(json) else {
      throw ProviderReadError.missingField("credits")
    }
    return [PoolBalance(pool: creditsPool, balance: balance)]
  }

  private static func check(_ response: HTTPResponse) throws {
    if response.status == 401 || response.status == 403 { throw ProviderReadError.keyRejected }
    if response.status == 429 { throw ProviderReadError.rateLimited }
    guard (200..<300).contains(response.status) else {
      throw ProviderReadError.httpStatus(response.status)
    }
  }

  private static func extractBalance(_ value: Any?) -> Double? {
    if let direct = ProviderJSON.finiteOrNil(value) { return direct }
    guard let object = value as? [String: Any] else { return nil }
    for field in balanceFields {
      if let candidate = ProviderJSON.finiteOrNil(object[field]) { return candidate }
    }
    return extractBalance(object["data"]) ?? extractBalance(object["result"])
  }

  private static func vendorError(_ value: Any) -> ProviderReadError? {
    guard let object = value as? [String: Any] else { return nil }
    let message = object["message"] as? String
    if let code = ProviderJSON.finiteOrNil(object["code"]), code != 0 {
      if message?.lowercased().contains("can't get credit") == true {
        return .reportedError(Copy.enrichCRMCreditsUnreadable)
      }
      return .reportedError(message ?? Copy.enrichCRMError)
    }
    if object["success"] as? Bool == false {
      return .reportedError(message ?? Copy.enrichCRMError)
    }
    return nil
  }
}
